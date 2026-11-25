import { VOICE_HISTORY_MAX_TURNS, isValidTimeZone, type VoiceTurn } from '@mylife/shared';
import { useFocusEffect } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { SpeechRecognitionModule, useSpeechRecognitionEvent } from '@/lib/speech-recognition';
import { VoiceApiError } from '@/lib/voice-api';
import { runVoiceTurn } from '@/lib/voice-turn';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

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

function deviceTimezone(): string | undefined {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone && isValidTimeZone(zone) ? zone : undefined;
}

function deviceLocale(): string {
  return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
}

/**
 * Hands-free voice loop: speech-to-text on the device, `POST /voice`, then text-to-speech on the
 * device. Neither the transcript nor the reply is exposed, only a short status line.
 * History lives in memory only.
 */
export function useVoiceConversation() {
  const [state, setState] = useState<VoiceState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const stateRef = useRef<VoiceState>('idle');
  const transcriptRef = useRef('');
  const historyRef = useRef<VoiceTurn[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const permissionBlockedRef = useRef(false);

  const update = (next: VoiceState, text: string | null = null) => {
    stateRef.current = next;
    setState(next);
    setMessage(text);
  };

  const speak = (text: string) => {
    update('speaking');
    const finish = () => {
      if (stateRef.current === 'speaking') update('idle');
    };
    Speech.speak(text, { onDone: finish, onStopped: finish, onError: finish });
  };

  const submit = async (text: string) => {
    const spoken = text.trim();
    if (!spoken) {
      update('idle', "Didn't catch that");
      return;
    }
    update('thinking');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const reply = await runVoiceTurn({
        text: spoken,
        history: historyRef.current,
        timezone: deviceTimezone(),
        signal: controller.signal,
        onExecuting: () => setMessage('Setting your alarm…'),
      });
      if (reply === null || controller.signal.aborted) return;
      historyRef.current = [
        ...historyRef.current,
        { role: 'user' as const, text: spoken },
        { role: 'assistant' as const, text: reply },
      ]
        .filter((turn) => turn.text.length > 0)
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

  useSpeechRecognitionEvent('result', (event) => {
    if (stateRef.current !== 'listening') return;
    transcriptRef.current = event.results[0]?.transcript ?? '';
    if (event.isFinal) void submit(transcriptRef.current);
  });

  useSpeechRecognitionEvent('end', () => {
    // Recognition ended without a final result (e.g. the user tapped stop): use what was heard.
    if (stateRef.current === 'listening') void submit(transcriptRef.current);
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (stateRef.current !== 'listening' || event.error === 'aborted') return;
    if (event.error === 'no-speech') {
      update('idle', "Didn't catch that");
    } else if (event.error === 'not-allowed') {
      permissionBlockedRef.current = true;
      update('error', 'Microphone permission needed');
    } else if (event.error === 'network') {
      update('error', 'Speech recognition needs an internet connection');
    } else {
      update('error', "Couldn't hear you, try again");
    }
  });

  const startListening = async () => {
    const recognizer = SpeechRecognitionModule;
    if (!recognizer) {
      update('error', 'Voice needs the MyLife AI dev build (not Expo Go)');
      return;
    }
    if (permissionBlockedRef.current) {
      permissionBlockedRef.current = false;
      update('idle', 'Tap to speak');
      await Linking.openSettings();
      return;
    }
    if (!recognizer.isRecognitionAvailable()) {
      update('error', "Speech recognition isn't available on this phone");
      return;
    }
    // Just-in-time: ask for the microphone only when the user first taps the orb.
    const permission = await recognizer.requestPermissionsAsync();
    if (!permission.granted) {
      permissionBlockedRef.current = true;
      update('error', 'Microphone permission needed. Tap to open settings');
      return;
    }
    transcriptRef.current = '';
    update('listening');
    recognizer.start({
      lang: deviceLocale(),
      interimResults: true,
      continuous: false,
    });
  };

  const stopAll = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    Speech.stop();
    if (stateRef.current === 'listening') SpeechRecognitionModule?.abort();
  };

  const onOrbPress = () => {
    switch (stateRef.current) {
      case 'listening':
        SpeechRecognitionModule?.stop();
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
        void startListening();
    }
  };

  // Stop everything when the screen loses focus or unmounts.
  useFocusEffect(
    useCallback(
      () => () => {
        stopAll();
        update('idle');
      },
      [],
    ),
  );
  useEffect(() => stopAll, []);

  return {
    state,
    statusText: message ?? (state === 'error' ? "Something went wrong, try again" : STATUS[state]),
    onOrbPress,
  };
}
