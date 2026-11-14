import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read .env itself; Studio needs DATABASE_URL from the root .env.
if (!process.env.DATABASE_URL && existsSync("../.env")) process.loadEnvFile("../.env");

// Every module keeps its tables in *.table.ts; `npm run db:generate` turns changes into SQL in ./drizzle.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/modules/**/*.table.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
