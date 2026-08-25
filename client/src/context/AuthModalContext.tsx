// =============================================================================
// AuthModalContext — "open the sign-in window" from anywhere
// =============================================================================
// The modal lives once, at the app root, and any component can raise it:
//
//   const { openAuth } = useAuthModal();
//   <button onClick={() => openAuth()}>Sign in</button>
//
// WHY A CONTEXT RATHER THAN LOCAL STATE PER PAGE? Sign-in is raised from
// places scattered all over the tree — the landing header, the app navbar, a
// checkout button, a "save this" tap — and every one of them wants the same
// single dialog. Local state would mean each surface owning its own copy, and
// two of them could be open at once.
//
// openAuth() takes the same options as the modal, so a caller can say what the
// account should be (intendedRole), where to land afterwards (redirectTo), and
// why the window appeared (title) — "Sign in to place this order" reads far
// better than a bare form appearing over a checkout.
// =============================================================================

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthModal } from '../components/auth/AuthModal';
import type { AuthModalOptions } from '../components/auth/AuthModal';

interface AuthModalContextValue {
  openAuth: (options?: AuthModalOptions) => void;
  closeAuth: () => void;
  isAuthOpen: boolean;
}

const AuthModalContext = createContext<AuthModalContextValue | undefined>(undefined);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<AuthModalOptions | null>(null);

  const openAuth = useCallback((next?: AuthModalOptions) => setOptions(next ?? {}), []);
  const closeAuth = useCallback(() => setOptions(null), []);

  const value = useMemo(
    () => ({ openAuth, closeAuth, isAuthOpen: options !== null }),
    [openAuth, closeAuth, options],
  );

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      <AuthModal open={options !== null} onClose={closeAuth} {...(options ?? {})} />
    </AuthModalContext.Provider>
  );
}

export function useAuthModal(): AuthModalContextValue {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error('useAuthModal must be used inside AuthModalProvider');
  return ctx;
}
