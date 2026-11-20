/**
 * Web search placeholder.
 * TODO(Phase 5): search provider client + SSRF-guarded page fetcher.
 */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchProvider {
  search(query: string, options: { limit: number }): Promise<SearchResult[]>;
}
