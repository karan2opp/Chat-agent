import { generateText } from "../../common/llm/llm.js";
import type { Turn } from "../chat/chat.table.js";
import { dayBounds, eachDay, type DateRange } from "./date-resolver.js";
import * as repo from "./summaries.repo.js";
import type { Summary, SummaryLevel } from "./summary.table.js";

// Day, week, month and year summaries of past conversations, built from the level below and
// cached. A day summary is built from the raw turns; a week or month from its day summaries; a
// year from its month summaries. Periods with no conversations have no summary at all.
// Summaries are built the first time they are needed (or in the background for finished days)
// and rebuilt only when a newer turn lands in their period.

const MAX_SPAN_DAYS = 92;
const CONCURRENCY = 4;
// How much of each message goes into the model when summarising a day.
const QUESTION_CHARS = 400;
const ANSWER_CHARS = 700;

const DAY_INSTRUCTIONS = `You summarise one day of a user's conversations with an AI assistant, so the day can be recalled later without rereading it.
Write 60-200 words of plain prose or short bullets. Cover what the user asked about, the concrete answers, figures, names, shortlists and decisions (keep exact numbers and names), and anything left open. No preamble, no mention of "the user" more than needed.`;

const ROLLUP_INSTRUCTIONS = `You combine several shorter summaries of a user's conversations with an AI assistant into one summary of a longer period.
Write 80-250 words of plain prose or short bullets. Keep concrete names, figures and decisions, and say which day each came from. Group related topics. No preamble.`;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function formatTurnsForSummary(turns: Turn[], timeZone: string): string {
  return turns
    .map((t) => {
      const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(t.askedAt);
      return `[${time}] User: ${clip(t.userText, QUESTION_CHARS)}\nAssistant: ${clip(t.assistantText, ANSWER_CHARS)}`;
    })
    .join("\n\n");
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

async function ensureDay(day: string, timeZone: string): Promise<Summary | null> {
  const { from, to } = dayBounds(day, day, timeZone);
  const turns = await repo.getTurnsInRange(from, to);
  if (turns.length === 0) return null;

  const throughTurnId = Math.max(...turns.map((t) => t.id));
  const existing = await repo.getSummary("day", day, timeZone);
  if (existing && existing.throughTurnId === throughTurnId && existing.turnCount === turns.length) return existing;

  const text = await generateText(DAY_INSTRUCTIONS, `Date: ${day}\n\n${formatTurnsForSummary(turns, timeZone)}`);
  return repo.saveDaySummary(
    { level: "day", periodStart: day, periodEnd: day, timeZone, text, turnCount: turns.length, throughTurnId },
    turns.map((t) => t.id),
  );
}

function monthsOfYear(year: number): { first: string; last: string }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const last = new Date(Date.UTC(year, i + 1, 0)).getUTCDate();
    const month = String(i + 1).padStart(2, "0");
    return { first: `${year}-${month}-01`, last: `${year}-${month}-${String(last).padStart(2, "0")}` };
  });
}

async function ensureParent(level: Exclude<SummaryLevel, "day">, first: string, last: string, timeZone: string): Promise<Summary | null> {
  // A year is built from its months; a week or month from its days.
  const children =
    level === "year"
      ? await mapLimit(monthsOfYear(Number(first.slice(0, 4))), CONCURRENCY, (m) => ensureParent("month", m.first, m.last, timeZone))
      : await mapLimit(eachDay(first, last), CONCURRENCY, (day) => ensureDay(day, timeZone));
  const built = children.filter((c): c is Summary => c !== null);
  if (built.length === 0) return null;

  const throughTurnId = Math.max(...built.map((c) => c.throughTurnId));
  const turnCount = built.reduce((sum, c) => sum + c.turnCount, 0);
  const existing = await repo.getSummary(level, first, timeZone);
  if (existing && existing.throughTurnId === throughTurnId && existing.turnCount === turnCount) return existing;

  const input = built.map((c) => `${c.periodStart === c.periodEnd ? c.periodStart : `${c.periodStart} to ${c.periodEnd}`}:\n${c.text}`).join("\n\n");
  const text = await generateText(ROLLUP_INSTRUCTIONS, `Period: ${first} to ${last}\n\n${input}`);
  return repo.saveParentSummary(
    { level, periodStart: first, periodEnd: last, timeZone, text, turnCount, throughTurnId },
    built.map((c) => c.id),
  );
}

export function ensureSummary(level: SummaryLevel, first: string, last: string, timeZone: string): Promise<Summary | null> {
  return level === "day" ? ensureDay(first, timeZone) : ensureParent(level, first, last, timeZone);
}

// The summaries that answer a question about a period: one for a week, month or year, or one per
// day with conversations for any other run of days.
export async function summariesForRange(range: DateRange, timeZone: string): Promise<{ summaries: Summary[]; truncated: boolean }> {
  if (range.granularity === "span" || range.granularity === "day") {
    const days = eachDay(range.firstDay, range.lastDay);
    const recent = days.slice(-MAX_SPAN_DAYS);
    const built = await mapLimit(recent, CONCURRENCY, (day) => ensureDay(day, timeZone));
    return { summaries: built.filter((s): s is Summary => s !== null), truncated: days.length > recent.length };
  }
  const one = await ensureParent(range.granularity, range.firstDay, range.lastDay, timeZone);
  return { summaries: one ? [one] : [], truncated: false };
}

// Builds summaries for recent finished days that do not have a current one yet, so that asking
// about them later is instant. Runs in the background; builds at most `maxBuilds` per call.
export async function summariseRecentDays(timeZone: string, now: Date, maxBuilds = 3): Promise<void> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  let built = 0;
  for (const day of await repo.getActiveDays(timeZone, since)) {
    if (day >= today) continue;
    const before = await repo.getSummary("day", day, timeZone);
    await ensureDay(day, timeZone);
    const after = await repo.getSummary("day", day, timeZone);
    if (after && (!before || before.updatedAt.getTime() !== after.updatedAt.getTime())) built++;
    if (built >= maxBuilds) break;
  }
}

