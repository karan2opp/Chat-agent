import { z } from "zod";

export const ChatRequest = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .min(1),
});

export type ChatMessage = z.infer<typeof ChatRequest>["messages"][number];
