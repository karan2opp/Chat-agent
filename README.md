# minimi: a chat agent that remembers

A chat agent with web search and a memory layer built for time-anchored questions:

- "What did I ask you on 3 November? Is your answer still correct today?"
- "Last Tuesday I asked about Postgres hosting. Has any pricing changed since then?"
- "On Monday we shortlisted 5 CRM tools. Has any of them changed pricing?"

How it works, and why, is in [DESIGN.md](DESIGN.md).

## Run it

You need Node 22 (tested on 22.12) and Docker (for Postgres).

```bash
npm install
cp .env.example .env        # then put your OpenAI key in .env
npm run dev
```

Open http://localhost:5173. `npm run dev` starts Postgres in Docker (host port 54329), applies the
database migrations, and starts the API (port 3001) and the web app (port 5173).

The only required key is `OPENAI_API_KEY`. Everything else in [.env.example](.env.example) has a default.

## Try it

1. Ask something that needs the web: "What are the monthly prices of Pipedrive's and HubSpot's cheapest paid plans?"
2. Ask about it later, even in a new chat: "What did I ask you yesterday?", "Has anything I asked you about last week changed?"
3. Tell it about yourself ("I'm Karan, a backend engineer in Pune") and start a new chat: it remembers.
4. See what it knows about you: http://localhost:3001/api/memory/profile

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Postgres + API + web app, with reload |
| `npm test` | Unit tests (date resolver, token budgets, claims, facts, rank fusion) |
| `npm run build` | Type-check and build the server and client |
| `npm run db:generate` | Generate a migration after editing a `*.table.ts` file |

## Layout

```
client/                 React + Vite chat screen with a sidebar of past chats
server/src/
  common/               database, LLM helpers, background job queue
  modules/chat/         chats, turns, the agent, the streaming endpoint
  modules/memory/       date resolver, memory tools, claims, profile, summaries, search
  modules/health/       GET /api/health
server/drizzle/         generated SQL migrations, applied on server start
```

## Notes

- Postgres runs on host port **54329** (not 5432) so it does not clash with a local Postgres.
- The app has a single user; there is no login.
- Memory upkeep (embeddings, claims, summaries) runs in the server process after a reply is sent,
  so it is lost if the server stops at that moment. The embedding step catches up on the next turn.
