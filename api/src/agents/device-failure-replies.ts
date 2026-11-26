import type { DeviceInfo, DeviceToolError, VoiceToolResult } from '@mylife/shared';
import { alarmSoundName, formatClockTime } from '../tools/alarm-format.js';

/**
 * Spoken replies for failed device actions. They are deterministic on purpose:
 * in live tests the model mixed up failure reasons, and a wrong reason misleads
 * the user. So the model is not called for failures; each error code maps to
 * its own sentence.
 */

/** "your 6:30 AM alarm" when the phone's list still has it, else "that alarm". */
function alarmPhrase(alarmId: string, device: DeviceInfo | undefined): string {
  const alarm = device?.alarms?.find((candidate) => candidate.id === alarmId);
  return alarm ? `your ${formatClockTime(alarm)} alarm` : 'that alarm';
}

/** "set the alarm for 6:30 AM", phrased to follow "I couldn't". */
function describeAction(toolResult: VoiceToolResult, device: DeviceInfo | undefined): string {
  switch (toolResult.name) {
    case 'createAlarm':
      return `set the alarm for ${formatClockTime(toolResult.args)}`;
    case 'updateAlarm':
      return `change ${alarmPhrase(toolResult.args.alarmId, device)}`;
    case 'deleteAlarm':
      return `delete ${alarmPhrase(toolResult.args.alarmId, device)}`;
    case 'previewAlarmSound':
      return `play the ${alarmSoundName(toolResult.args.sound)} sound`;
    case 'stopAlarm':
      return 'stop the alarm';
    case 'snoozeAlarm':
      return 'snooze the alarm';
  }
}

export const ALARM_NOT_RINGING_REPLY = "That alarm isn't ringing anymore.";
export const SNOOZE_UNSUPPORTED_IPHONE_REPLY = "I can't snooze alarms on iPhone yet, but I can stop it.";

/** Points the user at the specific setting that is missing, most important first. */
function permissionReply(device: DeviceInfo | undefined): string {
  if (device?.platform === 'ios') {
    return 'I need permission to set alarms. Please allow alarms for MyLife in Settings.';
  }
  const permissions = device?.alarmPermissions;
  if (permissions?.exactAlarm === 'granted') {
    if (permissions.notifications === 'denied') {
      return 'I need permission to show alarms. Please allow notifications for MyLife, then try again.';
    }
    if (permissions.fullScreen === 'denied') {
      return 'I need permission to show alarms. Please allow full-screen alerts for MyLife, then try again.';
    }
  }
  return "I need permission to set alarms. Please allow 'Alarms & reminders' for MyLife, then try again.";
}

/** One honest spoken reply for a failed device action, specific to the error code and tool. */
export function deviceFailureReply(
  toolResult: VoiceToolResult,
  error: DeviceToolError,
  device: DeviceInfo | undefined,
): string {
  const action = describeAction(toolResult, device);
  // Preview and stop only play or silence sound, so the alarm permissions are not the likely cause.
  const needsAlarmPermission = toolResult.name !== 'previewAlarmSound' && toolResult.name !== 'stopAlarm';
  const isRingingAction = toolResult.name === 'stopAlarm' || toolResult.name === 'snoozeAlarm';

  switch (error) {
    case 'permission_required':
      if (!needsAlarmPermission) return `I couldn't ${action}. Please check MyLife's permissions in Settings, then try again.`;
      return permissionReply(device);
    case 'not_found':
      if (toolResult.name === 'updateAlarm' || toolResult.name === 'deleteAlarm') {
        return "I couldn't find that alarm anymore.";
      }
      if (isRingingAction) return ALARM_NOT_RINGING_REPLY;
      return `Sorry, I couldn't ${action}. Please try again.`;
    case 'busy':
      return `Your phone was busy, so I couldn't ${action}. Please try again.`;
    case 'unsupported_platform':
      if (toolResult.name === 'snoozeAlarm') {
        return device?.platform === 'ios'
          ? SNOOZE_UNSUPPORTED_IPHONE_REPLY
          : "I can't snooze alarms on this phone, but I can stop it.";
      }
      if (device?.platform === 'ios' && toolResult.name !== 'stopAlarm') return 'Alarms need iOS 26 or later on iPhone.';
      return `I can't ${action} on this phone.`;
    case 'invalid_args':
      return `Something went wrong with that request, so I couldn't ${action}. Please try again.`;
    case 'failed':
      return `Sorry, I couldn't ${action}. Please try again.`;
  }
}
