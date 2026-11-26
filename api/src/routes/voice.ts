import { VoiceRequestSchema, type VoiceRequest, type VoiceResponse } from '@mylife/shared';
import { Router } from 'express';
import type { VoiceReplyInput } from '../agents/voice-assistant.js';
import type { Clock } from '../lib/clock.js';
import { validate } from '../lib/http/validate.js';

export interface VoiceRouterDeps {
  clock: Clock;
  defaultTimezone: string;
  /** `generateVoiceReply` bound to its dependencies (see app.ts). */
  generateReply: (input: VoiceReplyInput) => Promise<VoiceResponse>;
}

/**
 * POST /voice: the phone transcribes speech on-device, sends the text here,
 * and speaks the returned reply with on-device TTS.
 *
 * Device actions take two requests (the server stays stateless):
 * 1. `{ text, history, device }` → `{ reply, deviceAction? }`.
 * 2. After running the action: the same `text` and `history` plus
 *    `toolResult` → `{ reply }` (the spoken confirmation).
 *
 * TODO(Phase 1): protect with `requireAuth(tokenVerifier)` and take userId from
 * `res.locals.auth` only (CLAUDE.md rule 7); enforce the per-user daily limit.
 */
export function createVoiceRouter(deps: VoiceRouterDeps): Router {
  const router = Router();

  router.post('/', validate({ body: VoiceRequestSchema }), async (_req, res) => {
    // validate() stored the parsed body; the schema guarantees this shape.
    const body = res.locals.validated?.body as VoiceRequest;

    // Stop paying for a model call nobody will hear.
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) abort.abort();
    });

    const response: VoiceResponse = await deps.generateReply({
      text: body.text,
      history: body.history,
      timezone: body.timezone ?? deps.defaultTimezone,
      now: deps.clock.now(),
      device: body.device,
      toolResult: body.toolResult,
      invocation: body.invocation,
      requestId: res.locals.requestId,
      signal: abort.signal,
    });

    res.set('Cache-Control', 'no-store').json(response);
  });

  return router;
}
