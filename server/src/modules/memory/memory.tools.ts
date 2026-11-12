import { tool } from "@openai/agents";
import { z } from "zod";
import { resolveWhen, type DateRange } from "./time/date-resolver.js";
import { buildTimelines } from "./claims/claims.js";
import * as claimsRepo from "./claims/claims.repo.js";
import * as repo from "./memory.repo.js";
import { searchMemory as searchMemoryTurns } from "./search/memory.search.js";
import * as summaryRepo from "./summaries/summaries.repo.js";
import { summariesForRange } from "./summaries/summaries.js";
import type { Summary } from "./summaries/summary.table.js";

// Per-request data the tools need, passed to the agent run as its context.
export type AgentContext = {
  timeZone: string;
  now: Date;
  // Long-term facts about the user, already rendered and within budget.
  userProfile?: string;
  // Summary of this chat's turns that no longer fit in the recent window.
  chatSummary?: string;
};

const MAX_TURNS = 20;
// Long answers are cut so a few turns cannot fill the prompt; the full text stays in the database.
const MAX_REPLY_CHARS = 1500;

function formatLocal(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);
}

function present(turn: repo.MemoryTurn, timeZone: string) {
  const long = turn.assistantText.length > MAX_REPLY_CHARS;
  return {
    id: turn.id,
    askedAt: formatLocal(turn.askedAt, timeZone),
    userAsked: turn.userText,
    assistantReplied: long ? `${turn.assistantText.slice(0, MAX_REPLY_CHARS)}...` : turn.assistantText,
    replyWasShortened: long,
    sourcesCited: turn.sources,
  };
}

// A day with more turns than this is answered with its summary (and pointers to the turns)
// instead of every question and answer.
const MAX_RAW_DAY_TURNS = 10;

function presentSummary(s: Summary, pointers: number[]) {
  return {
    summaryId: s.id,
    level: s.level,
    period: s.periodStart === s.periodEnd ? s.periodStart : `${s.periodStart} to ${s.periodEnd}`,
    conversationsCovered: s.turnCount,
    summary: s.text,
    // The raw turns (for a day) or the lower-level summaries (otherwise) this was built from.
    [s.level === "day" ? "turnIds" : "childSummaryIds"]: pointers,
  };
}

async function presentSummaries(list: Summary[]) {
  const pointers = await summaryRepo.getPointers(list.map((s) => s.id));
  return list.map((s) => presentSummary(s, pointers.get(s.id) ?? []));
}

const DETAIL_HINT =
  "These are summaries. If the user needs exact wording or details, call expand_summary with a summaryId to get what it was built from.";

function describeRange(range: DateRange, timeZone: string) {
  return { period: range.label, timeZone };
}

const json = (value: unknown) => JSON.stringify(value);

export const recallByDate = tool({
  name: "recall_by_date",
  description:
    "Look up what the user asked you, and what you answered, during a past period. Pass the user's own " +
    'words for the date, such as "yesterday", "last Tuesday", "3 November", "last week" or "2 weeks ago". ' +
    "The date is worked out in code, so do not convert it yourself. Returns the saved questions and answers " +
    '(or, for a week, month, year or a busy day, summaries of them with pointers to the details), or "no record" if nothing was asked in that period.',
  parameters: z.object({
    when: z.string().describe("The date or period, in the user's own words."),
  }),
  async execute({ when }, runContext) {
    const ctx = runContext?.context as AgentContext;
    const resolved = resolveWhen(when, { now: ctx.now, timeZone: ctx.timeZone });
    if (!resolved.ok) return json({ error: resolved.reason });

    const { range } = resolved;
    const noRecord = () =>
      json({
        ...describeRange(range, ctx.timeZone),
        result: "no record",
        note: "Nothing was saved for this period. Tell the user you have no record of it. Do not guess.",
      });

    // Longer periods are answered from summaries, one level up from the raw turns.
    if (range.granularity !== "day") {
      const { summaries, truncated } = await summariesForRange(range, ctx.timeZone);
      if (summaries.length === 0) return noRecord();
      return json({
        ...describeRange(range, ctx.timeZone),
        summaries: await presentSummaries(summaries),
        note: DETAIL_HINT + (truncated ? " Only the most recent days of the period are shown." : ""),
      });
    }

    const { turns } = await repo.getTurnsBetween(range.from, range.to, MAX_RAW_DAY_TURNS + 1);
    if (turns.length > MAX_RAW_DAY_TURNS) {
      const { summaries } = await summariesForRange(range, ctx.timeZone);
      if (summaries.length > 0) {
        return json({
          ...describeRange(range, ctx.timeZone),
          summaries: await presentSummaries(summaries),
          note: "A busy day, so this is its summary. " + DETAIL_HINT,
        });
      }
    }
    if (turns.length === 0) return noRecord();
    return json({
      ...describeRange(range, ctx.timeZone),
      turns: turns.map((t) => present(t, ctx.timeZone)),
    });
  },
});

