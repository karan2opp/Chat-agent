import { z } from "zod";

export const ChatRequest = z.object({
  chatId: z.uuid().optional(),
  message: z.string().trim().min(1).max(8000),
  // The user's IANA time zone (e.g. "Asia/Kolkata"), used to work out what "yesterday" means.
  timeZone: z.string().max(64).optional(),
});

export const ChatIdParam = z.object({ id: z.uuid() });

export type ChatMessage = { role: "user" | "assistant"; content: string };
