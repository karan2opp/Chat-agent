// Fitting conversation history into a token budget.

// A rough estimate: English text averages about four characters per token. It errs a little high
// for code and a little low for other scripts; the budgets leave plenty of slack for that.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

type HistoryTurn = { id?: number; userText: string; assistantText: string };

// Keeps the newest turns that fit in the budget and reports the older ones that did not. The
// newest turn is always kept, even if it alone is over budget, so the conversation never loses
// its immediate context.
export function fitRecent<T extends HistoryTurn>(
  turns: T[],
  budgetTokens: number,
): { kept: T[]; dropped: T[] } {
  let used = 0;
  let firstKept = turns.length;
  for (let i = turns.length - 1; i >= 0; i--) {
    const cost = estimateTokens(turns[i].userText) + estimateTokens(turns[i].assistantText);
    if (used + cost > budgetTokens && firstKept < turns.length) break;
    used += cost;
    firstKept = i;
  }
  return { kept: turns.slice(firstKept), dropped: turns.slice(0, firstKept) };
}

// The turns the chat's summary does not cover yet. These are the ones sent word for word.
export function unsummarised<T extends HistoryTurn & { id: number }>(turns: T[], summarisedThroughId: number | null): T[] {
  return summarisedThroughId === null ? turns : turns.filter((t) => t.id > summarisedThroughId);
}

// Compaction happens in batches, not one turn at a time. Once the unsummarised turns pass
// COMPACT_AT of the recent budget, the oldest of them are folded into the summary until the rest
// fit in COMPACT_TO. Between compactions the start of the prompt (summary and older turns) does
// not change, so a provider that caches a repeated prompt start can reuse it, and the summary is
// rewritten only every so many turns. Starting before the budget is full gives the background
// step time to finish before the next message needs the room.
const COMPACT_AT = 0.85;
const COMPACT_TO = 0.5;

// The turns to fold into the summary now, oldest first; empty while there is still room.
export function turnsToCompact<T extends HistoryTurn & { id: number }>(
  turns: T[],
  recentBudgetTokens: number,
  summarisedThroughId: number | null,
): T[] {
  const pending = unsummarised(turns, summarisedThroughId);
  const used = pending.reduce((sum, t) => sum + estimateTokens(t.userText) + estimateTokens(t.assistantText), 0);
  if (used <= recentBudgetTokens * COMPACT_AT) return [];
  return fitRecent(pending, Math.floor(recentBudgetTokens * COMPACT_TO)).dropped;
}
