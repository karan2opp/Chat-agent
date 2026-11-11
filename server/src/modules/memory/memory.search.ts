import { embedOne } from "../../common/llm/embeddings.js";
import * as repo from "./memory.repo.js";
import { fuseRanked } from "./rank-fusion.js";

// Searching past turns by words and by meaning at once. The keyword search catches exact names
// and numbers; the meaning search catches paraphrases ("cheap database host" finds "Postgres on
// a free tier"). Their results are merged so that a turn found by both ranks first.
// If the embedding service is unavailable, it quietly falls back to keywords alone.
export async function searchMemory(
  query: string,
  range: { from: Date; to: Date } | undefined,
  limit: number,
): Promise<repo.MemoryTurn[]> {
  const byWords = repo.searchTurns(query, range, limit);
  const byMeaning = embedOne(query)
    .then((vector) => repo.searchTurnsByMeaning(vector, range, limit))
    .catch((err) => {
      console.error("meaning search unavailable, using keywords only:", err instanceof Error ? err.message : err);
      return [] as repo.MemoryTurn[];
    });

  const [words, meaning] = await Promise.all([byWords, byMeaning]);
  return fuseRanked([words, meaning], (t) => t.id).slice(0, limit);
}
