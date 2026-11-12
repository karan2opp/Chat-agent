import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FactKind, UserFact } from "./fact.table.js";
import { planFactChanges, renderProfile, type FactOp } from "./facts.js";

let nextId = 1;
const fact = (key: string, value: string, kind: FactKind = "profile", createdAt = "2026-11-01T00:00:00Z"): UserFact => ({
  id: nextId++,
  kind,
  key,
  value,
  sourceTurnId: null,
  createdAt: new Date(createdAt),
  supersededAt: null,
});
const set = (key: string, value: string, kind: FactKind = "profile"): FactOp => ({ action: "set", kind, key, value });

describe("planFactChanges", () => {
  it("adds a new fact", () => {
    assert.deepEqual(planFactChanges([], [set("Name", "Karan")]), {
      supersede: [],
      insert: [{ kind: "profile", key: "name", value: "Karan" }],
    });
  });

  it("does nothing when the value is unchanged", () => {
    const active = [fact("name", "Karan")];
    assert.deepEqual(planFactChanges(active, [set("name", "  karan ")]), { supersede: [], insert: [] });
  });

  it("retires the old value when a fact changes", () => {
    const active = [fact("location", "Delhi")];
    const plan = planFactChanges(active, [set("location", "Pune")]);
    assert.deepEqual(plan.supersede, [active[0].id]);
    assert.deepEqual(plan.insert, [{ kind: "profile", key: "location", value: "Pune" }]);
  });

  it("removes a fact without adding anything", () => {
    const active = [fact("employer", "Acme")];
    const plan = planFactChanges(active, [{ action: "remove", kind: "profile", key: "employer", value: "" }]);
    assert.deepEqual(plan, { supersede: [active[0].id], insert: [] });
  });

  it("uses the last of several changes to the same key in one batch", () => {
    const plan = planFactChanges([], [set("role", "student"), set("role", "engineer")]);
    assert.deepEqual(plan.insert, [{ kind: "profile", key: "role", value: "engineer" }]);
  });

  it("ignores empty values and keys", () => {
    assert.deepEqual(planFactChanges([], [set("", "x"), set("role", "  ")]), { supersede: [], insert: [] });
  });
});

describe("renderProfile", () => {
  const replaced = (key: string, value: string, createdAt: string, kind: FactKind = "project"): UserFact => ({
    ...fact(key, value, kind, createdAt),
    supersededAt: new Date("2026-11-13T00:00:00Z"),
  });

  it("groups facts by kind", () => {
    const text = renderProfile(
      [fact("name", "Karan"), fact("project:minimi", "chat agent with memory", "project"), fact("tone", "concise", "preference")],
      [],
      1000,
      "UTC",
    );
    assert.equal(
      text,
      "About them:\n- name: Karan\nPreferences:\n- tone: concise\nProjects:\n- project:minimi: chat agent with memory",
    );
  });

  it("drops the oldest facts first when over budget", () => {
    const old = fact("hobby", "x".repeat(200), "other", "2026-01-01T00:00:00Z");
    const recent = fact("name", "Karan", "profile", "2026-11-01T00:00:00Z");
    const text = renderProfile([old, recent], [], 20, "UTC");
    assert.ok(text.includes("name: Karan"));
    assert.ok(!text.includes("hobby"));
  });

  it("is empty with no facts", () => {
    assert.equal(renderProfile([], [], 100, "UTC"), "");
  });

  it("shows what a fact replaced, with dates, so plan and progress are both visible", () => {
    const now = fact("project:abhyas", "has one SDE intern and one growth intern", "project", "2026-11-12T10:43:00Z");
    const before = replaced("project:abhyas", "plans to hire two SDE interns and one growth intern", "2026-11-12T10:42:00Z");
    assert.equal(
      renderProfile([now], [before], 1000, "UTC"),
      "Projects:\n" +
        "- project:abhyas: has one SDE intern and one growth intern (since 12 Nov)\n" +
        "  earlier: plans to hire two SDE interns and one growth intern (12 Nov)",
    );
  });

  it("shows at most two earlier values, newest first", () => {
    const now = fact("plan:hiring", "hire 10", "goal", "2026-11-14T00:00:00Z");
    const history = [
      replaced("plan:hiring", "hire 30", "2026-11-10T00:00:00Z", "goal"),
      replaced("plan:hiring", "hire 20", "2026-11-12T00:00:00Z", "goal"),
      replaced("plan:hiring", "hire 25", "2026-11-13T00:00:00Z", "goal"),
    ];
    const text = renderProfile([now], history, 1000, "UTC");
    assert.ok(text.includes("earlier: hire 25 (13 Nov)\n  earlier: hire 20 (12 Nov)"));
    assert.ok(!text.includes("hire 30"));
  });

  it("does not show old values of a fact the user said is no longer true", () => {
    const text = renderProfile([fact("name", "Karan")], [replaced("employer", "Acme", "2026-11-01T00:00:00Z", "profile")], 1000, "UTC");
    assert.ok(!text.includes("Acme"));
  });

  it("gives current facts the budget before earlier values", () => {
    const now = fact("plan:hiring", "hire 10", "goal");
    const old = replaced("plan:hiring", "x".repeat(200), "2026-10-01T00:00:00Z", "goal");
    const other = fact("name", "Karan", "profile");
    const text = renderProfile([now, other], [old], 25, "UTC");
    assert.ok(text.includes("hire 10") && text.includes("name: Karan"));
    assert.ok(!text.includes("earlier"));
  });

  it("writes dates in the user's time zone", () => {
    const now = fact("plan:hiring", "hire 10", "goal", "2026-11-12T20:00:00Z");
    const old = replaced("plan:hiring", "hire 20", "2026-11-12T19:00:00Z", "goal");
    assert.ok(renderProfile([now], [old], 1000, "Asia/Kolkata").includes("(since 13 Nov)"));
  });
});
