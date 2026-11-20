/**
 * Tracing placeholder. Agent runs and tool calls will be recorded to
 * `agent_runs` / `tool_calls` (rule 6) through this interface.
 *
 * TODO(Phase 1): implement a Supabase-backed `RunLogger` (input, tools, tokens,
 * latency, errors). Consider OpenAI Agents SDK tracing processors here too.
 */

export interface ToolCallRecord {
  runId: string;
  toolName: string;
  input: unknown;
  ok: boolean;
  errorCode?: string;
  latencyMs: number;
}

export interface AgentRunRecord {
  runId: string;
  userId: string;
  input: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  error?: string;
}

export interface RunLogger {
  recordRun(run: AgentRunRecord): Promise<void>;
  recordToolCall(call: ToolCallRecord): Promise<void>;
}

/** No-op until persistence exists. */
export const noopRunLogger: RunLogger = {
  recordRun: () => Promise.resolve(),
  recordToolCall: () => Promise.resolve(),
};
