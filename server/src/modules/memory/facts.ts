import { estimateTokens } from "./context-window.js";
import type { FactKind, UserFact } from "./fact.table.js";

// Deciding what to change in the user's long-term facts, and how to show them to the model.
// Kept as plain functions so the rules can be tested without a database or a model.

export type FactOp = { action: "set" | "remove"; kind: FactKind; key: string; value: string };

export type FactChanges = {
  // Ids of active facts to mark as superseded.
  supersede: number[];
  insert: { kind: FactKind; key: string; value: string }[];
};

export function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/\s+/g, " ").trim();
}

function sameText(a: string, b: string): boolean {
  return a.toLowerCase().replace(/\s+/g, " ").trim() === b.toLowerCase().replace(/\s+/g, " ").trim();
}

// Works out which rows to retire and which to add. Setting a fact to the value it already has
// changes nothing; setting a new value retires the old one; removing retires it.
export function planFactChanges(active: UserFact[], ops: FactOp[]): FactChanges {
  const current = new Map(active.map((f) => [f.key, f] as const));
  const supersede = new Set<number>();
  const pending = new Map<string, { kind: FactKind; key: string; value: string }>();

  for (const op of ops) {
    const key = normaliseKey(op.key);
    const value = op.value.trim();
    if (!key) continue;

    const existing = current.get(key);
    const queued = pending.get(key);

    if (op.action === "remove") {
      if (existing) supersede.add(existing.id);
      pending.delete(key);
      continue;
    }
    if (!value) continue;
    if (queued ? sameText(queued.value, value) : existing && sameText(existing.value, value)) continue;

    if (existing) supersede.add(existing.id);
    pending.set(key, { kind: op.kind, key, value });
  }

  return { supersede: [...supersede], insert: [...pending.values()] };
}

const KIND_TITLES: Record<FactKind, string> = {
  profile: "About them",
  preference: "Preferences",
  project: "Projects",
  goal: "Goals",
  other: "Other",
};

// Renders the active facts for the prompt, newest first until the token budget is used up, then
// grouped by kind. Older facts that do not fit stay in the database.
export function renderProfile(facts: UserFact[], budgetTokens: number): string {
  const newestFirst = [...facts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id);
  const kept: UserFact[] = [];
  let used = 0;
  for (const fact of newestFirst) {
    const cost = estimateTokens(`- ${fact.key}: ${fact.value}\n`);
    if (used + cost > budgetTokens) continue;
    used += cost;
    kept.push(fact);
  }

  const sections: string[] = [];
  for (const kind of Object.keys(KIND_TITLES) as FactKind[]) {
    const lines = kept
      .filter((f) => f.kind === kind)
      .sort((a, b) => a.id - b.id)
      .map((f) => `- ${f.key}: ${f.value}`);
    if (lines.length > 0) sections.push(`${KIND_TITLES[kind]}:\n${lines.join("\n")}`);
  }
  return sections.join("\n");
}
