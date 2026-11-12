import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newPersonaDetails, renderPersona } from "./persona.js";
import type { PersonaFact } from "./persona.table.js";

let nextId = 1;
const fact = (key: string, story: string): PersonaFact => ({
  id: nextId++,
  key,
  story,
  sourceTurnId: null,
  createdAt: new Date("2026-11-01T00:00:00Z"),
});

describe("newPersonaDetails", () => {
  it("keeps details about new topics", () => {
    assert.deepEqual(newPersonaDetails([], [{ key: "Origin", story: " A village in the hills. " }]), [
      { key: "origin", story: "A village in the hills." },
    ]);
  });

  it("never replaces a story that was already told", () => {
    const known = [fact("origin", "A village in the hills.")];
    assert.deepEqual(newPersonaDetails(known, [{ key: "origin", story: "A city by the sea." }]), []);
  });

  it("keeps only the first story for a topic told twice in one reply", () => {
    const told = [
      { key: "age", story: "Old enough to know better." },
      { key: "Age", story: "Twenty-something." },
    ];
    assert.deepEqual(newPersonaDetails([], told), [{ key: "age", story: "Old enough to know better." }]);
  });

  it("skips empty keys and stories", () => {
    assert.deepEqual(newPersonaDetails([], [{ key: " ", story: "x" }, { key: "hobby", story: "" }]), []);
  });
});

describe("renderPersona", () => {
  it("lists the backstory oldest first", () => {
    const facts = [fact("training", "Trained by a grumpy cat."), fact("origin", "Born under a full moon.")];
    facts.reverse();
    assert.equal(renderPersona(facts, 100), "- training: Trained by a grumpy cat.\n- origin: Born under a full moon.");
  });

  it("stops at the budget", () => {
    const facts = [fact("a", "x".repeat(40)), fact("b", "y".repeat(40))];
    assert.equal(renderPersona(facts, 15).split("\n").length, 1);
  });
});
