// The length of the vectors stored in turn_embeddings. Kept in its own file so the database
// schema can use it without loading the OpenAI client. If you switch to an embedding model with
// a different size, change this and generate a migration.
export const EMBEDDING_DIMENSIONS = 1536;
