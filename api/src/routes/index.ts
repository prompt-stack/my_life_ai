import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { TokenVerifier } from '../lib/auth.js';
import type { Clock } from '../lib/clock.js';
import { createApprovalsRouter } from './approvals.js';
import { createChatRouter } from './chat.js';
import { createHealthRouter } from './health.js';
import { createIntegrationsRouter } from './integrations.js';
import { createTasksRouter } from './tasks.js';
import { createVoiceRouter, type VoiceRouterDeps } from './voice.js';

export interface RoutesDeps {
  version: string;
  clock: Clock;
  uptimeSeconds: () => number;
  /** Stricter limiter for expensive LLM routes. */
  chatRateLimiter: RequestHandler;
  /** Separate per-IP budget for voice turns (each one is a model call). */
  voiceRateLimiter: RequestHandler;
  voice: Omit<VoiceRouterDeps, 'clock'>;
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
  router.use('/voice', deps.voiceRateLimiter, createVoiceRouter({ clock: deps.clock, ...deps.voice }));
  router.use('/tasks', createTasksRouter());
  router.use('/approvals', createApprovalsRouter());
  router.use('/integrations', createIntegrationsRouter());

  return router;
}
