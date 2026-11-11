import { z } from "zod";
import { embed, embeddingModel } from "../../common/llm/embeddings.js";
import { generateObject } from "../../common/llm/llm.js";
import { enqueue } from "../../common/queue.js";
import type { Turn } from "../chat/chat.table.js";
import * as claimsRepo from "./claims.repo.js";
import { FACT_KINDS } from "./fact.table.js";
import { planFactChanges } from "./facts.js";
import * as factsRepo from "./facts.repo.js";
import * as memoryRepo from "./memory.repo.js";
import { summariseRecentDays } from "./summaries.js";

// Work done about a turn after its reply has been streamed and saved. The user never waits for
// any of it. Each step is independent: one failing does not stop the others.

// One model call reads the turn and returns both things worth remembering from it: checkable
// facts from the web (claims) and durable facts the user told us about themselves.
const Extracted = z.object({
  claims: z.array(
    z.object({
      topic: z.string().describe("Short label for what the group of claims is about, e.g. 'CRM tool pricing'."),
      subject: z.string().describe("The thing the claim is about, e.g. 'Pipedrive'."),
      attribute: z.string().describe("The property, e.g. 'Essential plan price'."),
      value: z.string().describe("The value as stated, with units and conditions, e.g. '$14 per user per month, billed annually'."),
      amount: z.number().nullable().describe("The main number when the value is a single price or quantity (14), otherwise null."),
      sourceUrl: z.string().nullable().describe("The cited page this came from, if known."),
    }),
  ),
  userFacts: z.array(
    z.object({
      action: z.enum(["set", "remove"]),
      kind: z.enum(FACT_KINDS),
      key: z.string().describe("Stable name: 'name', 'role', 'employer', 'location', 'preference:<topic>', 'project:<name>', 'goal:<topic>'."),
      value: z.string().describe("The fact in a short phrase. Empty for 'remove'."),
    }),
  ),
});

const INSTRUCTIONS = `You read one exchange between a user and an assistant and pull out what is worth remembering.

1. claims: checkable, time-sensitive facts the ASSISTANT stated from the web sources: prices, plan names, versions, release dates, availability, limits, rankings. Skip opinions, advice, explanations and anything the sources do not support. Only extract claims when web sources are listed. Write each claim so it stands alone. Use the same subject and attribute names each time the same thing is stated, preferring the names in the list of earlier claims. Set sourceUrl only to the page that states that specific claim (one of the listed sources), or null when unsure.

2. userFacts: durable facts the USER states about themselves: name, role, employer, location, preferences, goals, habits, and the projects they are building (one short line per project). Not questions, one-off requests, or facts about the world. Reuse the keys of the known facts when the same thing comes up again. Use action "set" for a new or changed fact and "remove" when the user says something is no longer true. Do not repeat a known fact that has not changed.

Return empty lists when there is nothing to record.`;

async function extract(turn: Turn): Promise<void> {
  const [earlierClaims, knownFacts] = await Promise.all([
    turn.sources.length > 0 ? claimsRepo.findClaims(turn.userText, undefined, 40) : [],
    factsRepo.getActiveFacts(),
  ]);

  const input = [
    `User said: ${turn.userText}`,
    `Assistant answered: ${turn.assistantText}`,
    turn.sources.length > 0
      ? `Web sources: ${turn.sources.map((s) => `${s.url} (${s.title})`).join("; ")}`
      : "Web sources: none",
    knownFacts.length > 0 ? `Known facts about the user:\n${knownFacts.map((f) => `- ${f.key}: ${f.value}`).join("\n")}` : "",
    earlierClaims.length > 0
      ? `Earlier claims (reuse these names):\n${[...new Set(earlierClaims.map((c) => `- ${c.subject} | ${c.attribute}`))].join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await generateObject(Extracted, INSTRUCTIONS, input);

  if (turn.sources.length > 0) {
    await claimsRepo.insertClaims(
      result.claims.map((c) => ({
        turnId: turn.id,
        topic: c.topic,
        subject: c.subject,
        attribute: c.attribute,
        value: c.value,
        amount: c.amount,
        sourceUrl: c.sourceUrl,
        asOf: turn.askedAt,
      })),
    );
  }
  await factsRepo.applyFactChanges(planFactChanges(knownFacts, result.userFacts), turn.id);
}

// Embeds this turn and any older turns that missed out (a failed call, or rows added directly).
async function embedTurns(turn: Turn): Promise<void> {
  const missing = await memoryRepo.getTurnsWithoutEmbedding(20);
  const batch = missing.some((t) => t.id === turn.id) ? missing : [turn, ...missing];
  const vectors = await embed(batch.map((t) => `${t.userText}
${t.assistantText}`));
  const model = embeddingModel();
  for (const [i, t] of batch.entries()) await memoryRepo.saveEmbedding(t.id, vectors[i], model);
}

async function step(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`memory step "${name}" failed:`, err instanceof Error ? err.message : err);
  }
}

// Queues the follow-up work for a saved turn. Returns immediately.
export function enrichAfterTurn(turn: Turn, timeZone: string): void {
  enqueue("enrich turn", async () => {
    await step("embed turns", () => embedTurns(turn));
    await step("extract claims and profile facts", () => extract(turn));
    // Finished days get their summary now, so asking about them later does not wait for it.
    await step("summarise finished days", () => summariseRecentDays(timeZone, turn.askedAt));
  });
}
