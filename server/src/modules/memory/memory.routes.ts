import { Router } from "express";
import { asyncHandler } from "../../common/http.js";
import * as factsRepo from "./facts/facts.repo.js";

export const memoryRouter = Router();

// What the assistant currently knows about the user, plus the values that were replaced.
memoryRouter.get(
  "/memory/profile",
  asyncHandler(async (_req, res) => {
    const [active, history] = await Promise.all([factsRepo.getActiveFacts(), factsRepo.getFactHistory()]);
    res.json({ active, history });
  }),
);
