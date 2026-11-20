import { Router } from 'express';
import type { Clock } from '../lib/clock.js';

export interface HealthDeps {
  version: string;
  clock: Clock;
  /** Seconds since process start; injectable for tests. */
  uptimeSeconds: () => number;
}

export interface HealthResponse {
  status: 'ok';
  version: string;
  uptimeSeconds: number;
  /** Server time, UTC ISO 8601. */
  time: string;
}

/** Liveness probe. Public (no auth), no external dependencies. */
export function createHealthRouter(deps: HealthDeps): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      version: deps.version,
      uptimeSeconds: Math.floor(deps.uptimeSeconds()),
      time: deps.clock.now().toISOString(),
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  return router;
}
