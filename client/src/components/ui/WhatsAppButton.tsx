// =============================================================================
// WhatsAppButton: the round green "chat with us" button, bottom right
// =============================================================================
// Pressed, it opens a small card above itself, laid out like a WhatsApp chat:
// a dark green header naming CropBid, a greeting bubble, the questions people
// ask most (each opening its answer in place), and a "Start chat" button that
// opens a WhatsApp chat with CropBid's business number, first line typed.
// A plain wa.me link: WhatsApp opens the app on a phone and WhatsApp Web (or
// the desktop app) on a computer, and nothing about the chat passes through
// our servers.
//
// THE ANSWERS ARE THE FAQ PAGE'S, picked by question from content/faq.ts. A
// copy here would be a second place to keep true (CLAUDE.md §5), and the one
// nobody would remember. A question that is renamed there simply drops out of
// this list rather than showing a stale answer.
//
// OFF UNTIL CONFIGURED. The number is VITE_WHATSAPP_NUMBER, a build variable
// like the Google client id: blank, and nothing is drawn, so a build that
// forgot it shows nothing rather than a link to nobody. It is public by design
// (it is printed on the link), so it is not a secret.
//
// Mounted outside AppContent beside CookieNotice, for the same reason: it is a
// browser-only control with nothing to say to a crawler.
// =============================================================================

import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isEmbedded } from '../../utils/embedded';
import { isBillPage } from '../../utils/billPages';
import { FAQ_GROUPS, type FaqItem } from '../../content/faq';

/**
 * Digits only, country code first, which is what wa.me wants. Leading zeros go
 * first, because an Indian number is often written with the trunk 0
 * (09822055667) or the international 00 (0091 ...), and wa.me reads neither.
 * A bare ten-digit number then gets 91 in front, because writing it without
 * the code is the likely slip and wa.me would otherwise read it as some other
 * country.
 */
function whatsAppDigits(raw: string | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length < 11 || digits.length > 15) return null;
  return digits;
}

const NUMBER = whatsAppDigits(import.meta.env.VITE_WHATSAPP_NUMBER);

// The questions the card leads with, in this order, matched on the FAQ's own
// wording. Shoppers first, since they are most of the site's visitors.
const PICKED = [
  'Which cities do you deliver to?',
  'How soon will my order arrive?',
  'Can I cancel an order?',
  'When do I pay, and what if the order never turns up?',
  'Does it cost anything to join CropBid?',
  'How do farmers sell crops on CropBid?',
];
const ALL_FAQS = FAQ_GROUPS.flatMap((g) => g.items);
const QUICK_FAQS: FaqItem[] = PICKED.map((q) => ALL_FAQS.find((f) => f.q === q)).filter(
  (f): f is FaqItem => Boolean(f),
);

// Where it stays away. The bill pages end in a pay button at the foot of a
// phone screen, which a floating button would sit on; admin pages are ops, who
// have the number already.
function hiddenOn(pathname: string): boolean {
  return isBillPage(pathname) || pathname.startsWith('/admin');
}