export const searchMemory = tool({
  name: "search_memory",
  description:
    "Search the user's past conversations by topic, for example when they ask when they asked about " +
    'something, or refer to "the CRM tools we shortlisted" or "my Postgres question". Matches words, ' +
    "best match first. It matches on exact words and on meaning, so a paraphrase finds it too. Optionally limit it to a period. Returns the saved questions and answers with their " +
    'dates and cited sources, or "no record" if nothing matches.',
  parameters: z.object({
    query: z.string().describe("A few keywords for the topic, e.g. 'postgres hosting pricing'."),
    when: z
      .string()
      .nullable()
      .describe("Optional period to search within, in the user's own words, e.g. 'last week'. Null for all time."),
  }),
  async execute({ query, when }, runContext) {
    const ctx = runContext?.context as AgentContext;
    let range: DateRange | undefined;
    if (when) {
      const resolved = resolveWhen(when, { now: ctx.now, timeZone: ctx.timeZone });
      if (!resolved.ok) return json({ error: resolved.reason });
      range = resolved.range;
    }

    const found = await searchMemoryTurns(query, range, MAX_TURNS);
    if (found.length === 0) {
      return json({
        result: "no record",
        ...(range ? describeRange(range, ctx.timeZone) : {}),
        note: "No saved conversation matches. Tell the user you have no record of it. Do not guess.",
      });
    }
    return json({
      ...(range ? describeRange(range, ctx.timeZone) : {}),
      turns: found.map((t) => present(t, ctx.timeZone)),
    });
  },
});

export const expandSummary = tool({
  name: "expand_summary",
  description:
    "Open a summary returned by recall_by_date to see what it was built from: for a day, the saved questions and " +
    "answers; for a week, month or year, the shorter summaries beneath it (which can be expanded again).",
  parameters: z.object({ summaryId: z.number().int().describe("The summaryId from a previous result.") }),
  async execute({ summaryId }, runContext) {
    const ctx = runContext?.context as AgentContext;
    const summary = await summaryRepo.getSummaryById(summaryId);
    if (!summary) return json({ error: "No summary with that id." });

    if (summary.level === "day") {
      const turns = await summaryRepo.getSummaryTurns(summaryId);
      return json({ period: summary.periodStart, turns: turns.slice(0, MAX_TURNS).map((t) => present(t, ctx.timeZone)) });
    }
    const children = await summaryRepo.getChildSummaries(summaryId);
    return json({
      period: `${summary.periodStart} to ${summary.periodEnd}`,
      summaries: await presentSummaries(children),
      note: DETAIL_HINT,
    });
  },
});

const MAX_CLAIMS = 60;

export const getClaims = tool({
  name: "get_claims",
  description:
    "Get the exact facts (prices, plans, versions, limits...) you stated in past answers, as saved records with the " +
    "date each was stated and its source. Use it before checking whether something has changed: it gives the old " +
    "values to compare against fresh web results. Look up by topic, by period, or both. Each item lists a history " +
    "of values for one thing, oldest first, and marks where the value changed.",
  parameters: z.object({
    topic: z.string().nullable().describe("Keywords for what the facts are about, e.g. 'CRM tool pricing'. Null for any topic."),
    when: z
      .string()
      .nullable()
      .describe("Period the facts were stated in, in the user's own words, e.g. '3 November' or 'last Tuesday'. Null for any time."),
  }),
  async execute({ topic, when }, runContext) {
    const ctx = runContext?.context as AgentContext;
    if (!topic && !when) return json({ error: "Give a topic, a period, or both." });

    let range: DateRange | undefined;
    if (when) {
      const resolved = resolveWhen(when, { now: ctx.now, timeZone: ctx.timeZone });
      if (!resolved.ok) return json({ error: resolved.reason });
      range = resolved.range;
    }

    const rows = await claimsRepo.findClaims(topic, range, MAX_CLAIMS);
    if (rows.length === 0) {
      return json({
        result: "no record",
        ...(range ? describeRange(range, ctx.timeZone) : {}),
        note: "No saved facts match. Fall back to recall_by_date or search_memory for the earlier answer.",
      });
    }
    return json({
      ...(range ? describeRange(range, ctx.timeZone) : {}),
      facts: buildTimelines(rows).map((t) => ({
        topic: t.topic,
        subject: t.subject,
        attribute: t.attribute,
        history: t.entries.map((e) => ({
          value: e.value,
          statedOn: formatLocal(e.asOf, ctx.timeZone),
          source: e.sourceUrl,
          changedFromPrevious: e.changedFromPrevious,
        })),
      })),
    });
  },
});

export const memoryTools = [recallByDate, expandSummary, searchMemory, getClaims];
