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

// Share of the recent-turns budget kept word for word when deciding what has "left" the window.
// Summarising a little earlier than the prompt actually drops turns means the summary is ready
// before it is needed; the small overlap with the window is harmless.
const SUMMARISE_AT = 0.85;

// The turns that have left the recent window and are not yet in the chat's summary.
export function turnsToSummarise<T extends HistoryTurn & { id: number }>(
  turns: T[],
  recentBudgetTokens: number,
  summarisedThroughId: number | null,
): T[] {
  const { dropped } = fitRecent(turns, Math.floor(recentBudgetTokens * SUMMARISE_AT));
  return dropped.filter((t) => summarisedThroughId === null || t.id > summarisedThroughId);
}
