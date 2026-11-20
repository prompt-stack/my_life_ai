import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { TokenVerifier } from '../lib/auth.js';
import type { Clock } from '../lib/clock.js';
import { createApprovalsRouter } from './approvals.js';
import { createChatRouter } from './chat.js';
import { createHealthRouter } from './health.js';
import { createIntegrationsRouter } from './integrations.js';
import { createTasksRouter } from './tasks.js';
import { createVoiceRouter } from './voice.js';

export interface RoutesDeps {
  version: string;
  clock: Clock;
  uptimeSeconds: () => number;
  /** Stricter limiter for expensive LLM routes. */
  chatRateLimiter: RequestHandler;
  /**
   * Passed to `requireAuth()` by protected routers as they are implemented.
   * TODO(Phase 1): e.g. `router.use('/tasks', requireAuth(deps.tokenVerifier), createTasksRouter(...))`.
   */
  tokenVerifier: TokenVerifier;
}

/** Mounts every feature router under its path. */
export function createRoutes(deps: RoutesDeps): Router {
  const router = Router();

  router.use('/health', createHealthRouter(deps));
  router.use('/chat', deps.chatRateLimiter, createChatRouter());
  router.use('/voice', deps.chatRateLimiter, createVoiceRouter());
  router.use('/tasks', createTasksRouter());
  router.use('/approvals', createApprovalsRouter());
  router.use('/integrations', createIntegrationsRouter());

  return router;
}
