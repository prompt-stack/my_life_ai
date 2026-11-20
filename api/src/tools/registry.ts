import { z } from 'zod';
import { toolError, type ToolContext, type ToolDefinition, type ToolResult } from './types.js';

export interface ToolRegistry {
  get(name: string): ToolDefinition | undefined;
  list(): readonly ToolDefinition[];
  /**
   * The single entry point for running a tool with model-provided arguments.
   * Enforces argument validation and risk policy in code, not in the prompt.
   */
  execute(name: string, ctx: ToolContext, rawInput: unknown): Promise<ToolResult<unknown>>;
}

export interface ToolRegistryLogger {
  error(obj: object, msg: string): void;
}

/** Open/closed: add a tool by passing another module here, not by editing a switch. */
export function createToolRegistry(
  tools: readonly ToolDefinition[],
  logger?: ToolRegistryLogger,
): ToolRegistry {
  const byName = new Map<string, ToolDefinition>();
  for (const tool of tools) {
    if (byName.has(tool.name)) {
      throw new Error(`Duplicate tool name: ${tool.name}`);
    }
    byName.set(tool.name, tool);
  }

  async function execute(name: string, ctx: ToolContext, rawInput: unknown): Promise<ToolResult<unknown>> {
    const tool = byName.get(name);
    if (!tool) {
      return toolError('unknown_tool', `No tool named "${name}" is available`);
    }

    // Never trust model output: parse before anything else.
    const parsed = tool.input.safeParse(rawInput);
    if (!parsed.success) {
      return toolError('invalid_arguments', z.prettifyError(parsed.error));
    }

    if (tool.riskLevel === 'sensitive') {
      // TODO(Phase 7): create an `approvals` row and pause the run until the
      // user approves in the app. Until then sensitive tools never execute.
      return toolError('approval_required', `"${name}" needs your approval, which is not available yet`);
    }

    if (tool.target === 'device') {
      // TODO(Phase 3): forward device tool requests to the mobile app.
      return toolError('device_unavailable', `"${name}" must run on your phone, which is not connected yet`);
    }

    try {
      return await tool.execute(ctx, parsed.data);
    } catch (err) {
      logger?.error({ err, tool: name, requestId: ctx.requestId }, 'tool execution failed');
      return toolError('tool_failed', `"${name}" failed unexpectedly`);
    }
  }

  return {
    get: (name) => byName.get(name),
    list: () => [...byName.values()],
    execute,
  };
}
