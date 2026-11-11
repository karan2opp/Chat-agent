import OpenAI from "openai";

// Turns text into vectors so that "cheap database hosting" can find a turn that only says
// "Postgres on Neon's free tier". The default model produces vectors of EMBEDDING_DIMENSIONS.
export const embeddingModel = () => process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

// Embedding models read about 8k tokens; this keeps long answers safely under that.
const MAX_CHARS = 20_000;

let client: OpenAI | undefined;

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  client ??= new OpenAI();
  const response = await client.embeddings.create({
    model: embeddingModel(),
    input: texts.map((t) => t.slice(0, MAX_CHARS)),
  });
  return response.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function embedOne(text: string): Promise<number[]> {
  return (await embed([text]))[0];
}
