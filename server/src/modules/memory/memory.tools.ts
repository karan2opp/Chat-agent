import { tool } from "@openai/agents";
import { z } from "zod";
import { resolveWhen, type DateRange } from "./date-resolver.js";
import { buildTimelines } from "./claims.js";
import * as claimsRepo from "./claims.repo.js";
import * as repo from "./memory.repo.js";

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
    'with the web sources they cited, or "no record" if nothing was asked in that period.',
  parameters: z.object({
    when: z.string().describe("The date or period, in the user's own words."),
  }),
  async execute({ when }, runContext) {
    const ctx = runContext?.context as AgentContext;
    const resolved = resolveWhen(when, { now: ctx.now, timeZone: ctx.timeZone });
    if (!resolved.ok) return json({ error: resolved.reason });

    const { turns, more } = await repo.getTurnsBetween(resolved.range.from, resolved.range.to, MAX_TURNS);
    if (turns.length === 0) {
      return json({
        ...describeRange(resolved.range, ctx.timeZone),
        result: "no record",
        note: "Nothing was saved for this period. Tell the user you have no record of it. Do not guess.",
      });
    }
    return json({
      ...describeRange(resolved.range, ctx.timeZone),
      turns: turns.map((t) => present(t, ctx.timeZone)),
      ...(more ? { note: `Showing the first ${MAX_TURNS} turns of the period; there are more.` } : {}),
    });
  },
});

export const searchMemory = tool({
  name: "search_memory",
  description:
    "Search the user's past conversations by topic, for example when they ask when they asked about " +
    'something, or refer to "the CRM tools we shortlisted" or "my Postgres question". Matches words, ' +
    "best match first. Optionally limit it to a period. Returns the saved questions and answers with their " +
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

    const found = await repo.searchTurns(query, range, MAX_TURNS);
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

export const memoryTools = [recallByDate, searchMemory, getClaims];
