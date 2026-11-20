import type { Router } from 'express';
import { createNotImplementedRouter } from './not-implemented.js';

/**
 * TODO(Phase 6): POST /voice accepts audio, transcribes server-side, then runs the agent.
 * Protect with `requireAuth(tokenVerifier)` when implemented; take userId from
 * `res.locals.auth` only.
 */
export function createVoiceRouter(): Router {
  return createNotImplementedRouter('Voice');
}
