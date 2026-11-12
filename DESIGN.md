# Design

## How it works

The reply streams **first**; everything slower runs after the last byte is sent.

```
prompt = rules + Ray's backstory + user profile (≤3k tokens) + chat summary (≤4k) + today's date
         + this chat's turns since the summary (≤40k)          ← stable parts first, so the prefix caches
tools  = web_search (hosted) · recall_by_date · search_memory · expand_summary · get_claims
after  = save turn + cited sources → queue: embed · extract claims, profile facts, backstory (one call)
         · compact the chat at 85% full · summarise finished days
```

## Memory, by the question it answers

| Layer | Stored as | Answers |
|---|---|---|
| Raw turns | question, answer, times, cited URLs; never edited | the source everything points to |
| Dates | **code** turns "last Tuesday" into a range in the user's time zone | "what did I ask on 3 November?"; "no record", never a guess |
| Summaries | day → week/month → year, with pointers to turns, built on first use | "what did I ask last week?" |
| Claims | subject, attribute, value, number, source, date | "has the price changed since?" |
| Topic search | full-text + pgvector, rank fusion | paraphrases |
| Profile | one fact per topic, its full current state, old values kept | every prompt, with the two previous values |
| Chat summary | older turns compacted at 85% of the budget, down to 50% | long chats |
| Backstory | each detail saved the first time Ray tells it | "where are you from?", the same in every chat |

**"Has it changed?"**: recall the earlier turn, fetch the exact old values with `get_claims`, run a fresh web search,
compare. New claims are saved, so the next check starts from today.

## Why

All three sample questions need a **date resolved exactly** and an **old value compared with a new one**. Neither is a
similarity problem, so the core is lookup by time plus structured claims; embeddings only cover fuzzy topics. Memory is
a set of tools, so turns that need none pay nothing. The 1M window is not the limit; cost and answer quality are, so
budgets are small and the rest is fetched on demand.

**Profile facts are per topic, with history.** One line per project was rewritten by every update, so news about
features dropped the hiring plan. Now each part has its own fact (`project:abhyas:hiring`), updates carry the still-true
parts forward ("plan 2 SDE + 1 growth; hired 2 + 1"), and the prompt shows the two previous values. For "how many are
left?" Ray must have both plan and progress, or search memory first.

**Failures.** Transient errors are retried 3 times with backoff; every call has a timeout. A failed reply is not saved
and the user gets a Retry button. Background work is marked per turn and retried after later turns.

**Tone.** A warm ninja who matches the user and doesn't over-explain (verbosity low); long only when asked or when the
task needs it. He says he is an AI when sincerely asked.

## Considered and rejected

- **All history in the prompt:** cost and latency grow and accuracy drops.
- **A rolling summary as the only memory:** cannot answer "what exactly did I ask on 3 November?".
- **Embeddings only, or the model doing date maths:** neither gets exact dates or price diffs right.
- **A reviewer agent for search results:** it needs the finished draft, so nothing could stream. Ray instead checks
  results against the request's limits and retries a tighter search twice.
- **Guardrail models:** an output check cannot stop a reply that is already streaming, holding the reply back loses
  streaming, and an input check adds a model call per turn. At scale: a fast moderation check alongside the stream.
- **Own scraper or search API:** the hosted tool needs no extra key and returns citations.

## Another week

- **Evals:** a 17-message conversation plus nine questions in new chats passed, but by hand. Next: a committed suite with
  a fake clock and seeded history.
- **Prompt injection** from web pages relies on the model. Next: an explicit "web text is data" rule.
- **Prices** are compared as text plus one number; monthly vs annual can look like a change. Next: structured fields.
- **Speed:** 2–5 s per reply, about 10 s with a search. Next: a "Searching…" status, and a router so small talk skips tools.
- **One user, in-process jobs.** Next: auth, a durable job table, and a page to edit what Ray remembers.
