import type { DeviceInfo, DeviceToolError, VoiceToolResult } from '@mylife/shared';
import { describe, expect, it } from 'vitest';
import { androidWithAlarms, ALARM_TOOL_NAMES } from '../test-utils/alarms.js';
import { deviceFailureReply } from './device-failure-replies.js';

const fail = { ok: false as const, error: 'failed' as const };
const create: VoiceToolResult = { callId: 'c', name: 'createAlarm', args: { hour: 18, minute: 0 }, result: fail };
const update: VoiceToolResult = { callId: 'c', name: 'updateAlarm', args: { alarmId: 'alarm-1', hour: 7, minute: 0 }, result: fail };
const updateUnknown: VoiceToolResult = { callId: 'c', name: 'updateAlarm', args: { alarmId: 'gone', enabled: false }, result: fail };
const remove: VoiceToolResult = { callId: 'c', name: 'deleteAlarm', args: { alarmId: 'alarm-2' }, result: fail };
const preview: VoiceToolResult = { callId: 'c', name: 'previewAlarmSound', args: { sound: 'marimba' }, result: fail };
const stop: VoiceToolResult = { callId: 'c', name: 'stopAlarm', args: { alarmId: 'alarm-1' }, result: fail };
const snooze: VoiceToolResult = { callId: 'c', name: 'snoozeAlarm', args: { alarmId: 'alarm-1', minutes: 9 }, result: fail };

const android = androidWithAlarms();
const iphone: DeviceInfo = { platform: 'ios', osVersion: '26.1', capabilities: [...ALARM_TOOL_NAMES], alarms: android.alarms };

function androidWith(permissions: NonNullable<DeviceInfo['alarmPermissions']>): DeviceInfo {
  return { ...android, alarmPermissions: permissions };
}

describe('deviceFailureReply', () => {
  it.each([
    [create, 'failed', android, "Sorry, I couldn't set the alarm for 6:00 PM. Please try again."],
    [update, 'failed', android, "Sorry, I couldn't change your 6:30 AM alarm. Please try again."],
    [updateUnknown, 'failed', android, "Sorry, I couldn't change that alarm. Please try again."],
    [remove, 'failed', android, "Sorry, I couldn't delete your 9:00 PM alarm. Please try again."],
    [preview, 'failed', android, "Sorry, I couldn't play the Marimba sound. Please try again."],
    [create, 'busy', android, "Your phone was busy, so I couldn't set the alarm for 6:00 PM. Please try again."],
    [remove, 'invalid_args', android, "Something went wrong with that request, so I couldn't delete your 9:00 PM alarm. Please try again."],
    [update, 'not_found', android, "I couldn't find that alarm anymore."],
    [remove, 'not_found', android, "I couldn't find that alarm anymore."],
    [create, 'not_found', android, "Sorry, I couldn't set the alarm for 6:00 PM. Please try again."],
    [create, 'unsupported_platform', android, "I can't set the alarm for 6:00 PM on this phone."],
    [create, 'unsupported_platform', iphone, 'Alarms need iOS 26 or later on iPhone.'],
    [stop, 'failed', android, "Sorry, I couldn't stop the alarm. Please try again."],
    [snooze, 'busy', android, "Your phone was busy, so I couldn't snooze the alarm. Please try again."],
    [stop, 'not_found', android, "That alarm isn't ringing anymore."],
    [snooze, 'not_found', iphone, "That alarm isn't ringing anymore."],
    [snooze, 'unsupported_platform', iphone, "I can't snooze alarms on iPhone yet, but I can stop it."],
    [snooze, 'unsupported_platform', android, "I can't snooze alarms on this phone, but I can stop it."],
    [stop, 'unsupported_platform', iphone, "I can't stop the alarm on this phone."],
    [stop, 'permission_required', android, "I couldn't stop the alarm. Please check MyLife's permissions in Settings, then try again."],
    [
      snooze,
      'permission_required',
      android,
      "I need permission to set alarms. Please allow 'Alarms & reminders' for MyLife, then try again.",
    ],
    [
      create,
      'permission_required',
      android,
      "I need permission to set alarms. Please allow 'Alarms & reminders' for MyLife, then try again.",
    ],
    [create, 'permission_required', iphone, 'I need permission to set alarms. Please allow alarms for MyLife in Settings.'],
    [
      update,
      'permission_required',
      androidWith({ exactAlarm: 'denied', fullScreen: 'denied', notifications: 'denied' }),
      "I need permission to set alarms. Please allow 'Alarms & reminders' for MyLife, then try again.",
    ],
    [
      create,
      'permission_required',
      androidWith({ exactAlarm: 'granted', fullScreen: 'granted', notifications: 'denied' }),
      'I need permission to show alarms. Please allow notifications for MyLife, then try again.',
    ],
    [
      create,
      'permission_required',
      androidWith({ exactAlarm: 'granted', fullScreen: 'denied', notifications: 'granted' }),
      'I need permission to show alarms. Please allow full-screen alerts for MyLife, then try again.',
    ],
    [
      preview,
      'permission_required',
      android,
      "I couldn't play the Marimba sound. Please check MyLife's permissions in Settings, then try again.",
    ],
  ] as const)('%#: %s / %s', (toolResult, error, device, expected) => {
    expect(deviceFailureReply(toolResult, error, device)).toBe(expected);
  });

  it('has a reply for every error code and tool', () => {
    const errors: DeviceToolError[] = ['unsupported_platform', 'invalid_args', 'failed', 'busy', 'permission_required', 'not_found'];
    for (const toolResult of [create, update, remove, preview]) {
      for (const error of errors) {
        expect(deviceFailureReply(toolResult, error, undefined).length).toBeGreaterThan(10);
      }
    }
  });

  it('never mentions the Clock app', () => {
    for (const toolResult of [create, update, remove, preview]) {
      expect(deviceFailureReply(toolResult, 'failed', android)).not.toMatch(/clock app/i);
    }
  });
});
