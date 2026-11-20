import type { Router } from 'express';
import { createNotImplementedRouter } from './not-implemented.js';

/**
 * TODO(Phase 1): POST /chat streams agent events over SSE (see agents/orchestrator.ts).
 * Protect with `requireAuth(tokenVerifier)` when implemented; take userId from
 * `res.locals.auth` only.
 */
export function createChatRouter(): Router {
  return createNotImplementedRouter('Chat');
}
