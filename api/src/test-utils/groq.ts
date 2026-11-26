import { BadRequestError } from 'groq-sdk';
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageToolCall,
} from 'groq-sdk/resources/chat/completions';
import { vi } from 'vitest';
import type { ModelClient } from '../lib/groq.js';

export interface FakeCompletionOptions {
  /** `null` simulates a reply with no content. */
  content?: string | null;
  /** Widened to string so tests can send values the SDK type omits (e.g. `content_filter`). */
  finishReason?: string;
  /** Simulates a response with an empty `choices` array. */
  noChoices?: boolean;
  /** Tool calls on the assistant message (use `fakeToolCall`). */
  toolCalls?: ChatCompletionMessageToolCall[];
}

/** A model tool call. `args` is stringified unless it is already a string (to test bad JSON). */
export function fakeToolCall(name: string, args: unknown, id = 'call_test_1'): ChatCompletionMessageToolCall {
  return {
    id,
    type: 'function',
    function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
  };
}

/** The 400 Groq returns when gpt-oss emits a malformed tool call. */
export function toolUseFailedError(): BadRequestError {
  return new BadRequestError(
    400,
    {
      error: {
        message: 'Failed to call a function. Please adjust your prompt.',
        type: 'invalid_request_error',
        code: 'tool_use_failed',
        failed_generation: '<|call|>createAlarm{bad',
      },
    },
    undefined,
    new Headers(),
  );
}

/** A minimal Chat Completions response. Only fields our code reads are meaningful. */
export function fakeCompletion(options: FakeCompletionOptions = {}): ChatCompletion {
  const content = options.content === undefined ? 'Hello there.' : options.content;
  return {
    id: 'chatcmpl_test',
    object: 'chat.completion',
    created: 1_767_317_400,
    model: 'openai/gpt-oss-20b',
    choices: options.noChoices
      ? []
      : [
          {
            index: 0,
            logprobs: null,
            finish_reason: options.finishReason ?? (options.toolCalls ? 'tool_calls' : 'stop'),
            message: { role: 'assistant', content, ...(options.toolCalls ? { tool_calls: options.toolCalls } : {}) },
          },
        ],
    usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 },
    // Cast because `finish_reason` is deliberately widened above.
  } as ChatCompletion;
}

/** Fake client whose `chat.completions.create` is a Vitest mock. Never calls the network. */
export function fakeModelClient(
  impl: (
    params: ChatCompletionCreateParamsNonStreaming,
    options?: { signal?: AbortSignal },
  ) => Promise<ChatCompletion> = () => Promise.resolve(fakeCompletion()),
) {
  const create = vi.fn(impl);
  const client: ModelClient = { chat: { completions: { create } } };
  return { client, create };
}
