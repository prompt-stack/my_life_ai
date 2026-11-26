import { ALARM_SOUNDS, AlarmSoundIdSchema, normalizeAlarmSound, WeekdaySchema, type AlarmSoundId } from '@mylife/shared';
import { z } from 'zod';
import { listAlarmSoundNames } from './alarm-format.js';

/**
 * Pieces shared by the alarm tools' model-facing schemas. The model's JSON is
 * untrusted (rule 4): it is parsed with these Zod schemas, then resolved in code.
 */

/** Asked when the model passes a sound that is not one of the five bundled sounds. */
export const SOUND_QUESTION = `Which sound: ${listAlarmSoundNames('or')}?`;

export const ModelHourSchema = z.number().int().min(0).max(23);
export const ModelMinuteSchema = z.number().int().min(0).max(59);
export const ModelTimeSchema = z.object({ hour: ModelHourSchema, minute: ModelMinuteSchema }).strict();
export const ModelLabelSchema = z.string().trim().min(1).max(60);
/** Repeat days from the model; duplicates are removed in code. */
export const ModelWeekdaysSchema = z.array(WeekdaySchema).max(7);
/**
 * Any short string: the model may say "Piano" or "the piano one". It is
 * normalized in code with `normalizeAlarmSound`, and anything else gets a question.
 */
export const ModelSoundSchema = z.string().trim().min(1).max(40);

export type SoundResolution = { kind: 'none' } | { kind: 'sound'; sound: AlarmSoundId } | { kind: 'unknown' };

export function resolveModelSound(raw: string | undefined): SoundResolution {
  if (raw === undefined) return { kind: 'none' };
  const sound = normalizeAlarmSound(raw);
  return sound ? { kind: 'sound', sound } : { kind: 'unknown' };
}

/**
 * Sound aliases for the model, shortest form: "default/normal=sunrise, ...".
 * Sent once, in the alarm rules (voice-prompts.ts), not in each tool's sound
 * parameter. Aliases that contain the sound's own name ("chime", "the piano
 * one") are left out: the model maps those without help.
 */
export const SOUND_ALIAS_HINT = ALARM_SOUNDS.map((sound) => {
  const distinct = sound.aliases.filter((alias) => !alias.includes(sound.id) && !sound.id.includes(alias));
  return distinct.length > 0 ? `${distinct.join('/')}=${sound.id}` : undefined;
})
  .filter((entry) => entry !== undefined)
  .join(', ');

/**
 * JSON Schema parameters the model sees. Tests keep them in sync with the Zod
 * schemas. Descriptions are minimal on purpose: the alarm rules already explain
 * 24-hour times, weekdays, labels and sounds, and every word is sent on every
 * alarm request (Groq free tier: ~8K input tokens per minute).
 */
export const hourParameter = (description?: string) => ({
  type: 'integer',
  minimum: 0,
  maximum: 23,
  ...(description ? { description } : {}),
});
export const minuteParameter = () => ({ type: 'integer', minimum: 0, maximum: 59 });

export const timeParameter = () => ({
  type: 'object',
  properties: { hour: hourParameter(), minute: minuteParameter() },
  required: ['hour', 'minute'],
  additionalProperties: false,
});

export const labelParameter = { type: 'string', minLength: 1, maxLength: 60 };

export const soundParameter = (onlyIfNamed: boolean) => ({
  type: 'string',
  enum: AlarmSoundIdSchema.options,
  ...(onlyIfNamed ? { description: 'Only if the user names a sound.' } : {}),
});

export const weekdaysParameter = {
  type: 'array',
  maxItems: 7,
  items: { type: 'integer', minimum: 1, maximum: 7 },
};
