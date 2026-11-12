import { z } from "zod";
import { embed, embeddingModel } from "../../common/llm/embeddings.js";
import { generateObject, generateText } from "../../common/llm/llm.js";
import { enqueue } from "../../common/queue.js";
import type { Turn } from "../chat/chat.table.js";
import * as chatRepo from "../chat/chat.repo.js";
import { estimateTokens, truncateToTokens, turnsToCompact } from "./context/context-window.js";
import * as claimsRepo from "./claims/claims.repo.js";
import { FACT_KINDS } from "./facts/fact.table.js";
import { planFactChanges } from "./facts/facts.js";
import * as factsRepo from "./facts/facts.repo.js";
import * as memoryRepo from "./memory.repo.js";
import { budgets } from "./context/memory.config.js";
import { newPersonaDetails } from "./persona/persona.js";
import * as personaRepo from "./persona/persona.repo.js";
import { summariseRecentDays } from "./summaries/summaries.js";

// Work done about a turn after its reply has been streamed and saved. The user never waits for
// any of it. Each step is independent: one failing does not stop the others.

// One model call reads the turn and returns everything worth remembering from it: checkable facts
// from the web (claims), durable facts the user told us about themselves, and any new part of
// Ray's own backstory he made up while answering.
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
      key: z
        .string()
        .describe(
          "Stable name, one per topic: 'name', 'role', 'employer', 'location', 'preference:<topic>', 'goal:<topic>', 'project:<name>' for what a project is, and 'project:<name>:<part>' for each part of it, e.g. 'project:abhyas:hiring', 'project:abhyas:features'.",
        ),
      value: z.string().describe("The complete current state of that topic in a short phrase. Empty for 'remove'."),
    }),
  ),
  rayFacts: z.array(
    z.object({
      key: z.string().describe("Topic of the detail: 'origin', 'age', 'family', 'training', 'hobby', 'favourite food', ..."),
      story: z
        .string()
        .describe("The detail in one to three sentences, written in the first person as Ray ('I grew up ...'), keeping names and places."),
    }),
  ),
});

const INSTRUCTIONS = `You read one exchange between a user and an assistant and pull out what is worth remembering.

1. claims: checkable, time-sensitive facts the ASSISTANT stated from the web sources: prices, plan names, versions, release dates, availability, limits, rankings. Skip opinions, advice, explanations and anything the sources do not support. Only extract claims when web sources are listed. Write each claim so it stands alone. Use the same subject and attribute names each time the same thing is stated, preferring the names in the list of earlier claims. Set sourceUrl only to the page that states that specific claim (one of the listed sources), or null when unsure.

2. userFacts: durable facts the USER states about themselves: name, role, employer, location, preferences, goals, habits, and the projects they are building. Not questions, one-off requests, or facts about the world.
   - One topic per key. Give each part of a project its own key ('project:<name>:hiring', 'project:<name>:features', 'project:<name>:launch', ...) next to 'project:<name>' for what the project is, so news about one part never touches another. Reuse the keys of the known facts when the same thing comes up again.
   - Set only the keys the exchange changes, and write each one's complete current state: keep everything in the known value that is still true and apply the change on top. Keep a plan and the progress on it together, with numbers. Example: known "plan: 2 SDE interns and 1 growth intern; hired: 1 SDE intern, 1 growth intern" + "hired one more SDE intern" -> "plan: 2 SDE interns and 1 growth intern; hired: 2 SDE interns, 1 growth intern (plan complete)".
   - Use action "set" for a new or changed fact and "remove" when the user says something is no longer true. Do not repeat a known fact that has not changed.

3. rayFacts: details the ASSISTANT (Ray, a ninja character) told about HIMSELF in this reply that are not already in his known backstory: where he is from, his age, family, training, hobbies, favourite things, past adventures. One entry per topic. Skip details already in the known backstory and anything about the user or the world.

Return empty lists when there is nothing to record.`;

