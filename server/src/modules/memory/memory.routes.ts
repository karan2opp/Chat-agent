import { Router } from "express";
import { asyncHandler } from "../../common/http.js";
import { getProfile } from "./memory.controller.js";

export const memoryRouter = Router();

memoryRouter.get("/memory/profile", asyncHandler(getProfile));
