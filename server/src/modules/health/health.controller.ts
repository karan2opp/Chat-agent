import type { Request, Response } from "express";
import { pool } from "../../common/db/pool.js";

// Reports whether the server is up and can reach the database.
export async function getHealth(_req: Request, res: Response): Promise<void> {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: true });
  } catch {
    res.status(503).json({ ok: false, db: false });
  }
}