async function extract(turn: Turn): Promise<void> {
  const [earlierClaims, knownFacts, backstory] = await Promise.all([
    turn.sources.length > 0 ? claimsRepo.findClaims(turn.userText, undefined, 40) : [],
    factsRepo.getActiveFacts(),
    personaRepo.getPersonaFacts(),
  ]);

  const input = [
    `User said: ${turn.userText}`,
    `Assistant answered: ${turn.assistantText}`,
    turn.sources.length > 0
      ? `Web sources: ${turn.sources.map((s) => `${s.url} (${s.title})`).join("; ")}`
      : "Web sources: none",
    knownFacts.length > 0 ? `Known facts about the user:\n${knownFacts.map((f) => `- ${f.key}: ${f.value}`).join("\n")}` : "",
    backstory.length > 0 ? `Ray's known backstory:\n${backstory.map((f) => `- ${f.key}: ${f.story}`).join("\n")}` : "",
    earlierClaims.length > 0
      ? `Earlier claims (reuse these names):\n${[...new Set(earlierClaims.map((c) => `- ${c.subject} | ${c.attribute}`))].join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await generateObject(Extracted, INSTRUCTIONS, input);

  if (turn.sources.length > 0) {
    await claimsRepo.replaceClaimsForTurn(
      turn.id,
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
  await personaRepo.addPersonaDetails(newPersonaDetails(backstory, result.rayFacts), turn.id);
}

// A turn is read this many times at most; after that it is left alone instead of failing forever.
const MAX_EXTRACTION_ATTEMPTS = 3;
// Turns read per run, so a long backlog (after an outage) catches up over several turns.
const EXTRACTIONS_PER_RUN = 5;

// Reads out the claims and profile facts of every turn that has not had it done: the new turn,
// and older ones where an earlier attempt failed. Oldest first, so that when the user changed
// their mind the later statement is the one that stays. It stops at the first failure, because
// the model is probably unavailable and the rest wait for the next turn.
async function extractPending(): Promise<void> {
  for (const turn of await memoryRepo.getTurnsPendingExtraction(MAX_EXTRACTION_ATTEMPTS, EXTRACTIONS_PER_RUN)) {
    await memoryRepo.recordExtractionAttempt(turn.id);
    try {
      await extract(turn);
    } catch (err) {
      if (turn.extractionAttempts + 1 >= MAX_EXTRACTION_ATTEMPTS) {
        console.error(`memory: giving up on reading turn ${turn.id} after ${MAX_EXTRACTION_ATTEMPTS} attempts`);
      }
      throw err;
    }
    await memoryRepo.markExtracted(turn.id);
  }
}

// Embeds this turn and any older turns that missed out (a failed call, or rows added directly).
async function embedTurns(turn: Turn): Promise<void> {
  const missing = await memoryRepo.getTurnsWithoutEmbedding(20);
  const batch = missing.some((t) => t.id === turn.id) ? missing : [turn, ...missing];
  const vectors = await embed(batch.map((t) => `${t.userText}\n${t.assistantText}`));
  const model = embeddingModel();
  for (const [i, t] of batch.entries()) await memoryRepo.saveEmbedding(t.id, vectors[i], model);
}

const CHAT_SUMMARY_INSTRUCTIONS = `You maintain a running summary of an ongoing conversation between a user and an AI assistant. You get the current summary (if any) and the newer exchanges that are leaving the live conversation window.
Return the updated summary: keep the user's goals, decisions, names, numbers, preferences, what the assistant concluded, and open questions. Drop greetings and filler. Write plain prose or short bullets, no preamble.`;

// Turns are summarised in batches this big, so a long backlog never becomes one huge model call.
const SUMMARY_BATCH_TURNS = 30;

const SHORTEN_INSTRUCTIONS = `You shorten a summary of a conversation between a user and an AI assistant. Keep the user's goals, decisions, names, numbers and open questions; give recent points as much room as early ones. Drop repetition and detail that no longer matters. Return only the shorter summary.`;

// Extra passes allowed to bring an over-long summary within its budget.
const SHORTEN_ATTEMPTS = 2;

// The model is asked for a summary within its budget, but may not manage it. It is compacted
// again, asking for less each time. Only if that still does not fit is the end cut off, so a
// saved summary always fits and the prompt can use it as it is. If a model call fails, nothing
// is saved and the same turns are folded in after the next reply.
async function fitSummary(summary: string, summaryTokens: number): Promise<string> {
  for (let attempt = 0; attempt < SHORTEN_ATTEMPTS && estimateTokens(summary) > summaryTokens; attempt++) {
    const words = Math.floor(summaryTokens * (0.6 - 0.2 * attempt));
    summary = await generateText(SHORTEN_INSTRUCTIONS, `Shorten this to under about ${words} words:\n\n${summary}`);
  }
  if (estimateTokens(summary) <= summaryTokens) return summary;
  console.error(`memory: chat summary still over ${summaryTokens} tokens after shortening; cutting the end off`);
  return truncateToTokens(summary, summaryTokens);
}

// When the turns not yet in this chat's summary fill most of the recent budget, folds the older
// half of them into the summary (compaction). The summary replaces them in the prompt; the turns
// themselves stay in the database.
export async function updateChatSummary(chatId: string): Promise<void> {
  const chat = await chatRepo.getChat(chatId);
  if (!chat) return;

  const { recentTokens, summaryTokens } = budgets();
  let pending = turnsToCompact(await chatRepo.getRecentTurns(chatId, 1000), recentTokens, chat.summaryThroughTurnId);

  // Nothing new to fold in, but the summary may be over a budget that was lowered since it was saved.
  if (pending.length === 0) {
    if (chat.summary && chat.summaryThroughTurnId !== null && estimateTokens(chat.summary) > summaryTokens) {
      await chatRepo.setChatSummary(chatId, await fitSummary(chat.summary, summaryTokens), chat.summaryThroughTurnId);
    }
    return;
  }

  let summary = chat.summary ?? "";
  while (pending.length > 0) {
    const batch = pending.slice(0, SUMMARY_BATCH_TURNS);
    pending = pending.slice(SUMMARY_BATCH_TURNS);
    const exchanges = batch
      .map((t) => `User: ${t.userText.slice(0, 1500)}\nAssistant: ${t.assistantText.slice(0, 2000)}`)
      .join("\n\n");
    summary = await generateText(
      CHAT_SUMMARY_INSTRUCTIONS,
      `Keep the summary under about ${Math.floor(summaryTokens * 0.6)} words.

Current summary:
${summary || "(none yet)"}

Exchanges leaving the window:
${exchanges}`,
    );
    summary = await fitSummary(summary, summaryTokens);
    await chatRepo.setChatSummary(chatId, summary, batch[batch.length - 1].id);
  }
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
    await step("extract claims and profile facts", extractPending);
    await step("compact the chat into its summary", () => updateChatSummary(turn.chatId));
    // Finished days get their summary now, so asking about them later does not wait for it.
    await step("summarise finished days", () => summariseRecentDays(timeZone, turn.askedAt));
  });
}
