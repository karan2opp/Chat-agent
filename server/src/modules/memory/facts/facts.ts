import { estimateTokens } from "../context/context-window.js";
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

// How many replaced values are shown under a current fact, newest first.
export const EARLIER_PER_FACT = 2;

const newestFirst = (facts: UserFact[]) =>
  [...facts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id);

// Renders the user's facts for the prompt, grouped by kind. Each current fact is one line. If it
// replaced earlier values, it also shows when it was said and up to EARLIER_PER_FACT of those
// earlier values, so the model can see how things moved ("planned 2 SDE interns, now has 1")
// and answer "what changed?". For example:
//
//   - project:abhyas: Building Abhyas, with one SDE intern. (since 12 Nov)
//     earlier: Building Abhyas, planning to hire two SDE interns. (12 Nov)
//
// Current facts get the budget first, newest first; earlier values only fill what is left, so
// history never pushes out something that is true now. A topic the user said is no longer true has
// no current value, so its old values are not shown (they stay in the database for search).
export function renderProfile(active: UserFact[], replaced: UserFact[], budgetTokens: number, timeZone: string): string {
  const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short" }).format(d);

  const earlierByKey = new Map<string, UserFact[]>();
  for (const old of newestFirst(replaced)) {
    const list = earlierByKey.get(old.key) ?? [];
    if (list.length < EARLIER_PER_FACT) list.push(old);
    earlierByKey.set(old.key, list);
  }
  const hasHistory = (f: UserFact) => (earlierByKey.get(f.key)?.length ?? 0) > 0;
  const currentLine = (f: UserFact) => `- ${f.key}: ${f.value}${hasHistory(f) ? ` (since ${day(f.createdAt)})` : ""}`;

  const kept: UserFact[] = [];
  let used = 0;
  for (const fact of newestFirst(active)) {
    const cost = estimateTokens(`${currentLine(fact)}\n`);
    if (used + cost > budgetTokens) continue;
    used += cost;
    kept.push(fact);
  }

  const earlierLines = new Map<number, string[]>();
  for (const fact of kept) {
    const lines: string[] = [];
    for (const old of earlierByKey.get(fact.key) ?? []) {
      const line = `  earlier: ${old.value} (${day(old.createdAt)})`;
      const cost = estimateTokens(`${line}\n`);
      if (used + cost > budgetTokens) break;
      used += cost;
      lines.push(line);
    }
    earlierLines.set(fact.id, lines);
  }

  const sections: string[] = [];
  for (const kind of Object.keys(KIND_TITLES) as FactKind[]) {
    const lines = kept
      .filter((f) => f.kind === kind)
      .sort((a, b) => a.id - b.id)
      .flatMap((f) => [currentLine(f), ...(earlierLines.get(f.id) ?? [])]);
    if (lines.length > 0) sections.push(`${KIND_TITLES[kind]}:\n${lines.join("\n")}`);
  }
  return sections.join("\n");
}
