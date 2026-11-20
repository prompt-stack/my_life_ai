import { Router } from 'express';
import { NotImplementedError } from '../lib/errors.js';

/** Router that answers every method/path under its mount point with 501. */
export function createNotImplementedRouter(feature: string): Router {
  const router = Router();
  router.use(() => {
    throw new NotImplementedError(`${feature} is not implemented yet`);
  });
  return router;
}
