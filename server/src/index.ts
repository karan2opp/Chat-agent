import express from "express";
import { migrate } from "./common/db/migrate.js";
import { chatRouter } from "./modules/chat/chat.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { memoryRouter } from "./modules/memory/memory.routes.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use("/api", healthRouter);
app.use("/api", chatRouter);
app.use("/api", memoryRouter);

const port = Number(process.env.PORT ?? 3001);

try {
  await migrate();
} catch (err) {
  console.error("Could not run migrations. Is Postgres up? (docker compose up -d --wait)");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

app.listen(port, () => console.log(`server listening on http://localhost:${port}`));
