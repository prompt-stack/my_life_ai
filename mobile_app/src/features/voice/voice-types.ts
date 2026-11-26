export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

/**
 * Health of the "Listen for 'AI'" feature, as shown in Settings.
 * `active` = the wake recognizer is running now; `paused` = enabled but waiting (speaking,
 * app in background, alarm ringing, ...).
 */
export type WakeStatus =
  | 'off'
  | 'active'
  | 'paused'
  | 'no_module'
  | 'simulator'
  | 'permission_denied'
  | 'needs_setup'
  | 'error';

export type EnableWakeWordResult =
  { ok: true } | { ok: false; reason: 'no_module' | 'simulator' | 'permission_denied' };

export const WAKE_STATUS_TEXT: Record<WakeStatus, string> = {
  off: 'Off',
  active: "Listening for 'AI' while MyLife is open",
  paused: 'On, paused while MyLife is busy',
  no_module: 'Needs the MyLife AI dev build (not Expo Go)',
  simulator: 'Not available on the Simulator',
  permission_denied:
    'Microphone or speech permission is off. Allow it in Settings, then turn this on again',
  needs_setup: 'Needs setup: download offline speech recognition for your language',
  error: "Couldn't keep listening. Turn this off and on to retry",
};

export const ENABLE_FAILURE_TEXT: Record<
  Extract<EnableWakeWordResult, { ok: false }>['reason'],
  string
> = {
  no_module: WAKE_STATUS_TEXT.no_module,
  simulator: WAKE_STATUS_TEXT.simulator,
  permission_denied:
    "MyLife needs microphone and speech access to hear 'AI'. You can allow it in your phone's Settings.",
};

/** Command listening: how long to wait for the user to START speaking (requested range 6-10 s). */
export const NO_SPEECH_TIMEOUT_MS = 8000;
/** Command listening: submit when no new text arrived for this long after the user spoke (requested 4-5 s). */
export const END_OF_SPEECH_SILENCE_MS = 4500;
/** Hard cap for one command listening session, whatever happens. */
export const MAX_LISTEN_MS = 60_000;
/** After "AI, <command>" in one breath, the whole wake-to-submit window never exceeds this. */
export const WAKE_COMMAND_MAX_MS = 15_000;
