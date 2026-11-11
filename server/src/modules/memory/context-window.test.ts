import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateTokens, fitRecent, truncateToTokens, turnsToSummarise } from "./context-window.js";

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

describe("turnsToSummarise", () => {
  const turns = [1, 2, 3, 4, 5, 6].map(turn);

  it("returns nothing while everything fits", () => {
    assert.deepEqual(turnsToSummarise(turns, 1000, null), []);
  });

  it("returns the turns that left the window, oldest first", () => {
    // 6 turns cost 120 tokens; a budget of 60 * 0.85 = 51 keeps the newest two.
    assert.deepEqual(turnsToSummarise(turns, 60, null).map((t) => t.id), [1, 2, 3, 4]);
  });

  it("skips turns the summary already covers", () => {
    assert.deepEqual(turnsToSummarise(turns, 60, 2).map((t) => t.id), [3, 4]);
    assert.deepEqual(turnsToSummarise(turns, 60, 4), []);
  });
});
