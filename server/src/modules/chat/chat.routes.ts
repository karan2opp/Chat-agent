import { Router } from "express";
import { ChatIdParam, ChatRequest } from "./chat.schema.js";
import {
  ChatNotFoundError,
  getChatWithTurns,
  listChats,
  saveTurn,
  startTurn,
  streamReply,
} from "./chat.service.js";

export const chatRouter = Router();

// Streams the assistant's reply as plain text. The chat id comes back in the X-Chat-Id header.
// Nothing is written to the database until the whole reply has been streamed.
chatRouter.post("/chat", async (req, res) => {
  const parsed = ChatRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Body must be { chatId?: uuid, message: string }" });
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: "OPENAI_API_KEY is not set. Add it to .env and restart." });
    return;
  }

  const controller = new AbortController();
  res.on("close", () => controller.abort());

  let turn;
  try {
    turn = await startTurn(parsed.data.chatId, parsed.data.message);
  } catch (err) {
    if (err instanceof ChatNotFoundError) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }
    console.error("chat setup error:", err);
    res.status(500).json({ error: "Could not load the chat" });
    return;
  }

  let reply = "";
  try {
    const result = await streamReply(turn.messages, controller.signal);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Chat-Id", turn.chatId);
    res.flushHeaders();

    for await (const chunk of result.toTextStream()) {
      reply += chunk;
      res.write(chunk);
    }
    await result.completed;
    const completed = !controller.signal.aborted;

    // All text has already been sent. Saving before closing means that by the time the client
    // sees the stream end, the turn is stored and shows up in the chat list.
    if (completed && reply) {
      try {
        await saveTurn(turn.chatId, parsed.data.message, reply, turn.askedAt);
      } catch (err) {
        console.error("could not save turn:", err instanceof Error ? err.message : err);
      }
    }
    res.end();
  } catch (err) {
    if (controller.signal.aborted) return;
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("chat error:", message);
    if (res.headersSent) {
      res.write(`\n\n[error: ${message}]`);
      res.end();
    } else {
      res.status(500).json({ error: message });
    }
    return;
  }
});

chatRouter.get("/chats", async (_req, res) => {
  res.json(await listChats());
});

chatRouter.get("/chats/:id", async (req, res) => {
  const params = ChatIdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid chat id" });
    return;
  }
  const found = await getChatWithTurns(params.data.id);
  if (!found) {
    res.status(404).json({ error: "Chat not found" });
    return;
  }
  res.json(found);
});
