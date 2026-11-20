import { useSyncExternalStore } from 'react';

// A question typed outside the panel (the Dashboard Ask box) waits here until the panel sends it.
// It stays in this browser tab, out of the URL, so it never reaches server logs or history.
let waiting: string | undefined;
const listeners = new Set<() => void>();

export function handOffQuestion(question: string) {
  waiting = question;
  for (const listener of listeners) listener();
}

export function takeHandedOffQuestion() {
  const question = waiting;
  waiting = undefined;
  return question;
}

export function useHandedOffQuestion() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => waiting,
    () => undefined,
  );
}
