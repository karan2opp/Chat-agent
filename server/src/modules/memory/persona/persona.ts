import { estimateTokens } from "../context/context-window.js";
import { normaliseKey } from "../facts/facts.js";
import type { PersonaFact } from "./persona.table.js";

// Ray's backstory: which newly told details to keep, and how to show them to the model. Kept as
// plain functions so the rules can be tested without a database or a model.

export type PersonaDetail = { key: string; story: string };

// The details worth saving: topics not covered yet, one per topic. A topic that already has a
// story keeps it, so a retelling can never change the story.
export function newPersonaDetails(known: PersonaFact[], told: PersonaDetail[]): PersonaDetail[] {
  const taken = new Set(known.map((f) => f.key));
  const fresh: PersonaDetail[] = [];
  for (const detail of told) {
    const key = normaliseKey(detail.key);
    const story = detail.story.trim();
    if (!key || !story || taken.has(key)) continue;
    taken.add(key);
    fresh.push({ key, story });
  }
  return fresh;
}

// Renders the backstory for the prompt, oldest first: the first details told are the foundation
// the later ones build on. Details that do not fit in the budget stay in the database.
export function renderPersona(facts: PersonaFact[], budgetTokens: number): string {
  const lines: string[] = [];
  let used = 0;
  for (const fact of [...facts].sort((a, b) => a.id - b.id)) {
    const line = `- ${fact.key}: ${fact.story}`;
    const cost = estimateTokens(line);
    if (used + cost > budgetTokens) break;
    used += cost;
    lines.push(line);
  }
  return lines.join("\n");
}
