import { Router } from "express";
import { asyncHandler } from "../../common/http.js";
import { getChat, getChats, postChat } from "./chat.controller.js";

export const chatRouter = Router();

// postChat handles its own errors: once the reply has started streaming, a failure has to be
// written into the stream rather than sent as a status code.
chatRouter.post("/chat", postChat);
chatRouter.get("/chats", asyncHandler(getChats));
chatRouter.get("/chats/:id", asyncHandler(getChat));
