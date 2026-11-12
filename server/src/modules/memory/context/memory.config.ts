// Token budgets for what goes into the prompt. They are caps, not targets, and every one can be
// changed from the environment without touching code. The defaults are deliberately small: the
// model has a very large window, but every token is paid for on every turn and long prompts
// make answers less reliable. Anything that does not fit is fetched from the database on demand.

function fromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Read on every call so a change to the environment (or a test) takes effect immediately.
export function budgets() {
  return {
    // Long-term facts about the user, always in the prompt.
    coreTokens: fromEnv("MEMORY_CORE_TOKENS", 3_000),
    // Ray's own backstory, always in the prompt so he tells it the same way every time.
    personaTokens: fromEnv("MEMORY_PERSONA_TOKENS", 1_500),
    // Summary of the turns of this chat that no longer fit in the recent window.
    summaryTokens: fromEnv("MEMORY_SUMMARY_TOKENS", 4_000),
    // Word-for-word recent turns of this chat.
    recentTokens: fromEnv("MEMORY_RECENT_TOKENS", 40_000),
  };
}
