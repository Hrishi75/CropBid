// =============================================================================
// Schemes Page — /schemes · Sarkari Yojana, searchable
// =============================================================================
// A farmer-first catalogue of government schemes: what you get, who
// qualifies, how to apply, and the official link — in simple words. Search
// works in English, Hinglish and Hindi ("bima", "कर्ज", "pension"); the
// catalogue is served by /api/schemes and filtered locally as you type.
// Public page — no login needed, same as /rates.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/axios';
import { ArcMark, ArrowIcon, CBFooter, SearchIcon } from './landing/shared';

// --- data shapes (mirror server/src/services/schemes.service.ts) ---

interface Scheme {
  slug: string;
  name: string;
  hindiName: string;
  emoji: string;
  category: string;
  tagline: string;
  benefit: string;
  eligibility: string;
  apply: string;
  link: string;
  keywords: string;
}

interface SchemesData {
  count: number;
  categories: Record<string, string>;
  schemes: Scheme[];
}

function matches(s: Scheme, needle: string, categories: Record<string, string>): boolean {
  return [s.name, s.hindiName, s.tagline, s.benefit, s.eligibility, s.apply, s.keywords, categories[s.category] ?? '']
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

export function SchemesPage() {
  const [data, setData] = useState<SchemesData | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    api.get('/schemes')
      .then(({ data }) => { if (on) setData(data); })
      .catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, []);

  const results = useMemo(() => {
    if (!data) return [];
    let out = data.schemes;
    if (cat) out = out.filter((s) => s.category === cat);
    const needle = q.trim().toLowerCase();
    if (needle) out = out.filter((s) => matches(s, needle, data.categories));
    return out;
  }, [data, q, cat]);

  const detail = results.find((s) => s.slug === selected) ?? null;

  return (
    <div className="cb-landing rp">
      {/* slim header — same shell as /rates */}
      <header className="rp-nav">
        <Link to="/" className="wordmark" aria-label="CropBid" style={{ color: 'var(--cb-ink)' }}>
          <ArcMark />
          <span className="wordmark-text">CropBid</span>
        </Link>
        <nav className="rp-nav-links" aria-label="Primary">
          <Link to="/">Marketplace</Link>
          <Link to="/rates">Live rates</Link>
          <Link to="/login" className="nav-signin">Sign in</Link>
          <Link to="/signup" className="cb-btn cb-btn-primary">
            Start trading
            <ArrowIcon />
          </Link>
        </nav>
      </header>

      <main className="rp-main">
        <div className="rp-head">
          <div>
            <span className="cb-chip cb-chip-sage" style={{ marginBottom: 14 }}>
              🏛️ Sarkari Yojana · सरकारी योजना
            </span>
            <h1 className="cb-h1">Every govt scheme you're owed, in one place</h1>
            <p className="cb-body rp-lede">
              Income support, crop insurance, cheap loans, subsidies — explained in simple words:
              what you get, who qualifies, and exactly how to apply. Search in English or Hindi.
            </p>
          </div>
        </div>

        {/* search */}
        <div className="sy-search">
          <SearchIcon />
          <input
            type="search"
            value={q}
            onChange={(e) => { setQ(e.target.value); setSelected(null); }}
            placeholder='Try "bima", "loan", "पेंशन", "solar pump", "tractor"…'
            aria-label="Search government schemes"
          />
        </div>

        {/* category chips */}
        {data && (
          <div className="sy-chips">
            <button type="button" className={`st-chip${cat === '' ? ' active' : ''}`} onClick={() => { setCat(''); setSelected(null); }}>
              All schemes
            </button>
            {Object.entries(data.categories).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`st-chip${cat === id ? ' active' : ''}`}
                onClick={() => { setCat(cat === id ? '' : id); setSelected(null); }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {failed && <div className="rp-detail-note">Could not load the schemes catalogue — check your connection and refresh.</div>}
        {!data && !failed && <div className="rp-detail-note">Loading schemes…</div>}
        {data && results.length === 0 && (
          <div className="rp-detail-note">
            Nothing matches “{q}”. Try a simpler word — “loan”, “bima”, “pension”, “solar” — or clear the search.
          </div>
        )}

        {/* scheme cards */}
        <div className="rp-grid sy-grid">
          {results.map((s) => (
            <button
              key={s.slug}
              type="button"
              className={`rp-card${selected === s.slug ? ' active' : ''}`}
              onClick={() => setSelected(selected === s.slug ? null : s.slug)}
            >
              <div className="rp-card-top">
                <span className="rp-emoji" aria-hidden="true">{s.emoji}</span>
                <span className="cb-mono rp-source">{data?.categories[s.category]?.toUpperCase()}</span>
              </div>
              <div className="rp-name">{s.name}</div>
              <div className="sy-hindi">{s.hindiName}</div>
              <div className="sy-tagline">{s.tagline}</div>
              <span className="rp-more">{selected === s.slug ? 'hide details ↑' : 'what you get & how to apply ↓'}</span>
            </button>
          ))}
        </div>

        {/* detail panel for the selected scheme */}
        {detail && (
          <div className="sy-detail">
            <div className="sy-detail-head">
              <span className="sy-detail-emoji" aria-hidden="true">{detail.emoji}</span>
              <div>
                <h2 className="sy-detail-name">{detail.name} <span className="sy-hindi">· {detail.hindiName}</span></h2>
                <p className="sy-tagline" style={{ marginTop: 2 }}>{detail.tagline}</p>
              </div>
              <a className="cb-btn cb-btn-primary sy-apply" href={detail.link} target="_blank" rel="noopener noreferrer">
                Official site
                <ArrowIcon />
              </a>
            </div>
            <div className="sy-detail-grid">
              <div className="sy-block">
                <span className="cb-eyebrow">What you get</span>
                <p>{detail.benefit}</p>
              </div>
              <div className="sy-block">
                <span className="cb-eyebrow">Who qualifies</span>
                <p>{detail.eligibility}</p>
              </div>
              <div className="sy-block">
                <span className="cb-eyebrow">How to apply</span>
                <p>{detail.apply}</p>
              </div>
            </div>
          </div>
        )}

        <p className="cb-small rp-foot">
          Scheme details are simplified summaries — amounts and rules can change and some states add
          their own top-ups. The official portal linked on each scheme is always the source of truth.
          Never pay an agent to "get you" a government scheme; applications are free or near-free.
        </p>
      </main>

      <CBFooter />
    </div>
  );
}
