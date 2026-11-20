import { z } from 'zod';
import { isValidTimeZone } from '../lib/time.js';
import { defineTool, toolOk } from './types.js';

export const getCurrentTimeInput = z
  .object({
    timezone: z
      .string()
      .min(1)
      .max(64)
      .refine(isValidTimeZone, { message: 'Must be a valid IANA timezone, e.g. Asia/Manila' })
      .optional()
      .describe("IANA timezone. Omit to use the user's timezone."),
  })
  .strict();

export type GetCurrentTimeInput = z.infer<typeof getCurrentTimeInput>;

export interface CurrentTime {
  timezone: string;
  /** The instant in UTC (ISO 8601). */
  utc: string;
  /** Wall-clock time in `timezone`, `YYYY-MM-DDTHH:mm:ss` (no offset). */
  local: string;
  /** Offset from UTC, e.g. `+08:00`. */
  utcOffset: string;
  /** English weekday name in `timezone`, e.g. `Friday`. */
  weekday: string;
}

function formatUtcOffset(timeZone: string, now: Date): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(now)
    .find((p) => p.type === 'timeZoneName')?.value;
  // `longOffset` yields "GMT+08:00", or bare "GMT" for UTC itself.
  const offset = part?.replace('GMT', '') ?? '';
  return offset === '' ? '+00:00' : offset;
}

/** Plain, pure function: the testable core of the tool (rule 4). */
export function getCurrentTime(timeZone: string, now: Date): CurrentTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'long',
    hourCycle: 'h23',
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';

  return {
    timezone: timeZone,
    utc: now.toISOString(),
    local: `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`,
    utcOffset: formatUtcOffset(timeZone, now),
    weekday: get('weekday'),
  };
}

export const getCurrentTimeTool = defineTool({
  name: 'get_current_time',
  description: "Get the current date and time in the user's timezone (or a given IANA timezone).",
  riskLevel: 'read',
  target: 'server',
  input: getCurrentTimeInput,
  execute: (ctx, input) => Promise.resolve(toolOk(getCurrentTime(input.timezone ?? ctx.timezone, ctx.now))),
});
