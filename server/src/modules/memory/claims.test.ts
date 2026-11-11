import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Claim } from "./claim.table.js";
import { buildTimelines, sameValue } from "./claims.js";

let nextId = 1;
const claim = (over: Partial<Claim>): Claim => ({
  id: nextId++,
  turnId: 1,
  topic: "CRM pricing",
  subject: "Pipedrive",
  attribute: "Essential plan price",
  value: "$14 per user per month",
  amount: 14,
  sourceUrl: null,
  asOf: new Date("2026-11-03T10:00:00Z"),
  ...over,
});

describe("sameValue", () => {
  it("compares numbers numerically, ignoring wording", () => {
    assert.equal(sameValue({ value: "$14/user/month", amount: 14 }, { value: "14 USD per user per month", amount: 14 }), true);
    assert.equal(sameValue({ value: "$14", amount: 14 }, { value: "$15", amount: 15 }), false);
  });

  it("falls back to wording when there is no number", () => {
    assert.equal(sameValue({ value: "Free tier", amount: null }, { value: "free  tier.", amount: null }), true);
    assert.equal(sameValue({ value: "Free tier", amount: null }, { value: "No free tier", amount: null }), false);
  });
});

describe("buildTimelines", () => {
  it("groups by subject and attribute, oldest first, and flags real changes only", () => {
    const rows = [
      claim({ value: "$16 per user per month", amount: 16, asOf: new Date("2026-11-10T10:00:00Z") }),
      claim({}),
      claim({ value: "14 USD / user / month", amount: 14, asOf: new Date("2026-11-06T10:00:00Z") }),
      claim({ subject: "Zoho CRM", value: "$14", amount: 14 }),
    ];
    const timelines = buildTimelines(rows);
    assert.equal(timelines.length, 2);

    const pipedrive = timelines.find((t) => t.subject === "Pipedrive")!;
    assert.deepEqual(pipedrive.entries.map((e) => e.amount), [14, 14, 16]);
    assert.deepEqual(pipedrive.entries.map((e) => e.changedFromPrevious), [false, false, true]);
  });

  it("treats subject and attribute case and punctuation as the same key", () => {
    const rows = [claim({ subject: "Pipedrive" }), claim({ subject: "pipedrive.", asOf: new Date("2026-11-04T00:00:00Z") })];
    assert.equal(buildTimelines(rows).length, 1);
  });

  it("returns nothing for no claims", () => {
    assert.deepEqual(buildTimelines([]), []);
  });
});
