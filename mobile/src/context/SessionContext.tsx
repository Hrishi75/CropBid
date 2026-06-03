import { createContext, useContext, useState, type ReactNode } from 'react';

// Placeholder session state so navigation can switch between the auth stack and
// the app tabs. Step 5 replaces this with real JWT auth (expo-secure-store +
// the API client) while keeping the same { isSignedIn, signIn, signOut } shape.
type SessionState = {
  isSignedIn: boolean;
  signIn: () => void;
  signOut: () => void;
};

const SessionContext = createContext<SessionState | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [isSignedIn, setIsSignedIn] = useState(false);
  return (
    <SessionContext.Provider
      value={{
        isSignedIn,
        signIn: () => setIsSignedIn(true),
        signOut: () => setIsSignedIn(false),
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