function waLink(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** The WhatsApp glyph, drawn inline so there is no image to fetch. */
function WhatsAppGlyph({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16.04 3C8.86 3 3.03 8.82 3.03 16c0 2.3.6 4.53 1.74 6.5L3 29l6.68-1.75A12.95 12.95 0 0 0 16.04 29C23.2 29 29.03 23.18 29.03 16S23.2 3 16.04 3Zm0 23.8c-1.98 0-3.92-.53-5.61-1.54l-.4-.24-3.97 1.04 1.06-3.86-.26-.4A10.74 10.74 0 0 1 5.2 16c0-5.97 4.86-10.83 10.84-10.83 5.97 0 10.83 4.86 10.83 10.83 0 5.98-4.86 10.8-10.83 10.8Zm5.94-8.1c-.33-.16-1.93-.95-2.23-1.06-.3-.11-.52-.16-.73.17-.22.32-.84 1.05-1.03 1.27-.19.22-.38.24-.7.08-.33-.16-1.38-.51-2.62-1.62-.97-.86-1.62-1.93-1.81-2.25-.19-.33-.02-.5.14-.66.15-.15.33-.38.49-.57.16-.19.22-.33.33-.54.1-.22.05-.41-.03-.57-.08-.16-.73-1.76-1-2.41-.27-.63-.53-.55-.73-.56h-.62c-.22 0-.57.08-.87.41-.3.32-1.14 1.11-1.14 2.71 0 1.6 1.17 3.14 1.33 3.36.16.22 2.3 3.5 5.56 4.91.78.34 1.38.54 1.86.69.78.25 1.49.21 2.05.13.63-.09 1.93-.79 2.2-1.55.27-.76.27-1.41.19-1.55-.08-.13-.3-.21-.62-.37Z"
      />
    </svg>
  );
}

export function WhatsAppButton() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  // Remembered as the page it was opened on, so moving to another page closes
  // it: it was opened about the page they were on.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean) => setOpenOn(next ? pathname : null);
  const [openQ, setOpenQ] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Escape and a click anywhere else close it, as any popover does. Escape
  // hands focus back to the button so a keyboard user is not dropped at the
  // top of the page.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenOn(null);
        toggleRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenOn(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  // Inside the phone app the page is a document in a frame, and a chat button
  // would take the reader out of the app (utils/embedded).
  if (!NUMBER || isEmbedded() || hiddenOn(pathname)) return null;

  const greeting = t('Hi CropBid, I have a question.');
  const label = t('Chat with CropBid on WhatsApp');

  return (
    <div className="cb-wa-root" ref={rootRef}>
      {open && (
        <div
          className="cb-wa-panel"
          id={panelId}
          ref={panelRef}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
        >
          <header className="cb-wa-head">
            <span className="cb-wa-avatar" aria-hidden="true">
              C
            </span>
            <div className="cb-wa-who">
              <strong>CropBid</strong>
              <span>{t('Ask us anything on WhatsApp')}</span>
            </div>
            <button
              type="button"
              className="cb-wa-close"
              onClick={() => {
                setOpen(false);
                toggleRef.current?.focus();
              }}
              aria-label={t('Close')}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </header>

          <div className="cb-wa-body">
            <div className="cb-wa-bubble">
              <p>{t('Hi there! 👋 Have a question? Here are the ones we get asked most.')}</p>
            </div>

            <ul className="cb-wa-faqs">
              {QUICK_FAQS.map((f) => {
                const expanded = openQ === f.q;
                return (
                  <li key={f.q}>
                    <details
                      open={expanded}
                      onToggle={(e) => {
                        const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                        setOpenQ((cur) => (isOpen ? f.q : cur === f.q ? null : cur));
                      }}
                    >
                      <summary>{f.q}</summary>
                      <p>{f.a}</p>
                      <a
                        className="cb-wa-ask"
                        href={waLink(NUMBER, `${greeting} ${f.q}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t('Still unsure? Ask us about this')}
                      </a>
                    </details>
                  </li>
                );
              })}
            </ul>

            <Link to="/faq" className="cb-wa-all">
              {t('See all FAQs')}
            </Link>
          </div>

          <footer className="cb-wa-foot">
            <a
              className="cb-wa-start"
              href={waLink(NUMBER, greeting)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsAppGlyph size={20} />
              {t('Start chat on WhatsApp')}
            </a>
          </footer>
        </div>
      )}

      <button
        type="button"
        ref={toggleRef}
        className={`cb-wa${open ? ' is-open' : ''}`}
        onClick={() => setOpen(!open)}
        aria-label={open ? t('Close') : label}
        title={open ? undefined : label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
      >
        {open ? (
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        ) : (
          <WhatsAppGlyph size={28} />
        )}
      </button>
    </div>
  );
}
