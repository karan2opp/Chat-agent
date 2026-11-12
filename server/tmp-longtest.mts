import pg from "pg";
import { appendFileSync, writeFileSync } from "node:fs";
const API = "http://localhost:3995/api";
const OUT = process.argv[2];
const db = new pg.Pool({ connectionString: "postgres://minimi:minimi@localhost:54329/minimi_test5" });
const log = (s: string) => appendFileSync(OUT, s + "\n");
writeFileSync(OUT, "");

async function ask(message: string, chatId?: string): Promise<{ reply: string; chatId: string; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(`${API}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, message, timeZone: "Asia/Kolkata" }),
  });
  const reply = await res.text();
  return { reply, chatId: res.headers.get("x-chat-id") ?? chatId!, ms: Date.now() - t0 };
}
// Waits until the background memory work for every turn so far has run.
async function settle() {
  for (let i = 0; i < 60; i++) {
    const { rows } = await db.query("select count(*)::int n from turns where extracted_at is null and extraction_attempts < 3");
    if (rows[0].n === 0) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  await new Promise((r) => setTimeout(r, 4000));
}

const conversation = [
  "Hi! I'm Ray, 23, and I'm building Abhyas, an AI exam engine for coaching institutes.",
  "My co-founder is Meera, she handles sales.",
  "We plan to launch the beta on 15 December.",
  "Hiring plan: 2 SDE interns and 1 growth intern.",
  "Our monthly budget for software tools is $300.",
  "What's a good Postgres host for an early-stage startup like ours? Pick one.",
  "Planned features: join-code exams, manager portal, load balancing, answer-evaluation queue, textbook question generation.",
  "Add a scoreboard too, so 6 features in total.",
  "Update: hired 1 SDE intern and the growth intern.",
  "Where are you from, Ray?",
  "By the way, I prefer short answers with bullet points.",
  "Built the manager portal today.",
  "Budget changed: we now have $500 a month for tools.",
  "Meera closed our first pilot with Sunrise Coaching!",
  "Built the scoreboard and hired the second SDE intern.",
  "The beta moved to 5 January.",
  "Quick check: what's my name, what am I building, and who is my co-founder?",
];
const probes: [string, string][] = [
  ["Is my hiring complete or is someone left to hire?", "Complete: 2 SDE + 1 growth all hired"],
  ["How many features are left to build, and which ones?", "4 left: join-code exams, load balancing, answer-evaluation queue, textbook question generation"],
  ["When is the beta launch?", "5 January (moved from 15 December)"],
  ["What's my monthly tools budget, and has it changed?", "$500, was $300"],
  ["Who is Meera and what did she do recently?", "Co-founder, sales, closed first pilot with Sunrise Coaching"],
  ["Where are you from?", "Same story as in chat 1"],
  ["Which Postgres host did you recommend to me earlier?", "Same host as his chat-1 answer"],
  ["What did I ask you about today?", "Summary of today's topics"],
  ["Do you know my favourite food?", "No record; must not invent"],
];

log("################ PART 1: one long chat ################");
let chatId: string | undefined;
for (const [i, msg] of conversation.entries()) {
  const r = await ask(msg, chatId);
  chatId = r.chatId;
  log(`\n--- [${i + 1}] USER: ${msg}\n    RAY (${(r.ms / 1000).toFixed(1)}s): ${r.reply.trim().replace(/\n+/g, "\n    ")}`);
  await settle();
}
const chat = (await db.query("select summary, summary_through_turn_id from chats where id = $1", [chatId])).rows[0];
log(`\n=== compaction: summary covers turns up to id ${chat.summary_through_turn_id ?? "none"}\n=== summary:\n${chat.summary ?? "(none)"}`);

log("\n################ PART 2: questions in new chats ################");
for (const [q, expected] of probes) {
  const r = await ask(q);
  log(`\n--- USER (new chat): ${q}\n    EXPECTED: ${expected}\n    RAY (${(r.ms / 1000).toFixed(1)}s): ${r.reply.trim().replace(/\n+/g, "\n    ")}`);
  await settle();
}
const facts = await db.query("select case when superseded_at is null then 'NOW    ' else 'earlier' end s, key, value from user_facts order by key, id");
log("\n################ saved profile facts ################");
for (const f of facts.rows) log(`${f.s} ${f.key} = ${f.value}`);
const persona = await db.query("select key, story from persona_facts order by id");
log("\n################ Ray's saved backstory ################");
for (const p of persona.rows) log(`${p.key}: ${p.story}`);
log("\nDONE");
await db.end();
process.exit(0);
