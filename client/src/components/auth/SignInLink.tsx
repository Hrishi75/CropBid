// =============================================================================
// SignInLink — the "Sign in" affordance every public header carries
// =============================================================================
// Every marketing/public page (rates, equipment, demand board, privacy, how it
// works) has the same signed-out header pair: a quiet "Sign in" and a loud
// primary CTA. Since sign-in became a modal, all of those need a button that
// raises the dialog rather than a link that navigates away — and they should
// all behave identically, so it lives here once.
//
// Renders a <button> styled as the existing .nav-signin link.
// =============================================================================

import type { ReactNode } from 'react';
import { useAuthModal } from '../../context/AuthModalContext';
import type { AuthModalOptions } from './AuthModal';

interface SignInLinkProps extends AuthModalOptions {
  /** Defaults to the quiet text style; pass a button class for the loud one. */
  className?: string;
  label?: string;
  /** Rendered after the label — an ArrowIcon when this is the primary CTA. */
  children?: ReactNode;
}

export function SignInLink({
  className = 'nav-signin', label = 'Sign in', children, ...options
}: SignInLinkProps) {
  const { openAuth } = useAuthModal();
  return (
    <button type="button" className={className} onClick={() => openAuth(options)}>
      {label}
      {children}
    </button>
  );
}
