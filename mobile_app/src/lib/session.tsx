import { createContext, useContext, useState, type PropsWithChildren } from 'react';

/**
 * Placeholder session state. The app is guest-first: it always opens into the tabs.
 *
 * TODO(Phase 2): replace with Supabase anonymous sign-in plus identity linking, so a
 * guest can upgrade to a signed-in (Pro) account without losing data. The session will
 * be persisted with expo-secure-store. The app never holds any other secrets
 * (see CLAUDE.md rule 1).
 */
export type SessionStatus = 'guest' | 'signedIn';

type SessionContextValue = {
  status: SessionStatus;
  signIn: () => void;
  /** Returns to guest mode; the user stays in the app. */
  signOut: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<SessionStatus>('guest');

  const value: SessionContextValue = {
    status,
    signIn: () => setStatus('signedIn'),
    signOut: () => setStatus('guest'),
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside <SessionProvider>');
  }
  return context;
}
