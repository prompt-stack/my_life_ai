import type { Router } from 'express';
import { createNotImplementedRouter } from './not-implemented.js';

/**
 * TODO(Phase 7): list pending approvals; approve/reject resumes or cancels the paused run.
 * Protect with `requireAuth(tokenVerifier)` when implemented; take userId from
 * `res.locals.auth` only.
 */
export function createApprovalsRouter(): Router {
  return createNotImplementedRouter('Approvals');
}
