import { Agent, webSearchTool } from "@openai/agents";

const INSTRUCTIONS = `You are a helpful chat assistant with one tool: web search.
- Use web search for anything that may have changed recently (prices, versions, news, releases) and for facts you are unsure about.
- Be concise and direct. Cite the sources you used as links.
- If you could not verify something, say so instead of guessing.`;

export const agent = new Agent({
  name: "minimi",
  instructions: INSTRUCTIONS,
  model: process.env.OPENAI_MODEL ?? "gpt-5.6-luna",
  tools: [webSearchTool()],
});
