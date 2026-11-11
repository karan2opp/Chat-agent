import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidTimeZone, resolveWhen } from "./date-resolver.js";

// Wednesday 11 November 2026, 10:00 UTC.
const NOW = new Date("2026-11-11T10:00:00Z");

function resolve(phrase: string, timeZone = "UTC", now = NOW) {
  const result = resolveWhen(phrase, { now, timeZone });
  assert.ok(result.ok, result.ok ? "" : result.reason);
  return { from: result.range.from.toISOString(), to: result.range.to.toISOString(), label: result.range.label };
}

function day(from: string, to: string) {
  return { from: `${from}T00:00:00.000Z`, to: `${to}T00:00:00.000Z` };
}

describe("resolveWhen: single days", () => {
  it("today and yesterday", () => {
    assert.deepEqual(resolve("today"), { ...day("2026-11-11", "2026-11-12"), label: "Wednesday 11 November 2026" });
    assert.deepEqual(resolve("yesterday"), { ...day("2026-11-10", "2026-11-11"), label: "Tuesday 10 November 2026" });
    assert.deepEqual(resolve("the day before yesterday").from, "2026-11-09T00:00:00.000Z");
  });

  it("N days ago", () => {
    assert.equal(resolve("3 days ago").from, "2026-11-08T00:00:00.000Z");
    assert.equal(resolve("a day ago").from, "2026-11-10T00:00:00.000Z");
  });

  it("bare and 'last' weekday mean the most recent one before today", () => {
    assert.equal(resolve("Monday").from, "2026-11-09T00:00:00.000Z");
    assert.equal(resolve("on Monday").from, "2026-11-09T00:00:00.000Z");
    assert.equal(resolve("last Tuesday").from, "2026-11-10T00:00:00.000Z");
    // Today is a Wednesday, so "Wednesday" is a week ago, not today.
    assert.equal(resolve("last Wednesday").from, "2026-11-04T00:00:00.000Z");
    assert.equal(resolve("wednesday").from, "2026-11-04T00:00:00.000Z");
  });

  it("'this' weekday is inside the current Monday-to-Sunday week", () => {
    assert.equal(resolve("this Monday").from, "2026-11-09T00:00:00.000Z");
    assert.equal(resolve("this Friday").from, "2026-11-13T00:00:00.000Z");
  });

  it("day and month, with or without a year", () => {
    assert.equal(resolve("3 November").from, "2026-11-03T00:00:00.000Z");
    assert.equal(resolve("3rd of November").from, "2026-11-03T00:00:00.000Z");
    assert.equal(resolve("Nov 3").from, "2026-11-03T00:00:00.000Z");
    assert.equal(resolve("November 3rd, 2025").from, "2025-11-03T00:00:00.000Z");
    assert.equal(resolve("2026-11-03").from, "2026-11-03T00:00:00.000Z");
  });

  it("a day and month later this year refers to last year", () => {
    assert.equal(resolve("25 December").from, "2025-12-25T00:00:00.000Z");
  });

  it("29 February falls back to the most recent leap year", () => {
    assert.equal(resolve("29 February").from, "2024-02-29T00:00:00.000Z");
  });
});

describe("resolveWhen: ranges", () => {
  it("weeks start on Monday", () => {
    assert.deepEqual(resolve("this week"), {
      ...day("2026-11-09", "2026-11-16"),
      label: "Week of 9 Nov 2026 to 15 Nov 2026",
    });
    assert.deepEqual(resolve("last week").from, "2026-11-02T00:00:00.000Z");
    assert.deepEqual(resolve("last week").to, "2026-11-09T00:00:00.000Z");
    assert.equal(resolve("2 weeks ago").from, "2026-10-26T00:00:00.000Z");
  });

  it("months", () => {
    assert.deepEqual(resolve("this month"), { ...day("2026-11-01", "2026-12-01"), label: "November 2026" });
    assert.deepEqual(resolve("last month"), { ...day("2026-10-01", "2026-11-01"), label: "October 2026" });
    assert.deepEqual(resolve("October").from, "2026-10-01T00:00:00.000Z");
    // A month later in the year than now means last year's.
    assert.deepEqual(resolve("December"), { ...day("2025-12-01", "2026-01-01"), label: "December 2025" });
    assert.deepEqual(resolve("March 2024").from, "2024-03-01T00:00:00.000Z");
    assert.equal(resolve("3 months ago").from, "2026-08-01T00:00:00.000Z");
  });

  it("years", () => {
    assert.deepEqual(resolve("last year"), { ...day("2025-01-01", "2026-01-01"), label: "2025" });
    assert.equal(resolve("2024").from, "2024-01-01T00:00:00.000Z");
  });

  it("last N days includes today", () => {
    assert.deepEqual(resolve("last 7 days"), {
      ...day("2026-11-04", "2026-11-12"),
      label: "4 Nov 2026 to 11 Nov 2026",
    });
  });
});

describe("resolveWhen: time zones", () => {
  it("uses the user's calendar day, not UTC's", () => {
    // 01:30 on 11 Nov in Kolkata is still 10 Nov in UTC.
    const lateNight = new Date("2026-11-10T20:00:00Z");
    assert.equal(resolve("today", "Asia/Kolkata", lateNight).label, "Wednesday 11 November 2026");
    assert.equal(resolve("today", "UTC", lateNight).label, "Tuesday 10 November 2026");
    // Day boundaries sit at local midnight: 00:00 IST is 18:30 UTC the evening before.
    assert.equal(resolve("3 November", "Asia/Kolkata").from, "2026-11-02T18:30:00.000Z");
    assert.equal(resolve("3 November", "Asia/Kolkata").to, "2026-11-03T18:30:00.000Z");
  });

  it("handles daylight-saving changes", () => {
    // US clocks went back on 1 Nov 2026, so that day is 25 hours long.
    const dst = resolve("1 November", "America/New_York");
    assert.equal(dst.from, "2026-11-01T04:00:00.000Z");
    assert.equal(dst.to, "2026-11-02T05:00:00.000Z");
    assert.equal(resolve("3 November", "America/New_York").from, "2026-11-03T05:00:00.000Z");
  });

  it("validates zone names", () => {
    assert.equal(isValidTimeZone("Asia/Kolkata"), true);
    assert.equal(isValidTimeZone("Not/AZone"), false);
  });
});

describe("resolveWhen: failures", () => {
  it("rejects impossible dates", () => {
    assert.equal(resolveWhen("31 February", { now: NOW, timeZone: "UTC" }).ok, false);
    assert.equal(resolveWhen("2026-02-30", { now: NOW, timeZone: "UTC" }).ok, false);
  });

  it("rejects phrases it does not understand, with a hint", () => {
    const result = resolveWhen("sometime soonish", { now: NOW, timeZone: "UTC" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /yesterday/);
  });
});
