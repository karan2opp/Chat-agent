import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateTokens, fitRecent, truncateToTokens, turnsToCompact, unsummarised } from "./context-window.js";

// Each of these turns costs 20 tokens (40 + 40 characters).
const turn = (n: number) => ({ id: n, userText: "q".repeat(40), assistantText: "a".repeat(40) });

describe("fitRecent", () => {
  it("keeps everything that fits", () => {
    const turns = [turn(1), turn(2), turn(3)];
    const { kept, dropped } = fitRecent(turns, 100);
    assert.equal(kept.length, 3);
    assert.equal(dropped.length, 0);
  });

  it("drops the oldest turns first", () => {
    const { kept, dropped } = fitRecent([turn(1), turn(2), turn(3), turn(4)], 45);
    assert.deepEqual(kept.map((t) => t.id), [3, 4]);
    assert.deepEqual(dropped.map((t) => t.id), [1, 2]);
  });

  it("always keeps the newest turn, even over budget", () => {
    const { kept, dropped } = fitRecent([turn(1), turn(2)], 5);
    assert.deepEqual(kept.map((t) => t.id), [2]);
    assert.deepEqual(dropped.map((t) => t.id), [1]);
  });

  it("handles an empty history", () => {
    assert.deepEqual(fitRecent([], 100), { kept: [], dropped: [] });
  });
});

describe("token helpers", () => {
  it("estimates about four characters per token", () => {
    assert.equal(estimateTokens("abcdefgh"), 2);
    assert.equal(estimateTokens(""), 0);
  });

  it("truncates to a budget and marks the cut", () => {
    assert.equal(truncateToTokens("short", 10), "short");
    assert.equal(truncateToTokens("x".repeat(100), 5).length, 20);
    assert.ok(truncateToTokens("x".repeat(100), 5).endsWith("…"));
  });
});

describe("unsummarised", () => {
  const turns = [1, 2, 3, 4, 5, 6].map(turn);

  it("returns every turn when there is no summary yet", () => {
    assert.deepEqual(unsummarised(turns, null).map((t) => t.id), [1, 2, 3, 4, 5, 6]);
  });

  it("returns only the turns after the ones the summary covers", () => {
    assert.deepEqual(unsummarised(turns, 3).map((t) => t.id), [4, 5, 6]);
  });
});

describe("turnsToCompact", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => turn(i + 1));

  it("does nothing while the turns fit in 85% of the budget", () => {
    // 6 turns cost 120 tokens; 85% of 150 is 127.5.
    assert.deepEqual(turnsToCompact(ids(6), 150, null), []);
  });

  it("past 85%, folds in the oldest turns until the rest fit in half the budget", () => {
    // 120 tokens > 85% of 100. Half the budget (50) holds the newest two turns (40 tokens).
    assert.deepEqual(turnsToCompact(ids(6), 100, null).map((t) => t.id), [1, 2, 3, 4]);
  });

  it("leaves room after compacting, so the next turns do not trigger it again", () => {
    // Summary covers 1-4; turns 5-7 cost 60 tokens, under 85.
    assert.deepEqual(turnsToCompact(ids(7), 100, 4), []);
  });

  it("compacts again once the window fills back up, starting after the summary", () => {
    // Summary covers 1-4; turns 5-10 cost 120 tokens again.
    assert.deepEqual(turnsToCompact(ids(10), 100, 4).map((t) => t.id), [5, 6, 7, 8]);
  });
});
