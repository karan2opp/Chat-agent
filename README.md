# Ray: a chat agent that remembers

Ray is a friendly ninja chat agent with web search and a long-term memory built for time-anchored
questions:

- "What did I ask you on 3 November? Is your answer still correct today?"
- "Last Tuesday I asked about Postgres hosting. Has any pricing changed since then?"
- "On Monday we shortlisted 5 CRM tools. Has any of them changed pricing?"

How it works, and why it is built this way, is in [DESIGN.md](DESIGN.md).

## Setup and run

You need **Node 22** (tested on 22.12), **Docker Desktop** (for Postgres) and an **OpenAI API key**.

> **Open Docker Desktop first.** Start it and wait until it says Docker is running before
> `npm run dev`. The database runs in Docker, and without it the app cannot start.

1. **Get the code**

   ```bash
   git clone https://github.com/karan2opp/Chat-agent.git
   cd Chat-agent
   ```

2. **Install the packages**

   ```bash
   npm install
   ```

3. **Add your OpenAI key.** Copy the example settings file:

   ```bash
   cp .env.example .env        # Windows Command Prompt: copy .env.example .env
   ```

   Open `.env` and set `OPENAI_API_KEY=sk-...`. It is the only key needed; it covers the model,
   web search and embeddings. Everything else in [.env.example](.env.example) has a working default.

4. **Start Docker Desktop**, if it is not running yet.

5. **Run it**

   ```bash
   npm run dev
   ```

   This starts Postgres in Docker (host port 54329), applies the database migrations, then
   starts the API (port 3001) and the web app (port 5173), both reloading on changes. Wait for
   `[server] server listening on http://localhost:3001`.

6. **Open http://localhost:5173** and say hi to Ray.

To stop, press `Ctrl+C`. The database keeps running in Docker with your chats saved; stop it
with `docker compose down` (add `-v` to delete the saved data too).

## Try it

1. **Web search:** "What is the conversion rate of dollar to rupee?" The answer cites its sources.
2. **Memory across chats:** say "I'm building Abhyas and plan to hire 2 SDE interns and 1 growth
   intern". Later, in a new chat: "I hired one of each", then in another: "How many are left to hire?"
3. **Dates:** "What did I ask you today?", "What did I ask you yesterday?"
4. **Has it changed?** Ask a price question, then later: "Has the price you told me changed since?"
   Ray looks up what he said then, searches again, and compares.
5. **Ray himself:** "Where are you from?" He tells a story and keeps it the same in every chat.

Leave the chat alone for a while and the ninja above the message box walks, yawns, throws a
shuriken or naps.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Postgres, API and web app, with reload |
| `npm test` | Server unit tests (dates, token budgets, compaction, claims, profile facts, backstory, search ranking, job queue) |
| `npm run build` | Type-check and build the server and the client |
| `npm start` | Run the built server |
| `npm run db:generate` | Generate a migration after changing a `*.table.ts` file |

## Configuration

Set in `.env` (see [.env.example](.env.example)):

| Variable | Default | Meaning |
|---|---|---|
| `OPENAI_API_KEY` | (required) | OpenAI key |
| `OPENAI_MODEL` | `gpt-5.6-luna` | Model for replies |
| `OPENAI_BACKGROUND_MODEL` | same as `OPENAI_MODEL` | Model for background memory work; can be a cheaper one |
| `DATABASE_URL` | the Docker Postgres | Postgres with pgvector |
| `PORT` | `3001` | API port |
| `MEMORY_*_TOKENS` | 3000 / 1500 / 4000 / 40000 | Prompt budgets for the profile, Ray's backstory, the chat summary and recent turns |

## Layout

```
client/src/
  components/           chat screen, sidebar, Markdown replies, the ninja
  lib/                  API calls and the streaming client
server/src/
  common/               database, model calls (retries, timeouts), background job queue
  modules/chat/         routes, controller, service, repo, and the agent (Ray's instructions and tools)
  modules/memory/
    time/               turns "last Tuesday" into exact dates
    facts/              long-term facts about the user, with their history
    claims/             checkable facts from the web, for "has it changed?"
    summaries/          day, week, month and year summaries with links to the turns
    search/             keyword and meaning search over past turns
    context/            token budgets and chat compaction
    persona/            Ray's backstory
    memory.tools.ts     the memory tools the agent calls
    memory.enrich.ts    background work after each reply
  modules/health/       GET /api/health
server/drizzle/         SQL migrations, applied when the server starts
```

## Troubleshooting

- **"Could not start Postgres"**: start Docker Desktop, then run `npm run dev` again.
- **The web app says it cannot reach the API** (`ECONNREFUSED`, port 3001): another process is
  using port 3001, or the API stopped. Stop other `npm run dev` windows and run it again.
  `http://localhost:3001/api/health` should return `{"ok":true,"db":true}`.
- **"OPENAI_API_KEY is not set"**: add it to `.env` and restart `npm run dev`.

## Notes

- There is one user and no login.
- Postgres uses host port **54329**, not 5432, so it does not clash with a local Postgres.
- Memory work (profile facts, claims, embeddings, summaries) runs in the server right after each
  reply has been sent. If it fails or the server stops, it is retried after the next message.
