import { Router } from "express";
import { ChatRequest } from "./chat.schema.js";
import { streamReply } from "./chat.service.js";

export const chatRouter = Router();

// Streams the assistant's reply as plain text chunks.
chatRouter.post("/chat", async (req, res) => {
  const parsed = ChatRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Body must be { messages: [{ role, content }] }" });
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: "OPENAI_API_KEY is not set. Add it to .env and restart." });
    return;
  }

  const controller = new AbortController();
  res.on("close", () => controller.abort());

  try {
    const result = await streamReply(parsed.data.messages, controller.signal);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.flushHeaders();

    for await (const chunk of result.toTextStream()) {
      res.write(chunk);
    }
    await result.completed;
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
  }
});
