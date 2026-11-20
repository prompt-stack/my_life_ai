/**
 * Background jobs placeholder. The server does the scheduling (rule 3):
 * reminders and recurring agents become BullMQ jobs that reach the phone as
 * Expo push notifications.
 *
 * TODO(Phase 6): add BullMQ + Redis (ask first). Requirements:
 *   - validate every job payload with Zod in the worker;
 *   - deterministic job IDs (e.g. `reminder:{reminderId}`) for dedupe;
 *   - retries with exponential backoff; idempotent handlers;
 *   - workers use the service-role client and always filter by `user_id`.
 */

export interface EnqueueOptions {
  /** Deterministic ID so retries/duplicates are deduplicated. */
  jobId: string;
  delayMs?: number;
}

export interface JobQueue<TPayload> {
  enqueue(payload: TPayload, options: EnqueueOptions): Promise<void>;
}

export type JobHandler<TPayload> = (payload: TPayload) => Promise<void>;

export interface ReminderJobPayload {
  userId: string;
  reminderId: string;
}
