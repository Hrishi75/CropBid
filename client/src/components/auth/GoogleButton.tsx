// =============================================================================
// GoogleButton: Google's own "Continue with Google" button
// =============================================================================
// Google draws it (their brand rules require their button, not a lookalike),
// and a popup does the account picking, so the page behind the sign-in window
// is never navigated away from. What comes back is an ID token, passed up to
// the caller to send to the API.
//
// Renders nothing when VITE_GOOGLE_CLIENT_ID is blank or Google's script will
// not load (a blocker, no network): the password lanes beside it still work,
// and an empty slot is better than a button that does nothing.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID, loadGoogleIdentity } from '../../lib/googleIdentity';

// initialize() is page-wide and Google warns when it is called twice, so it is
// called once and the callback forwards to whichever button is mounted now.
let initialized = false;
let forward: ((credential: string) => void) | null = null;

interface Props {
  onCredential: (credential: string) => void;
}

export function GoogleButton({ onCredential }: Props) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  // The latest handler, without re-drawing the button every render.
  const handlerRef = useRef(onCredential);
  useEffect(() => { handlerRef.current = onCredential; }, [onCredential]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let live = true;
    let observer: ResizeObserver | undefined;
    const mine = (credential: string) => handlerRef.current(credential);
    forward = mine;

    loadGoogleIdentity()
      .then(() => {
        const id = window.google?.accounts?.id;
        if (!live || !id || !slotRef.current) return;
        if (!initialized) {
          id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: (response) => { if (response.credential) forward?.(response.credential); },
            ux_mode: 'popup',
          });
          initialized = true;
        }
        // Google's button takes a pixel width, at most 400, and CSS cannot
        // stretch its iframe. So it is drawn to the column's width, and drawn
        // again when that changes: the column has no width yet in the frame the
        // window opens in, and measuring once then gave the 200px minimum.
        const slot = slotRef.current;
        let drawn = 0;
        const draw = () => {
          const width = Math.max(200, Math.min(400, Math.floor(slot.clientWidth)));
          if (Math.abs(width - drawn) < 8) return;
          drawn = width;
          slot.replaceChildren();
          id.renderButton(slot, {
            type: 'standard', theme: 'outline', size: 'large', text: 'continue_with',
            shape: 'pill', logo_alignment: 'center', width,
          });
        };
        draw();
        observer = new ResizeObserver(draw);
        observer.observe(slot);
      })
      .catch(() => { if (live) setFailed(true); });

    return () => {
      live = false;
      observer?.disconnect();
      if (forward === mine) forward = null;
    };
  }, []);

  if (!GOOGLE_CLIENT_ID || failed) return null;

  return (
    <>
      {/* Fixed height so the form below does not jump when Google's iframe lands. */}
      <div ref={slotRef} style={{ minHeight: 44, display: 'flex', justifyContent: 'center' }} />
      <div className="cb-auth-or" aria-hidden="true"><span>or</span></div>
    </>
  );
}
