/**
 * Google integration placeholder.
 * TODO(Phase 5): OAuth flow, encrypted token storage, Gmail + Calendar clients.
 */
export interface GoogleTokenStore {
  getAccessToken(userId: string): Promise<string | undefined>;
}
