import {
  VOICE_HISTORY_MAX_TURNS,
  isValidTimeZone,
  type VoiceInvocation,
  type VoiceTurn,
} from '@mylife/shared';
import * as Device from 'expo-device';
import * as Speech from 'expo-speech';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { recordWakeEvent, recordWakeResult } from '@/features/voice/wake-debug-log';
import {
  END_OF_SPEECH_SILENCE_MS,
  MAX_LISTEN_MS,
  NO_SPEECH_TIMEOUT_MS,
  WAKE_COMMAND_MAX_MS,
  type EnableWakeWordResult,
  type VoiceState,
  type WakeStatus,
} from '@/features/voice/voice-types';
import { wakeWordPreference } from '@/features/voice/wake-word-preference';
import {
  addListener as addAlarmListener,
  getRingingAlarmId,
  pauseRinging,
  resumeRinging,
  setRingVolume,
} from '@/lib/native-alarms';
import { SpeechRecognitionModule, useSpeechRecognitionEvent } from '@/lib/speech-recognition';
import { VoiceApiError } from '@/lib/voice-api';
import { runVoiceTurn } from '@/lib/voice-turn';
import { detectTriggerInAlternatives } from '@/lib/wake-word';

const STATUS: Record<Exclude<VoiceState, 'error'>, string> = {
  idle: 'Tap to speak',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking… tap to stop',
};

const ERROR_TEXT: Record<VoiceApiError['kind'], string> = {
  ai_not_configured: "AI isn't set up on the server yet",
  rate_limited: 'Too many requests, try again shortly',
  timeout: 'The AI took too long, try again',
  server: 'Something went wrong on the server, try again',
  network: "Can't reach the server",
  bad_response: 'Got an unexpected answer, try again',
};

/** While a voice turn is active, re-assert the alarm pause this often (native auto-resumes after 20 s). */
const ALARM_PAUSE_KEEPALIVE_MS = 10_000;
/** Lets the alarm audio fall silent before the recognizer opens the microphone. */
const ALARM_PAUSE_SETTLE_MS = 200;
/** A bare "AI" (no command yet): wait this long for more words before opening command listening. */
const TRIGGER_SETTLE_MS = 1000;
/** Wake session ended normally (silence): start the next one almost at once so "AI" is rarely missed. */
const WAKE_RESTART_MS = 150;
/** A wake session shorter than this counts as a failure (guards against a tight restart loop). */
const WAKE_MIN_SESSION_MS = 1000;
/** Alternatives requested from the recognizer in wake mode; every one is checked for "AI". */
const WAKE_MAX_ALTERNATIVES = 3;
/** Android recognizer hint: how long it waits in silence before ending a session (may be ignored). */
const WAKE_SILENCE_HINT_MS = 10_000;
/** Words that bias the recognizer towards our trigger. */
const WAKE_CONTEXTUAL_STRINGS = ['AI', 'A.I.', 'hey AI', 'okay AI', 'MyLife AI'];
/** Command listening: pause before transparently restarting a recognizer that ended by itself. */
const COMMAND_RESTART_DELAY_MS = 150;
/** Consecutive transparent restarts without any speech heard before giving up. */
const COMMAND_MAX_RESTARTS = 12;
/** After asking the recognizer to stop, submit what was heard if it never reports `end`. */
const STOP_FALLBACK_MS = 1500;
/** While an alarm rings and we listen for "AI", the alarm plays at this fraction of its volume. */
const RING_DUCK_FRACTION = 0.25;
/** Native ducking lapses after 30 s unless re-asserted; do it this often. */
const RING_DUCK_KEEPALIVE_MS = 10_000;
/** Wake recognizer restart backoff (real errors only). */
const WAKE_RETRY_MIN_MS = 500;
const WAKE_RETRY_MAX_MS = 5000;
/** A wake session that ran this long counts as healthy and resets the backoff. */
const WAKE_HEALTHY_MS = 10_000;
/** Give up on the wake listener after this many failed sessions in a row. */
const WAKE_MAX_FAILURES = 5;
/** How long to wait for the old recognizer session to report `end` before starting a new one. */
const RECOGNIZER_IDLE_TIMEOUT_MS = 1500;
/** An error state returns to idle after this long (never lingers; lets wake listening resume). */
const ERROR_RESET_MS = 4000;

const IS_IOS = Platform.OS === 'ios';
const IS_SIMULATOR = Platform.OS === 'ios' && !Device.isDevice;

