import { ALARM_SOUNDS, type VoiceTurn } from '@mylife/shared';

/**
 * Cheap pre-filter: does this voice request plausibly involve alarms? When it
 * does not, the alarm tools, rules and alarm list are left out of the model
 * call, which roughly halves the input tokens (Groq free tier: ~8K tokens/min).
 *
 * False negatives are worse than false positives (a missed alarm request can't
 * act; an extra match only costs tokens), so the patterns are generous and the
 * recent turns count too: "Yes", "6 AM" or "the piano one" answering an alarm
 * question still matches through the history.
 *
 * Reminders are not alarms on purpose: "remind me" alone does not match.
 *
 * While an alarm rings everything counts: "stop", "enough", "turn it off" or
 * "five more minutes" then mean the ringing alarm. Otherwise "stop" alone is
 * too generic ("stop the music"), so it only matches next to alarm words;
 * "snooze" always matches.
 */

/** Recent turns that keep a follow-up in the alarm context (two exchanges). */
export const ALARM_CONTEXT_TURNS = 4;

/** Sound aliases too common in everyday speech to signal alarms by themselves. */
const GENERIC_SOUND_WORDS: ReadonlySet<string> = new Set(['default', 'normal', 'regular', 'standard', 'keys', 'keyboard', 'strings', 'acoustic']);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SOUND_WORDS = ALARM_SOUNDS.flatMap((sound) => [sound.id, sound.name.toLowerCase(), ...sound.aliases])
  .filter((word) => !GENERIC_SOUND_WORDS.has(word))
  .map(escapeRegExp);

const ALARM_PATTERNS: readonly RegExp[] = [
  // Alarm vocabulary (English and common Tagalog: alarma, gising/gisingin).
  /\b(alarms?|alarma|wake|wakes|waking|woke|gising\w*|snooze|ring|rings|ringing|ringtone|sounds?|tones?)\b/i,
  // Bundled sound names and their distinctive aliases.
  new RegExp(`\\b(${SOUND_WORDS.join('|')})\\b`, 'i'),
  // Clock times: 6 AM, 6:30pm, 7 p.m., 18:00, at 7, for 6, o'clock, noon, midnight.
  /\b\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)(?=\W|$)/i,
  /\b\d{1,2}:\d{2}\b/,
  /\b(at|for|to) \d{1,2}\b/i,
  /\b(o'?clock|noon|midnight)\b/i,
  // Relative times: in 20 minutes, in an hour, in half an hour.
  /\bin (\d+|an?|one|half an) (minutes?|mins?|hours?|hrs?)\b/i,
  // Repeat days.
  /\b(weekdays?|weekends?|every day|daily)\b/i,
];

function mentionsAlarms(text: string): boolean {
  return ALARM_PATTERNS.some((pattern) => pattern.test(text));
}

export interface AlarmIntentOptions {
  /** The phone reports an alarm ringing right now (`DeviceInfo.ringingAlarmId`). */
  alarmRinging?: boolean;
}

/** True when an alarm is ringing, or the request or the last couple of exchanges look alarm-related. */
export function isAlarmRequest(text: string, history: readonly VoiceTurn[], options: AlarmIntentOptions = {}): boolean {
  if (options.alarmRinging) return true;
  if (mentionsAlarms(text)) return true;
  return history.slice(-ALARM_CONTEXT_TURNS).some((turn) => mentionsAlarms(turn.text));
}
