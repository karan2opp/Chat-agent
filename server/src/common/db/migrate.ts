import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

// Migrations are idempotent (IF NOT EXISTS), so we simply run them in order on every start.
export async function migrate(): Promise<void> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await pool.query(await readFile(path.join(dir, file), "utf8"));
  }
}
