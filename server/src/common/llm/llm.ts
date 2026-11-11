import { Agent, run } from "@openai/agents";
import type { ZodType } from "zod";

// Small helpers for the background model calls (extracting claims, writing summaries). They run
// after a reply has been streamed, so they use the same model by default but can be pointed at a
// cheaper one with OPENAI_BACKGROUND_MODEL.
const model = () => process.env.OPENAI_BACKGROUND_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.6-luna";

export async function generateText(instructions: string, input: string): Promise<string> {
  const agent = new Agent({ name: "writer", instructions, model: model() });
  const result = await run(agent, input);
  const text = String(result.finalOutput ?? "").trim();
  if (!text) throw new Error("The model returned no text");
  return text;
}

export async function generateObject<T>(schema: ZodType<T>, instructions: string, input: string): Promise<T> {
  // The SDK types its output schema loosely; the model output is parsed and validated by zod.
  const agent = new Agent({ name: "extractor", instructions, model: model(), outputType: schema as any });
  const result = await run(agent, input);
  if (result.finalOutput === undefined || result.finalOutput === null) {
    throw new Error("The model returned no structured output");
  }
  return result.finalOutput as T;
}
