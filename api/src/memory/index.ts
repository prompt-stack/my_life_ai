/**
 * Long-term memory placeholder (`memories` table + pgvector).
 *
 * TODO(Phase 4): implement a Supabase-backed `MemoryStore` and an
 * `EmbeddingProvider` (OpenAI embeddings, cached in Redis per user), then expose
 * `remember` (write) and `recall` (read) as tools in `tools/`.
 */

export interface Memory {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
}

export interface RecallOptions {
  limit: number;
}

export interface MemoryStore {
  remember(userId: string, content: string): Promise<Memory>;
  recall(userId: string, query: string, options: RecallOptions): Promise<Memory[]>;
}

export interface EmbeddingProvider {
  embed(texts: readonly string[]): Promise<number[][]>;
}
