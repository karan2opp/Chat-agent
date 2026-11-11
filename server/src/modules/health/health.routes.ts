import { Router } from "express";
import { pool } from "../../common/db/pool.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: true });
  } catch {
    res.status(503).json({ ok: false, db: false });
  }
});
