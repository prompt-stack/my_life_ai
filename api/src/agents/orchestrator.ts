import { NotImplementedError } from '../lib/errors.js';

/**
 * Orchestrator contract. The real implementation (OpenAI Agents SDK) detects
 * intent, plans multi-step requests, routes to specialist agents
 * (agents-as-tools) and reads/writes memory. See ./README.md.
 *
 * TODO(Phase 1): implement with the OpenAI Agents SDK. Requirements:
 *   - cap max turns and token budget per run;
 *   - pass `timezone` and `now` into the system context on every run;
 *   - execute tools only through `ToolRegistry.execute` (validation + risk policy);
 *   - wrap untrusted content (emails, web pages, documents, tool results) in
 *     clearly delimited data blocks, never as instructions;
 *   - log each run and tool call through `RunLogger` (lib/tracing.ts).
 */

export interface OrchestratorInput {
  /** From the verified JWT only. */
  userId: string;
  conversationId?: string;
  message: string;
  timezone: string;
  now: Date;
  requestId?: string;
}

/** Events streamed to the client over SSE from `POST /chat`. */
export type OrchestratorEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; toolName: string; status: 'started' | 'succeeded' | 'failed'; summary?: string }
  | { type: 'approval_required'; approvalId: string; summary: string }
  | { type: 'done'; runId: string }
  | { type: 'error'; code: string; message: string };

export interface Orchestrator {
  run(input: OrchestratorInput): AsyncIterable<OrchestratorEvent>;
}

/** Stub: no model calls. Fails clearly so nothing pretends to work. */
export function createStubOrchestrator(): Orchestrator {
  return {
    run: () => ({
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(new NotImplementedError('The agent is not implemented yet')),
      }),
    }),
  };
}
