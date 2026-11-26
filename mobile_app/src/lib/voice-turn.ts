import type { VoiceInvocation, VoiceTurn } from '@mylife/shared';

import { executeDeviceAction } from '@/device';
import { getDeviceInfo } from '@/lib/device-info';
import { sendVoiceMessage } from '@/lib/voice-api';

type Params = {
  text: string;
  history: VoiceTurn[];
  timezone: string | undefined;
  signal: AbortSignal;
  /** How the user started this turn (tap, wake word, ...). */
  invocation?: VoiceInvocation;
  /** Called when the phone is about to run a device action. */
  onExecuting?: () => void;
};

export type VoiceTurnResult = {
  reply: string;
  /** A device action failed because an OS permission is missing: the app offers the setup checklist. */
  permissionRequired: boolean;
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
  invocation,
  onExecuting,
}: Params): Promise<VoiceTurnResult | null> {
  const device = await getDeviceInfo();
  const first = await sendVoiceMessage({ text, history, timezone, device, invocation }, signal);
  const action = first.deviceAction;
  if (!action) return { reply: first.reply, permissionRequired: false };

  // Rule 8: never act after the user cancelled.
  if (signal.aborted) return null;
  onExecuting?.();
  const result = await executeDeviceAction(action);
  if (signal.aborted) return null;

  // Re-read device info: the alarm list may have changed during the action.
  const second = await sendVoiceMessage(
    {
      text,
      history,
      timezone,
      device: await getDeviceInfo(),
      toolResult: { ...action, result },
      invocation,
    },
    signal,
  );
  // A second deviceAction is ignored: only its reply is spoken.
  const permissionRequired = !result.ok && result.error === 'permission_required';
  return { reply: second.reply, permissionRequired };
}
