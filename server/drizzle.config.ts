import { defineConfig } from "drizzle-kit";

// Every module keeps its tables in *.table.ts; `npm run db:generate` turns changes into SQL in ./drizzle.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/modules/**/*.table.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
