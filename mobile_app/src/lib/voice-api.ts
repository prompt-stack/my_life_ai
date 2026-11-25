import {
  VoiceResponseSchema,
  type VoiceRequestInput,
  type VoiceResponse,
} from '@mylife/shared';

import { config } from '@/lib/config';

const REQUEST_TIMEOUT_MS = 25_000;

export type VoiceApiErrorKind =
  | 'ai_not_configured'
  | 'rate_limited'
  | 'timeout'
  | 'server'
  | 'network'
  | 'bad_response';

/** Failure from `POST /voice`, reduced to a kind the UI can phrase. Never carries the reply text. */
export class VoiceApiError extends Error {
  constructor(readonly kind: VoiceApiErrorKind) {
    super(kind);
    this.name = 'VoiceApiError';
  }
}

function kindFromCode(code: unknown, status: number): VoiceApiErrorKind {
  switch (code) {
    case 'ai_not_configured':
      return 'ai_not_configured';
    case 'ai_rate_limited':
    case 'rate_limited':
      return 'rate_limited';
    case 'ai_timeout':
      return 'timeout';
    default:
      return status === 429 ? 'rate_limited' : 'server';
  }
}

/**
 * Sends the transcript to our API. Aborts after 25 s, or earlier when `signal` aborts
 * (in which case the original AbortError is rethrown so callers can ignore it).
 */
export async function sendVoiceMessage(
  body: VoiceRequestInput,
  signal: AbortSignal,
): Promise<VoiceResponse> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal.addEventListener('abort', onAbort);

  try {
    const response = await fetch(`${config.apiUrl}/voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      const code =
        typeof payload === 'object' && payload !== null && 'error' in payload
          ? (payload.error as { code?: unknown } | null)?.code
          : undefined;
      throw new VoiceApiError(kindFromCode(code, response.status));
    }

    const parsed = VoiceResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new VoiceApiError('bad_response');
    return parsed.data;
  } catch (error) {
    if (error instanceof VoiceApiError) throw error;
    if (signal.aborted) throw error;
    throw new VoiceApiError(timedOut ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}
