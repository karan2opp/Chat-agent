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
  it("groups facts by kind", () => {
    const text = renderProfile(
      [fact("name", "Karan"), fact("project:minimi", "chat agent with memory", "project"), fact("tone", "concise", "preference")],
      1000,
    );
    assert.equal(
      text,
      "About them:\n- name: Karan\nPreferences:\n- tone: concise\nProjects:\n- project:minimi: chat agent with memory",
    );
  });

  it("drops the oldest facts first when over budget", () => {
    const old = fact("hobby", "x".repeat(200), "other", "2026-01-01T00:00:00Z");
    const recent = fact("name", "Karan", "profile", "2026-11-01T00:00:00Z");
    const text = renderProfile([old, recent], 20);
    assert.ok(text.includes("name: Karan"));
    assert.ok(!text.includes("hobby"));
  });

  it("is empty with no facts", () => {
    assert.equal(renderProfile([], 100), "");
  });
});
