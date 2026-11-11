import { z } from "zod";

export const ChatRequest = z.object({
  chatId: z.uuid().optional(),
  message: z.string().trim().min(1).max(8000),
});

export const ChatIdParam = z.object({ id: z.uuid() });

export type ChatMessage = { role: "user" | "assistant"; content: string };
