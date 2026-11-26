import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Public, non-secret app configuration.
 *
 * Only EXPO_PUBLIC_* variables are inlined into the bundle, and anything in the
 * bundle can be read by users. Never put API keys or tokens here: the app talks
 * only to our own API (see CLAUDE.md rules 1 and 2).
 */

const DEFAULT_API_URL = 'http://localhost:3000';
const DEFAULT_API_PORT = 3000;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

type ResolveApiUrlInput = {
  isDev: boolean;
  /** Metro dev-server host, e.g. "192.168.100.35:8081" (dev only). */
  hostUri?: string | null;
  platform: string;
  /** EXPO_PUBLIC_API_URL: used for release builds and as the dev fallback. */
  envUrl?: string | null;
  /** EXPO_PUBLIC_API_URL_OVERRIDE: forces a URL in dev (tunnels, remote backends). */
  override?: string | null;
  port?: number;
};

/** Extracts the hostname from "host:port", "[::1]:8081" or a bare host. */
function hostnameFromHostUri(hostUri: string): string | null {
  const value = hostUri.trim().replace(/^[a-z]+:\/\//i, '').split('/')[0] ?? '';
  const bracketed = /^\[([^\]]+)\]/.exec(value);
  if (bracketed?.[1]) return bracketed[1];
  // Bare IPv6 (several colons, no brackets) has no port to strip.
  if ((value.match(/:/g) ?? []).length > 1) return value;
  return value.split(':')[0] || null;
}

/**
 * Pure resolver for the API base URL.
 * Dev: override, else the Metro host (so it follows the Mac's current LAN IP),
 * else envUrl, else localhost. Release: envUrl, else localhost.
 */
export function resolveApiUrl({
  isDev,
  hostUri,
  platform,
  envUrl,
  override,
  port = DEFAULT_API_PORT,
}: ResolveApiUrlInput): string {
  if (!isDev) return envUrl || DEFAULT_API_URL;
  if (override) return override;

  const host = hostUri ? hostnameFromHostUri(hostUri) : null;
  if (host) {
    // The Android emulator reaches the Mac through 10.0.2.2, not localhost.
    const resolved = platform === 'android' && LOOPBACK_HOSTS.has(host) ? '10.0.2.2' : host;
    const printable = resolved.includes(':') ? `[${resolved}]` : resolved;
    return `http://${printable}:${port}`;
  }
  return envUrl || DEFAULT_API_URL;
}

const parsedPort = Number(process.env.EXPO_PUBLIC_API_PORT);

const apiUrl = resolveApiUrl({
  isDev: __DEV__,
  hostUri: Constants.expoConfig?.hostUri,
  platform: Platform.OS,
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  override: process.env.EXPO_PUBLIC_API_URL_OVERRIDE,
  port: Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_API_PORT,
});

if (__DEV__) {
  console.info(`[config] API URL: ${apiUrl}`);
}

export const config = { apiUrl } as const;
