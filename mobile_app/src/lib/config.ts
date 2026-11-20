/**
 * Public, non-secret app configuration.
 *
 * Only EXPO_PUBLIC_* variables are inlined into the bundle, and anything in the
 * bundle can be read by users. Never put API keys or tokens here: the app talks
 * only to our own API (see CLAUDE.md rules 1 and 2).
 */
export const config = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
} as const;
