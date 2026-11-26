import { useSyncExternalStore } from 'react';

/**
 * DEV-ONLY diagnostics for the wake word: what the microphone recognizer heard. Lives in memory on
 * the device only: never written to storage, never logged to the console, never sent anywhere.
 * Every function is a no-op outside `__DEV__`, so release builds never keep a transcript.
 */

export type WakeDebugResult = {
  id: number;
  at: number;
  /** Best transcript first, then the other alternatives. */
  alternatives: string[];
  isFinal: boolean;
  triggered: boolean;
};

export type WakeDebugEvent = { id: number; at: number; text: string };

type Snapshot = {
  results: readonly WakeDebugResult[];
  events: readonly WakeDebugEvent[];
};

const MAX_RESULTS = 15;
const MAX_EVENTS = 10;

let nextId = 1;
let snapshot: Snapshot = { results: [], events: [] };
const listeners = new Set<() => void>();

function publish(next: Snapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/**
 * One line per utterance: an interim result replaces the previous interim line, a final result
 * closes the line.
 */
export function recordWakeResult(alternatives: string[], isFinal: boolean, triggered: boolean) {
  if (!__DEV__ || alternatives.every((text) => !text.trim())) return;
  const entry: WakeDebugResult = {
    id: nextId++,
    at: Date.now(),
    alternatives,
    isFinal,
    triggered,
  };
  const last = snapshot.results[0];
  const rest = last && !last.isFinal ? snapshot.results.slice(1) : snapshot.results;
  publish({ ...snapshot, results: [entry, ...rest].slice(0, MAX_RESULTS) });
}

/** Session lifecycle lines such as "start", "end", "error no-speech". */
export function recordWakeEvent(text: string) {
  if (!__DEV__) return;
  const entry: WakeDebugEvent = { id: nextId++, at: Date.now(), text };
  publish({
    ...snapshot,
    events: [entry, ...snapshot.events].slice(0, MAX_EVENTS),
  });
}

export function clearWakeDebug() {
  if (!__DEV__) return;
  publish({ results: [], events: [] });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useWakeDebug(): Snapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}
