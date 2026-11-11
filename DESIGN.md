# Design

## How it works

Each turn: the browser sends the message and its time zone; the server builds the prompt and streams the reply
**first**. Everything slower (saving sources, extracting facts, summarising) happens after the last byte is sent.

```
prompt  = rules + long-term profile (≤3k tokens) + summary of older turns in this chat (≤4k)
          + today's date (changes once a day, so the prefix caches) + recent turns (≤40k, newest first)
tools   = web_search (hosted)  recall_by_date  expand_summary  search_memory  get_claims
after the reply: save turn + cited sources → queue: embed turn · extract claims and profile facts (one call)
                 · fold dropped turns into the chat summary · summarise finished days
```

## Memory, by the question it answers

| Layer | Stored as | Answers |
|---|---|---|
| Raw turns (source of truth, never edited) | `turns`: question, answer, timestamps, cited URLs | everything else points here |
| Date lookup | `recall_by_date("last Tuesday")`; **code** resolves the phrase to a range using the user's time zone and the time the question arrived | "what did I ask on 3 November?" Returns an explicit **"no record"** instead of letting the model guess |
| Summaries: day → week/month → year | `summaries` plus pointer tables to turns/children; built lazily, cached, rebuilt only when a newer turn lands in the period | "what did I ask last week?"; `expand_summary` follows the pointers to exact wording |
| Claims | `claims`: subject, attribute, value, number, source URL, date stated; timelines flag changes in code (numbers compared as numbers) | "has pricing changed since?" The old values are looked up, not remembered by the model |
| Topic search | Postgres full-text + pgvector, merged by rank fusion | "when did I ask about hosting?", paraphrases |
| Long-term profile | `user_facts`; a change retires the old row, never overwrites | name, role, projects, preferences, in every prompt |
| Chat summary | `chats.summary`, built from turns that left the recent window | long chats |

"Has it changed?" flow: `recall_by_date` → `get_claims` (old values and dates) → fresh `web_search` on the topic (not the old
answer) → the model compares and states then, now, and what changed. New claims are saved, so the next check starts from today.

## Why

All three sample questions need a **date resolved correctly** and an **old value compared with a new one**. Neither is a
similarity problem, so the core is exact lookup by time and structured claims; embeddings are only for fuzzy topics.
Memory is exposed as tools so turns that need no memory pay nothing, and the model can chain recall → search → compare.
The 1M window is not the constraint, cost, latency and answer quality are, so budgets are small, configurable caps.

## Considered and rejected

- **Put all history in the context window:** works for one demo user, but cost and latency grow with history, accuracy drops, and it is not an architecture.
- **Rolling summary as the only memory:** lossy; cannot answer "what exactly did I ask on 3 November?". Here summaries are an index with pointers, never the source.
- **Embeddings only:** cannot do date arithmetic or diff two prices.
- **Model parses dates / model compares from prose alone:** unreliable. Dates are code; the model compares against stored values.
- **Vectors on the turns row:** every history load would carry 1,536 floats per turn, so they live in `turn_embeddings`.
- **430 summaries built eagerly:** most periods are empty; they are built on first use and kept.
- **Own search scraper / search API:** the hosted tool needs no extra key and returns citations, which become each turn's saved sources.

## Limits, and what I would do with another week

- **Price comparison is only as good as extraction.** Billing period, currency and plan are in the value text but not normalised; a "monthly vs annual" mix-up can look like a change. Next: structured price fields, and an eval suite with a fake clock and seeded history that scores the three question types.
- **First byte takes 3–8 s when a tool runs** (measured locally). Stream a "Searching memory…" status event, and add a cheap router so small talk skips tools.
- **Background jobs are in-process.** A crash loses them (embeddings self-heal on the next turn; claims do not). Next: a durable job table.
- **One user, estimated tokens (chars/4).** Add auth and a per-user key on facts/claims, a real tokenizer, and a way to view, edit and delete what is remembered.
