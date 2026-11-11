import { z } from "zod";
import { generateObject } from "../../common/llm/llm.js";
import { enqueue } from "../../common/queue.js";
import type { Turn } from "../chat/chat.table.js";
import * as claimsRepo from "./claims.repo.js";

// Work done about a turn after its reply has been streamed and saved. The user never waits for
// any of it. Each step is independent: one failing does not stop the others.

const ExtractedClaims = z.object({
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
});

const CLAIM_INSTRUCTIONS = `You extract checkable facts from an assistant's answer so they can be compared with the web later.
Extract only concrete, time-sensitive facts that came from the web sources: prices, plan names, versions, release dates, availability, limits, rankings. Skip opinions, advice, explanations and anything the sources do not support.
Write each claim so it stands alone. Use the same subject and attribute names each time the same thing is stated, and prefer the names in the list of earlier claims when one applies.
Set sourceUrl only to the page that states that specific claim (it must be one of the listed sources); use null when you are not sure which page it came from.
If there is nothing concrete to record, return an empty list.`;

async function extractClaims(turn: Turn): Promise<void> {
  // Claims are only recorded for answers that used a web search, which is where checkable,
  // changing facts come from.
  if (turn.sources.length === 0) return;

  const earlier = await claimsRepo.findClaims(turn.userText, undefined, 40);
  const known = earlier.map((c) => `- ${c.subject} | ${c.attribute}`);

  const input = [
    `Question: ${turn.userText}`,
    `Answer: ${turn.assistantText}`,
    `Sources: ${turn.sources.map((s) => `${s.url} (${s.title})`).join("; ")}`,
    known.length > 0 ? `Earlier claims (reuse these names):\n${[...new Set(known)].join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { claims } = await generateObject(ExtractedClaims, CLAIM_INSTRUCTIONS, input);
  await claimsRepo.insertClaims(
    claims.map((c) => ({
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

async function step(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`memory step "${name}" failed:`, err instanceof Error ? err.message : err);
  }
}

// Queues the follow-up work for a saved turn. Returns immediately.
export function enrichAfterTurn(turn: Turn, _timeZone: string): void {
  enqueue("enrich turn", async () => {
    await step("claims", () => extractClaims(turn));
  });
}
