import type { Router } from 'express';
import { createNotImplementedRouter } from './not-implemented.js';

/**
 * TODO(Phase 1): CRUD for tasks through a TaskService + RLS-scoped TaskRepository.
 * Protect with `requireAuth(tokenVerifier)` when implemented; take userId from
 * `res.locals.auth` only.
 */
export function createTasksRouter(): Router {
  return createNotImplementedRouter('Tasks');
}
