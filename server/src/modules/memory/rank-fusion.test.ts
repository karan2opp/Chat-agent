import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fuseRanked } from "./rank-fusion.js";

const ids = (list: { id: number }[]) => list.map((i) => i.id);
const row = (id: number) => ({ id });
const idOf = (r: { id: number }) => r.id;

describe("fuseRanked", () => {
  it("puts items found by both lists above items found by one", () => {
    const keyword = [row(1), row(2), row(3)];
    const meaning = [row(9), row(3), row(8)];
    assert.equal(ids(fuseRanked([keyword, meaning], idOf))[0], 3);
  });

  it("lists every item once", () => {
    const fused = fuseRanked([[row(1), row(2)], [row(2), row(3)]], idOf);
    assert.deepEqual(ids(fused).sort(), [1, 2, 3]);
  });

  it("keeps a single list's order", () => {
    assert.deepEqual(ids(fuseRanked([[row(5), row(4), row(6)]], idOf)), [5, 4, 6]);
  });

  it("returns nothing for empty lists", () => {
    assert.deepEqual(fuseRanked<{ id: number }>([[], []], idOf), []);
  });

  it("breaks ties toward the newer item", () => {
    assert.deepEqual(ids(fuseRanked([[row(1)], [row(2)]], idOf)), [2, 1]);
  });
});
