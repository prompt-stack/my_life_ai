/**
 * Supabase data access placeholder. No client is created yet and no network
 * calls are made.
 *
 * TODO(Phase 1): add `@supabase/supabase-js` (ask first) and implement:
 *   - `createUserScopedClient(accessToken)`: a client built WITH the user's JWT,
 *     so Row Level Security applies. Use this in request paths.
 *   - `createServiceClient()`: service-role client for workers/admin only. Every
 *     query through it must filter by an explicit `user_id`.
 * Repositories (e.g. `TaskRepository`) will depend on a narrow interface, not
 * on the Supabase client type, so services can be tested with fakes.
 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export type SupabaseClientFactory = (accessToken: string) => unknown;