function deviceTimezone(): string | undefined {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone && isValidTimeZone(zone) ? zone : undefined;
}

function joinText(...parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

function deviceLocale(): string {
  return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
}

/** Which flow owns the native recognizer session (there is only one recognizer). */
type Owner = 'wake' | 'command' | null;

type VoiceContextValue = {
  state: VoiceState;
  statusText: string;
  permissionRequired: boolean;
  onOrbPress: () => void;
  /** Starts listening if idle (used by the "Speak" deep link from the ringing screen). */
  startVoice: () => void;
  /** Stops listening, thinking and speaking and returns to idle. */
  cancel: () => void;
};

type WakeWordContextValue = {
  enabled: boolean;
  status: WakeStatus;
  promptDismissed: boolean;
  setupDismissed: boolean;
  setEnabled: (on: boolean) => Promise<EnableWakeWordResult>;
  dismissPrompt: () => void;
  dismissSetup: () => void;
  /** Opens the system flow to download offline speech recognition, then retries on return. */
  openSetup: () => Promise<void>;
};

const VoiceContext = createContext<VoiceContextValue | null>(null);
const WakeWordContext = createContext<WakeWordContextValue | null>(null);

/**
 * App-wide voice: one conversation (history, state, turn runner), one speech recognizer used in
 * two modes (command listening, and the opt-in background-free "AI" wake listening).
 * Neither transcripts nor replies are exposed or logged, only a short status line.
 */
export function VoiceProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<VoiceState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [permissionRequired, setPermissionRequired] = useState(false);

  const [wakeEnabled, setWakeEnabledState] = useState(() => wakeWordPreference.readEnabled());
  const [wakeFatal, setWakeFatal] = useState<WakeStatus | null>(null);
  const [wakeListening, setWakeListening] = useState(false);
  const [promptDismissed, setPromptDismissed] = useState(() =>
    wakeWordPreference.readPromptDismissed(),
  );
  const [setupDismissed, setSetupDismissed] = useState(() =>
    wakeWordPreference.readSetupDismissed(),
  );
  const [appActive, setAppActive] = useState(() => AppState.currentState === 'active');
  const [alarmRinging, setAlarmRinging] = useState(false);

  // Conversation.
  const stateRef = useRef<VoiceState>('idle');
  // Command listening: finished segments + the segment still being recognized (interim).
  const committedRef = useRef('');
  const currentRef = useRef('');
  const commandStoppingRef = useRef(false);
  const commandStartedAtRef = useRef(0);
  const commandRestartsRef = useRef(0);
  const noSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const duckedRef = useRef(false);
  const historyRef = useRef<VoiceTurn[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const permissionBlockedRef = useRef(false);
  const invocationRef = useRef<VoiceInvocation>('tap');
  const alarmPausedRef = useRef(false);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Recognizer ownership and wake listening.
  const ownerRef = useRef<Owner>(null);
  const idleWaitersRef = useRef<(() => void)[]>([]);
  const wakeModeRef = useRef(false);
  const wakeStartingRef = useRef(false);
  const wakeStartedAtRef = useRef(0);
  const wakeFailuresRef = useRef(0);
  const wakeRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Wake trigger heard: command text so far (finished segments + the open one).
  const wakeTriggeredRef = useRef(false);
  const wakeTriggerOpenRef = useRef(false);
  const wakeTriggerAtRef = useRef(0);
  const wakeCommittedCmdRef = useRef('');
  const wakeSegmentCmdRef = useRef('');
  const wakeSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeEnabledRef = useRef(wakeEnabled);
  const wakeFatalRef = useRef<WakeStatus | null>(null);
  const appActiveRef = useRef(appActive);
  const alarmRingingRef = useRef(false);

  // ---- Alarm pause (so the alarm sound doesn't drown the voice turn) ----

  /** If an alarm is ringing, silences it (not dismissed) so speech can be heard. Never throws. */
  const pauseAlarmForVoice = async () => {
    try {
      if (!(await getRingingAlarmId())) return;
      alarmPausedRef.current = true;
      await pauseRinging();
      keepAliveRef.current ??= setInterval(() => {
        pauseRinging().catch(() => {});
      }, ALARM_PAUSE_KEEPALIVE_MS);
      await new Promise((resolve) => setTimeout(resolve, ALARM_PAUSE_SETTLE_MS));
    } catch {
      // Old dev build without the pause API: listen anyway.
    }
  };

  /** Turn over (any outcome): un-pause the alarm if it still rings (it was not stopped or snoozed). */
  const resumeAlarmAfterVoice = useCallback(() => {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
    if (!alarmPausedRef.current) return;
    alarmPausedRef.current = false;
    getRingingAlarmId()
      .then((id) => (id ? resumeRinging() : undefined))
      .catch(() => {});
  }, []);

  const clearCommandTimers = useCallback(() => {
    for (const timer of [noSpeechTimerRef, silenceTimerRef, maxTimerRef, stopFallbackRef]) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const update = useCallback(
    (next: VoiceState, text: string | null = null) => {
      stateRef.current = next;
      if (next !== 'listening') clearCommandTimers();
      if (next === 'idle' || next === 'error') resumeAlarmAfterVoice();
      setState(next);
      setMessage(text);
    },
    [clearCommandTimers, resumeAlarmAfterVoice],
  );

  // ---- Single recognizer: ownership helpers ----

  /** Resolves when the previous recognizer session has ended (or after a timeout). */
  const whenRecognizerIdle = () =>
    new Promise<void>((resolve) => {
      if (ownerRef.current === null) {
        resolve();
        return;
      }
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        ownerRef.current = null;
        done();
      }, RECOGNIZER_IDLE_TIMEOUT_MS);
      idleWaitersRef.current.push(done);
    });

  const releaseRecognizer = () => {
    ownerRef.current = null;
    const waiters = idleWaitersRef.current;
    idleWaitersRef.current = [];
    waiters.forEach((resolve) => resolve());
  };

  // ---- Conversation turn ----

  const speak = (text: string) => {
    update('speaking');
    const finish = () => {
      if (stateRef.current === 'speaking') update('idle');
    };
    Speech.speak(text, { onDone: finish, onStopped: finish, onError: finish });
  };

  const submit = async (text: string, invocation: VoiceInvocation) => {
    const spoken = text.trim();
    if (!spoken) {
      update('idle', "Didn't catch that");
      return;
    }
    update('thinking');
    setPermissionRequired(false);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const turn = await runVoiceTurn({
        text: spoken,
        history: historyRef.current,
        timezone: deviceTimezone(),
        signal: controller.signal,
        invocation,
        onExecuting: () => setMessage('Updating your alarms…'),
      });
      if (turn === null || controller.signal.aborted) return;
      const reply = turn.reply;
      setPermissionRequired(turn.permissionRequired);
      historyRef.current = [
        ...historyRef.current,
        { role: 'user' as const, text: spoken },
        { role: 'assistant' as const, text: reply },
      ]
        .filter((entry) => entry.text.length > 0)
        .slice(-VOICE_HISTORY_MAX_TURNS);
      if (reply.trim()) speak(reply);
      else update('idle');
    } catch (error) {
      if (controller.signal.aborted) return;
      const kind = error instanceof VoiceApiError ? error.kind : 'network';
      update('error', ERROR_TEXT[kind]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  // ---- Wake listening ----

  const wakeDesired = () =>
    SpeechRecognitionModule !== null &&
    !IS_SIMULATOR &&
    wakeEnabledRef.current &&
    wakeFatalRef.current === null &&
    appActiveRef.current &&
    stateRef.current === 'idle' &&
    // iOS: AlarmKit owns the ringing and its audio session, so no wake listening while it rings.
    // Android: wake listening runs while the alarm rings (ducked, see the ducking effect).
    !(IS_IOS && alarmRingingRef.current) &&
    wakeRetryTimerRef.current === null;

  const resetWakeTrigger = () => {
    if (wakeSettleTimerRef.current) clearTimeout(wakeSettleTimerRef.current);
    wakeSettleTimerRef.current = null;
    wakeTriggeredRef.current = false;
    wakeTriggerOpenRef.current = false;
    wakeCommittedCmdRef.current = '';
    wakeSegmentCmdRef.current = '';
  };

  const markWakeFatal = (status: WakeStatus) => {
    wakeFatalRef.current = status;
    setWakeFatal(status);
    setWakeListening(false);
  };

  /** Stops the wake session on purpose (state changes, background, toggle off). Idempotent. */
  const stopWake = () => {
    resetWakeTrigger();
    setWakeListening(false);
    if (!wakeModeRef.current) return;
    wakeModeRef.current = false;
    SpeechRecognitionModule?.abort();
  };

  /** Wake session ended on its own or with an error: restart with backoff, or give up. */
  const scheduleWakeRetry = (counts: boolean, minDelay = 0) => {
    resetWakeTrigger();
    setWakeListening(false);
    const lasted = Date.now() - wakeStartedAtRef.current;
    if (lasted > WAKE_HEALTHY_MS) wakeFailuresRef.current = 0;
    // A session that dies instantly is a failure even when the recognizer calls it "no speech".
    if (counts || lasted < WAKE_MIN_SESSION_MS) wakeFailuresRef.current += 1;
    if (wakeFailuresRef.current >= WAKE_MAX_FAILURES) {
      markWakeFatal('error');
      return;
    }
    const backoff = Math.min(
      Math.max(minDelay, WAKE_RETRY_MIN_MS * 2 ** wakeFailuresRef.current),
      WAKE_RETRY_MAX_MS,
    );
    // Normal end (silence timeout): restart at once, dead time is where "AI" gets missed.
    const failing = counts || lasted < WAKE_MIN_SESSION_MS;
    const delay = failing ? backoff : Math.max(WAKE_RESTART_MS, minDelay);
    if (wakeRetryTimerRef.current) clearTimeout(wakeRetryTimerRef.current);
    wakeRetryTimerRef.current = setTimeout(() => {
      wakeRetryTimerRef.current = null;
      syncWake();
    }, delay);
  };

  const startWake = async () => {
    const recognizer = SpeechRecognitionModule;
    if (!recognizer || wakeStartingRef.current || wakeModeRef.current) return;
    wakeStartingRef.current = true;
    try {
      // Never prompt here: permission was requested when the user turned the feature on.
      const permission = await recognizer.getPermissionsAsync();
      if (!permission.granted) {
        wakeEnabledRef.current = false;
        setWakeEnabledState(false);
        wakeWordPreference.writeEnabled(false);
        markWakeFatal('permission_denied');
        return;
      }
      // Always-listening must stay on the device: never fall back to network recognition.
      if (!recognizer.isRecognitionAvailable() || !recognizer.supportsOnDeviceRecognition()) {
        markWakeFatal('needs_setup');
        return;
      }
      await whenRecognizerIdle();
      if (!wakeDesired()) return;
      wakeModeRef.current = true;
      ownerRef.current = 'wake';
      wakeStartedAtRef.current = Date.now();
      resetWakeTrigger();
      recordWakeEvent('session start');
      recognizer.start({
        lang: deviceLocale(),
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: true,
        contextualStrings: WAKE_CONTEXTUAL_STRINGS,
        maxAlternatives: WAKE_MAX_ALTERNATIVES,
        androidIntentOptions: {
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: WAKE_SILENCE_HINT_MS,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: WAKE_SILENCE_HINT_MS,
        },
      });
      setWakeListening(true);
    } catch {
      wakeModeRef.current = false;
      if (ownerRef.current === 'wake') releaseRecognizer();
      scheduleWakeRetry(true);
    } finally {
      wakeStartingRef.current = false;
      // Conditions may have changed while awaiting (state, app focus, toggle).
      syncWake();
    }
  };

  /** Brings the wake session in line with the current conditions. Safe to call any time. */
  function syncWake() {
    if (wakeDesired()) {
      if (!wakeModeRef.current && !wakeStartingRef.current) void startWake();
    } else if (wakeModeRef.current) {
      stopWake();
    }
  }

  /** The trigger (and any command spoken with it) is settled: hand over to a normal voice turn. */
  const fireTrigger = async () => {
    const command = joinText(wakeCommittedCmdRef.current, wakeSegmentCmdRef.current);
    stopWake();
    if (!command) {
      // Claim the state now so the wake session cannot restart while command listening starts.
      update('listening');
      void startListening('wake_word');
      return;
    }
    update('thinking');
    // An alarm may be ringing ("AI, stop"): silence it for the turn like command listening does.
    await pauseAlarmForVoice();
    if (stateRef.current !== 'thinking') return; // cancelled meanwhile
    void submit(command, 'wake_word');
  };

  /**
   * Every result event (interim and final, every alternative) is checked. After the trigger, the text
   * that follows is the command: it keeps accumulating across recognizer segments, and the turn starts
   * once no new text arrived for END_OF_SPEECH_SILENCE_MS (or TRIGGER_SETTLE_MS for a bare "AI"),
   * never later than WAKE_COMMAND_MAX_MS after the trigger.
   */
  const handleWakeResult = (alternatives: string[], isFinal: boolean) => {
    if (!wakeModeRef.current) return;
    if (!wakeTriggeredRef.current || wakeTriggerOpenRef.current) {
      const hit = detectTriggerInAlternatives(alternatives);
      recordWakeResult(alternatives, isFinal, hit.triggered);
      if (!hit.triggered) {
        // The transcript was revised and no longer contains "AI" (e.g. "AI" became "AIR").
        if (wakeTriggeredRef.current) resetWakeTrigger();
        return;
      }
      if (!wakeTriggeredRef.current) {
        wakeTriggeredRef.current = true;
        wakeTriggerOpenRef.current = true;
        wakeTriggerAtRef.current = Date.now();
      }
      wakeSegmentCmdRef.current = hit.command;
    } else {
      // A later segment of the same breath: all of it is command.
      recordWakeResult(alternatives, isFinal, true);
      wakeSegmentCmdRef.current = alternatives[0] ?? '';
    }
    if (isFinal) {
      wakeCommittedCmdRef.current = joinText(
        wakeCommittedCmdRef.current,
        wakeSegmentCmdRef.current,
      );
      wakeSegmentCmdRef.current = '';
      wakeTriggerOpenRef.current = false;
    }
    const command = joinText(wakeCommittedCmdRef.current, wakeSegmentCmdRef.current);
    if (isFinal && !command) {
      void fireTrigger();
      return;
    }
    if (wakeSettleTimerRef.current) clearTimeout(wakeSettleTimerRef.current);
    const remaining = Math.max(0, WAKE_COMMAND_MAX_MS - (Date.now() - wakeTriggerAtRef.current));
    const wait = Math.min(command ? END_OF_SPEECH_SILENCE_MS : TRIGGER_SETTLE_MS, remaining);
    wakeSettleTimerRef.current = setTimeout(() => void fireTrigger(), wait);
  };

  const handleWakeEnd = () => {
    recordWakeEvent('session end');
    if (wakeModeRef.current) {
      // Ended by itself (silence timeout): not a failure, just start again.
      wakeModeRef.current = false;
      scheduleWakeRetry(false);
    }
  };

  const handleWakeError = (error: string) => {
    if (error === 'aborted' || !wakeModeRef.current) return;
    recordWakeEvent(`error ${error}`);
    wakeModeRef.current = false;
    switch (error) {
      case 'no-speech':
      case 'speech-timeout':
        scheduleWakeRetry(false);
        break;
      case 'not-allowed':
        wakeEnabledRef.current = false;
        setWakeEnabledState(false);
        wakeWordPreference.writeEnabled(false);
        markWakeFatal('permission_denied');
        break;
      case 'service-not-allowed':
      case 'language-not-supported':
        markWakeFatal('needs_setup');
        break;
      case 'too-many-requests':
        scheduleWakeRetry(true, WAKE_RETRY_MAX_MS);
        break;
      default:
        scheduleWakeRetry(true);
    }
  };

  // ---- Command listening ----
  //
  // Continuous recognition plus our own timers (the recognizer's defaults cut the user off too soon):
  //  - NO_SPEECH_TIMEOUT_MS from the start: nothing heard -> "Didn't catch that".
  //  - END_OF_SPEECH_SILENCE_MS after the last text (interim or final) -> submit what was heard.
  //  - MAX_LISTEN_MS: absolute cap.
  // If the recognizer ends by itself early (Android may, even in continuous mode) it is restarted
  // within the window and the text already heard is kept.

  const heardText = () => joinText(committedRef.current, currentRef.current);

  /** Stops listening and submits what was heard (silence timer, tap, cap). */
  const endCommandListening = () => {
    if (stateRef.current !== 'listening') return;
    if (ownerRef.current !== 'command') {
      // The recognizer is not running (still settling, or between restarts): nothing to wait for.
      void submit(heardText(), invocationRef.current);
      return;
    }
    commandStoppingRef.current = true;
    for (const timer of [noSpeechTimerRef, silenceTimerRef]) {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    }
    // `stop()` delivers a final result and then `end`, which submits. The fallback covers a missing `end`.
    SpeechRecognitionModule?.stop();
    stopFallbackRef.current = setTimeout(() => {
      stopFallbackRef.current = null;
      if (stateRef.current !== 'listening') return;
      SpeechRecognitionModule?.abort();
      void submit(heardText(), invocationRef.current);
    }, STOP_FALLBACK_MS);
  };

  const onNoSpeechTimeout = () => {
    noSpeechTimerRef.current = null;
    if (stateRef.current !== 'listening' || heardText()) return;
    SpeechRecognitionModule?.abort();
    update('idle', "Didn't catch that");
  };

  const startCommandRecognizer = (recognizer: NonNullable<typeof SpeechRecognitionModule>) => {
    ownerRef.current = 'command';
    recognizer.start({
      lang: deviceLocale(),
      interimResults: true,
      continuous: true,
      maxAlternatives: 1,
      androidIntentOptions: {
        EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: END_OF_SPEECH_SILENCE_MS,
        EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: END_OF_SPEECH_SILENCE_MS,
      },
    });
  };

  /** The recognizer ended by itself while we are still inside the listening window. */
  const restartCommandRecognizer = () => {
    commandRestartsRef.current += 1;
    const expired = Date.now() - commandStartedAtRef.current >= MAX_LISTEN_MS;
    if (commandRestartsRef.current > COMMAND_MAX_RESTARTS || expired) {
      void submit(heardText(), invocationRef.current);
      return;
    }
    setTimeout(() => {
      const recognizer = SpeechRecognitionModule;
      if (!recognizer || stateRef.current !== 'listening' || ownerRef.current !== null) return;
      if (commandStoppingRef.current) return;
      try {
        startCommandRecognizer(recognizer);
      } catch {
        ownerRef.current = null;
        void submit(heardText(), invocationRef.current);
      }
    }, COMMAND_RESTART_DELAY_MS);
  };

  const handleCommandResult = (text: string, isFinal: boolean) => {
    if (isFinal) {
      // A finished segment replaces the interim one (and is kept across recognizer restarts).
      committedRef.current = joinText(committedRef.current, text);
      currentRef.current = '';
    } else {
      currentRef.current = text;
    }
    if (!heardText()) return;
    commandRestartsRef.current = 0;
    if (noSpeechTimerRef.current) clearTimeout(noSpeechTimerRef.current);
    noSpeechTimerRef.current = null;
    if (commandStoppingRef.current) return;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(endCommandListening, END_OF_SPEECH_SILENCE_MS);
  };

  useSpeechRecognitionEvent('result', (event) => {
    if (ownerRef.current === 'wake') {
      handleWakeResult(
        event.results.map((result) => result.transcript),
        event.isFinal,
      );
      return;
    }
    if (ownerRef.current !== 'command' || stateRef.current !== 'listening') return;
    handleCommandResult(event.results[0]?.transcript ?? '', event.isFinal);
  });

  useSpeechRecognitionEvent('end', () => {
    const owner = ownerRef.current;
    releaseRecognizer();
    if (owner === 'wake') {
      handleWakeEnd();
      syncWake();
      return;
    }
    if (owner !== 'command' || stateRef.current !== 'listening') return;
    if (commandStoppingRef.current) {
      // Stopped on purpose (tap or silence): use everything that was heard.
      void submit(heardText(), invocationRef.current);
      return;
    }
    // Ended by itself: keep what was heard and continue transparently.
    committedRef.current = heardText();
    currentRef.current = '';
    restartCommandRecognizer();
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (ownerRef.current === 'wake') {
      handleWakeError(event.error);
      return;
    }
    if (ownerRef.current !== 'command' || stateRef.current !== 'listening') return;
    if (event.error === 'aborted') return;
    switch (event.error) {
      case 'no-speech':
      case 'speech-timeout':
        // Not an error for us: `end` follows and restarts within the window (our timer owns "no speech").
        break;
      case 'not-allowed':
        permissionBlockedRef.current = true;
        update('error', 'Microphone permission needed');
        break;
      case 'audio-capture':
        update('error', 'Voice needs a working microphone');
        break;
      case 'service-not-allowed':
        update('error', "Speech recognition isn't available on this phone");
        break;
      case 'language-not-supported':
        update('error', "Speech recognition doesn't support your language yet");
        break;
      case 'network':
        update('error', 'Speech recognition needs an internet connection');
        break;
      default:
        update('error', "Couldn't hear you, try again");
    }
  });

  async function startListening(invocation: VoiceInvocation) {
    const recognizer = SpeechRecognitionModule;
    if (!recognizer) {
      update('error', 'Voice needs the MyLife AI dev build (not Expo Go)');
      return;
    }
    // Starting the iOS audio engine with no usable input aborts the whole process (uncatchable
    // from JS), so never start recognition on the Simulator.
    if (IS_SIMULATOR) {
      update('error', "Voice input isn't available on the Simulator");
      return;
    }
    if (permissionBlockedRef.current) {
      permissionBlockedRef.current = false;
      update('idle', 'Tap to speak');
      await Linking.openSettings();
      return;
    }
    try {
      // Just-in-time: ask for the microphone and speech access only when the user wants to speak.
      const permission = await recognizer.requestPermissionsAsync();
      if (!permission.granted) {
        permissionBlockedRef.current = true;
        update('error', 'Microphone permission needed. Tap to open settings');
        return;
      }
      if (!recognizer.isRecognitionAvailable()) {
        update('error', "Speech recognition isn't available on this phone");
        return;
      }
      invocationRef.current = invocation;
      committedRef.current = '';
      currentRef.current = '';
      commandStoppingRef.current = false;
      commandRestartsRef.current = 0;
      update('listening');
      // One recognizer: the wake session (if any) must be over before command listening starts.
      stopWake();
      await pauseAlarmForVoice();
      await whenRecognizerIdle();
      // The user may have tapped the orb or cancelled while the alarm / old session was settling.
      if (stateRef.current !== 'listening') return;
      clearCommandTimers();
      commandStartedAtRef.current = Date.now();
      noSpeechTimerRef.current = setTimeout(onNoSpeechTimeout, NO_SPEECH_TIMEOUT_MS);
      maxTimerRef.current = setTimeout(endCommandListening, MAX_LISTEN_MS);
      startCommandRecognizer(recognizer);
    } catch {
      releaseRecognizer();
      update('error', "Couldn't start listening, try again");
    }
  }

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    Speech.stop();
    if (stateRef.current === 'listening') SpeechRecognitionModule?.abort();
    update('idle');
  }, [update]);

  const onOrbPress = () => {
    switch (stateRef.current) {
      case 'listening':
        endCommandListening();
        break;
      case 'thinking':
        abortRef.current?.abort();
        abortRef.current = null;
        update('idle');
        break;
      case 'speaking':
        Speech.stop();
        update('idle');
        break;
      default:
        void startListening('tap');
    }
  };

  const startVoice = () => {
    if (stateRef.current === 'idle' || stateRef.current === 'error') {
      void startListening('speak_button');
    }
  };

  // ---- Wake word settings ----

  const setEnabled = async (on: boolean): Promise<EnableWakeWordResult> => {
    if (!on) {
      wakeWordPreference.writeEnabled(false);
      wakeEnabledRef.current = false;
      setWakeEnabledState(false);
      wakeFatalRef.current = null;
      setWakeFatal(null);
      return { ok: true };
    }
    const recognizer = SpeechRecognitionModule;
    if (!recognizer) return { ok: false, reason: 'no_module' };
    if (IS_SIMULATOR) return { ok: false, reason: 'simulator' };
    // Just-in-time permission request, with the reason shown by the system prompt (app.json strings).
    const permission = await recognizer.requestPermissionsAsync();
    if (!permission.granted) return { ok: false, reason: 'permission_denied' };
    wakeWordPreference.writeEnabled(true);
    wakeFailuresRef.current = 0;
    wakeFatalRef.current = null;
    setWakeFatal(null);
    wakeEnabledRef.current = true;
    setWakeEnabledState(true);
    return { ok: true };
  };

  const dismissPrompt = () => {
    wakeWordPreference.writePromptDismissed(true);
    setPromptDismissed(true);
  };

  const dismissSetup = () => {
    wakeWordPreference.writeSetupDismissed(true);
    setSetupDismissed(true);
  };

  const retryWake = () => {
    if (wakeFatalRef.current === 'needs_setup' || wakeFatalRef.current === 'error') {
      wakeFatalRef.current = null;
      setWakeFatal(null);
    }
    wakeFailuresRef.current = 0;
  };

  const openSetup = async () => {
    const recognizer = SpeechRecognitionModule;
    if (Platform.OS === 'android') {
      try {
        // Android 13+: opens the download dialog or schedules the offline model download.
        await recognizer?.androidTriggerOfflineModelDownload({
          locale: deviceLocale(),
        });
        retryWake();
        return;
      } catch {
        // Older Android or no model service: fall through to the system settings.
      }
      try {
        await Linking.sendIntent('android.settings.VOICE_INPUT_SETTINGS');
        return;
      } catch {
        // Fall through.
      }
    }
    await Linking.openSettings();
  };

  // ---- Effects: keep refs in sync and drive the wake session ----

  useEffect(() => {
    wakeEnabledRef.current = wakeEnabled;
    appActiveRef.current = appActive;
    alarmRingingRef.current = alarmRinging;
    syncWake();
    // syncWake reads refs only; these are the inputs that can change the answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeEnabled, wakeFatal, appActive, alarmRinging, state]);

  // App foreground/background. Backgrounding stops everything that uses the microphone.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const active = next === 'active';
      appActiveRef.current = active;
      setAppActive(active);
      if (next === 'background') {
        stopWake();
        if (stateRef.current !== 'idle') cancel();
      }
      if (active) {
        // A fresh foreground is a fresh attempt (e.g. after downloading the offline model).
        retryWake();
        refreshAlarmRinging();
      }
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancel]);

  function refreshAlarmRinging() {
    getRingingAlarmId()
      .then((id) => {
        alarmRingingRef.current = id !== null;
        setAlarmRinging(id !== null);
      })
      .catch(() => {});
  }

  // An alarm firing interrupts any turn in progress. Android: wake listening keeps running with the
  // alarm ducked (see below); a trigger or the orb / Speak button pauses the alarm for the turn.
  // iOS: wake listening stays off until the alarm ends.
  useEffect(() => {
    refreshAlarmRinging();
    const fired = addAlarmListener('onAlarmFired', () => {
      alarmRingingRef.current = true;
      setAlarmRinging(true);
      if (IS_IOS) stopWake();
      cancel();
    });
    const dismissed = addAlarmListener('onAlarmDismissed', () => {
      alarmRingingRef.current = false;
      setAlarmRinging(false);
    });
    return () => {
      fired.remove();
      dismissed.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancel]);

  // Android: while an alarm rings and we listen for "AI", play it quietly so the microphone can hear
  // the user. Native ducking lapses after 30 s, so it is re-asserted; any change back restores it.
  const duckAlarm =
    Platform.OS === 'android' &&
    alarmRinging &&
    appActive &&
    wakeEnabled &&
    wakeFatal === null &&
    SpeechRecognitionModule !== null;
  useEffect(() => {
    if (duckAlarm) {
      duckedRef.current = true;
      setRingVolume(RING_DUCK_FRACTION).catch(() => {});
      const interval = setInterval(() => {
        setRingVolume(RING_DUCK_FRACTION).catch(() => {});
      }, RING_DUCK_KEEPALIVE_MS);
      return () => clearInterval(interval);
    }
    if (duckedRef.current) {
      duckedRef.current = false;
      setRingVolume(1).catch(() => {});
    }
  }, [duckAlarm]);

  // Never leave the app stuck in an error state.
  useEffect(() => {
    if (state !== 'error') return;
    const timer = setTimeout(() => {
      if (stateRef.current === 'error') update('idle');
    }, ERROR_RESET_MS);
    return () => clearTimeout(timer);
  }, [state, update]);

  // Unmount (app teardown): release everything.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      Speech.stop();
      stopWake();
      if (stateRef.current === 'listening') SpeechRecognitionModule?.abort();
      if (wakeRetryTimerRef.current) clearTimeout(wakeRetryTimerRef.current);
      resumeAlarmAfterVoice();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resumeAlarmAfterVoice],
  );

  const wakeStatus: WakeStatus = !SpeechRecognitionModule
    ? 'no_module'
    : IS_SIMULATOR
      ? 'simulator'
      : !wakeEnabled
        ? wakeFatal === 'permission_denied'
          ? 'permission_denied'
          : 'off'
        : (wakeFatal ?? (wakeListening ? 'active' : 'paused'));

  const voiceValue: VoiceContextValue = {
    state,
    statusText: message ?? (state === 'error' ? 'Something went wrong, try again' : STATUS[state]),
    permissionRequired,
    onOrbPress,
    startVoice,
    cancel,
  };

  const wakeValue: WakeWordContextValue = {
    enabled: wakeEnabled,
    status: wakeStatus,
    promptDismissed,
    setupDismissed,
    setEnabled,
    dismissPrompt,
    dismissSetup,
    openSetup,
  };

  return (
    <VoiceContext.Provider value={voiceValue}>
      <WakeWordContext.Provider value={wakeValue}>{children}</WakeWordContext.Provider>
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const value = useContext(VoiceContext);
  if (!value) throw new Error('useVoice must be used inside VoiceProvider');
  return value;
}

export function useWakeWord() {
  const value = useContext(WakeWordContext);
  if (!value) throw new Error('useWakeWord must be used inside VoiceProvider');
  return value;
}
