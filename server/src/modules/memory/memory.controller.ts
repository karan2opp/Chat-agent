import type { Request, Response } from "express";
import * as factsRepo from "./facts/facts.repo.js";

// What the assistant currently knows about the user, plus the values that were replaced.
export async function getProfile(_req: Request, res: Response): Promise<void> {
  const [active, history] = await Promise.all([factsRepo.getActiveFacts(), factsRepo.getFactHistory()]);
  res.json({ active, history });
}
