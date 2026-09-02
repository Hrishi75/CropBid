// =============================================================================
// FAQ — /faq
// =============================================================================
// Public page, no login needed.
//
// WHY THIS PAGE HAD TO EXIST
// The FAQPage structured data was already being emitted, on /how-it-works, with
// no matching visible content anywhere on that page. Google's structured data
// policy is explicit that FAQ markup must be visible to the user on the page
// carrying it, so the block was earning nothing and risking a manual action.
// The questions now live here, in the markup, and the JSON-LD moved with them
// (see lib/seo.ts).
//
// THE ANSWERS ARE THE SINGLE SOURCE
// FAQ_ITEMS below is rendered AND fed to the JSON-LD generator, so the markup
// and the page cannot drift apart — which is the whole failure mode this page
// was created to fix. Keep answers plain-text: they are lifted almost verbatim
// by answer engines, and an answer that reads as marketing gets dropped.
//
// If you change how the product works, change the answer in the same PR.
// =============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArcMark, ArrowIcon, CBFooter } from './landing/shared';
import { SignInLink } from '../components/auth/SignInLink';
import { FAQ_GROUPS } from '../content/faq';

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="faq-item">
      <button
        type="button"
        className="faq-q"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{q}</span>
        <span className="faq-mark" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {/*
        Rendered whether or not it is open, and hidden with CSS rather than
        unmounted. An answer that only exists in the DOM after a click is not
        "visible on the page" to a crawler, which is exactly the problem this
        page was built to solve — and it keeps the text findable with ctrl-F.
      */}
      <div className="faq-a" hidden={!open}>
        <p>{a}</p>
      </div>
    </div>
  );
}

export function FaqPage() {
  return (
    <div className="cb-landing rp">
      <header className="rp-nav">
        <Link to="/" className="wordmark" aria-label="CropBid" style={{ color: 'var(--cb-ink)' }}>
          <ArcMark />
          <span className="wordmark-text">CropBid</span>
        </Link>
        <nav className="rp-nav-links" aria-label="Primary">
          <Link to="/">Marketplace</Link>
          <Link to="/rates">Live rates</Link>
          <Link to="/partner" className="nav-signin">Become a partner</Link>
          <SignInLink className="cb-btn cb-btn-primary">
            <ArrowIcon />
          </SignInLink>
        </nav>
      </header>

      <main className="rp-main">
        <div className="rp-head">
          <div>
            <span className="cb-chip cb-chip-sage" style={{ marginBottom: 14 }}>
              Questions
            </span>
            <h1 className="cb-h1">Frequently asked questions</h1>
            <p className="cb-body rp-lede">
              How buying, selling and getting paid actually work on CropBid. If your
              question isn't here, write to us at{' '}
              <a href="mailto:info@cropbid.in" style={{ color: 'var(--cb-ink-2)' }}>
                info@cropbid.in
              </a>{' '}
              and we'll answer it.
            </p>
          </div>
        </div>

        {FAQ_GROUPS.map((group) => (
          <section key={group.title} style={{ marginTop: 40 }}>
            <h2 className="cb-h2" style={{ marginBottom: 4 }}>{group.title}</h2>
            <p className="cb-small" style={{ color: 'var(--cb-ink-3)', marginBottom: 16 }}>
              {group.blurb}
            </p>
            <div className="faq-list">
              {group.items.map((it) => <FaqItem key={it.q} q={it.q} a={it.a} />)}
            </div>
          </section>
        ))}

        <section style={{ marginTop: 44 }}>
          <div className="cb-card" style={{ padding: 24 }}>
            <h2 className="cb-h3" style={{ marginBottom: 6 }}>Still stuck?</h2>
            <p className="cb-body" style={{ maxWidth: '60ch', marginBottom: 14 }}>
              Mail us and a person will reply. For how the whole flow fits together, the
              step-by-step walkthrough goes deeper than this page does.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a href="mailto:info@cropbid.in" className="cb-btn cb-btn-primary">
                info@cropbid.in
              </a>
              <Link to="/how-it-works" className="cb-btn cb-btn-ghost">How CropBid works</Link>
              <Link to="/privacy" className="cb-btn cb-btn-ghost">Privacy policy</Link>
            </div>
          </div>
        </section>
      </main>

      <CBFooter />
    </div>
  );
}
