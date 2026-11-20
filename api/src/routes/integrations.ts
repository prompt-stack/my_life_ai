import type { Router } from 'express';
import { createNotImplementedRouter } from './not-implemented.js';

/**
 * TODO(Phase 5): connect/disconnect providers (Google OAuth), status per provider.
 * Protect with `requireAuth(tokenVerifier)` when implemented; take userId from
 * `res.locals.auth` only.
 */
export function createIntegrationsRouter(): Router {
  return createNotImplementedRouter('Integrations');
}
