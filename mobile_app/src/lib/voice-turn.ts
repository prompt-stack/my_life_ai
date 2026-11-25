import type { VoiceTurn } from '@mylife/shared';

import { executeDeviceAction } from '@/device';
import { getDeviceInfo } from '@/lib/device-info';
import { sendVoiceMessage } from '@/lib/voice-api';

type Params = {
  text: string;
  history: VoiceTurn[];
  timezone: string | undefined;
  signal: AbortSignal;
  /** Called when the phone is about to run a device action. */
  onExecuting?: () => void;
};

/**
 * One user turn against the stateless `POST /voice`. When the server answers with a device action,
 * the phone runs it and sends the result back with the same text and history to get the spoken
 * reply. At most one device action runs per turn. Returns `null` if cancelled before finishing.
 * Throws `VoiceApiError` on request failures.
 */
export async function runVoiceTurn({
  text,
  history,
  timezone,
  signal,
  onExecuting,
}: Params): Promise<string | null> {
  const device = getDeviceInfo();
  const first = await sendVoiceMessage({ text, history, timezone, device }, signal);
  const action = first.deviceAction;
  if (!action) return first.reply;

  // Rule 8: never act after the user cancelled.
  if (signal.aborted) return null;
  onExecuting?.();
  const result = await executeDeviceAction(action);
  if (signal.aborted) return null;

  const second = await sendVoiceMessage(
    {
      text,
      history,
      timezone,
      device,
      toolResult: { callId: action.callId, name: action.name, args: action.args, result },
    },
    signal,
  );
  // A second deviceAction is ignored: only its reply is spoken.
  return second.reply;
}
