// =============================================================================
// Schemes Page — /schemes · Sarkari Yojana, searchable
// =============================================================================
// A farmer-first catalogue of government schemes: what you get, who
// qualifies, how to apply, and the official link — in simple words. Search
// works in English, Hinglish and Hindi ("bima", "कर्ज", "pension"); the
// catalogue is served by /api/schemes and filtered locally as you type.
// Public page — no login needed, same as /rates.
//
// The page reads in English, Hindi or Marathi from the header's language
// dropdown. Each scheme's own text arrives in all three from the API
// (`translations`, server/src/services/schemeTranslations.ts); a field with
// no translation shows in English.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import api from '../lib/axios';
import { ArcMark, ArrowIcon, CBFooter, SearchIcon } from './landing/shared';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';

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
  translations?: { hi: SchemeText; mr: SchemeText };
}

interface SchemeText {
  name?: string;
  tagline: string;
  benefit: string;
  eligibility: string;
  apply: string;
}

/**
 * A scheme as the reader sees it: its text in their language, with the
 * English name kept as `english` beside a translated one.
 */
function readable(s: Scheme, lang: string) {
  const code = lang.slice(0, 2);
  const tr = code === 'hi' || code === 'mr' ? s.translations?.[code] : undefined;
  const local = code === 'hi' ? s.hindiName : tr?.name;
  return {
    name: local ?? s.name,
    // In English the Hindi name sits under the English one, as it always has.
    second: local ? s.name : s.hindiName,
    tagline: tr?.tagline ?? s.tagline,
    benefit: tr?.benefit ?? s.benefit,
    eligibility: tr?.eligibility ?? s.eligibility,
    apply: tr?.apply ?? s.apply,
  };
}

interface SchemesData {
  count: number;
  categories: Record<string, string>;
  schemes: Scheme[];
}

function matches(s: Scheme, needle: string, categories: Record<string, string>, tr: (key: string, lng: string) => string): boolean {
  const translated = s.translations
    ? [s.translations.hi, s.translations.mr].flatMap((t) => [t.name ?? '', t.tagline, t.benefit, t.eligibility, t.apply])
    : [];
  // The category name in all three languages, as the chips show it.
  const label = categories[s.category] ?? '';
  const labels = label ? [label, tr(label, 'hi'), tr(label, 'mr')] : [];
  return [s.name, s.hindiName, s.tagline, s.benefit, s.eligibility, s.apply, s.keywords, ...labels, ...translated]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

export function SchemesPage() {
  const { t, i18n } = useTranslation();
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
    if (needle) out = out.filter((s) => matches(s, needle, data.categories, (key, lng) => i18n.t(key, { lng })));
    return out;
  }, [data, q, cat, i18n]);

  const detail = results.find((s) => s.slug === selected) ?? null;
  const detailText = detail ? readable(detail, i18n.language) : null;
  const categoryLabel = (id: string) => t(data?.categories[id] ?? '');

  return (
    <div className="cb-landing rp">
      {/* slim header — same shell as /rates */}
      <header className="rp-nav rp-nav-lang">
        <Link to="/" className="wordmark" aria-label="CropBid" style={{ color: 'var(--cb-ink)' }}>
          <ArcMark />
          <span className="wordmark-text">CropBid</span>
        </Link>
        <nav className="rp-nav-links" aria-label="Primary">
          <LanguageSwitcher />
          <Link to="/">{t('Marketplace')}</Link>
          <Link to="/rates">{t('Live rates')}</Link>
          <Link to="/login" className="nav-signin rp-nav-optional">{t('Sign in')}</Link>
          <Link to="/signup" className="cb-btn cb-btn-primary">
            {t('Start trading')}
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
            <h1 className="cb-h1">{t("Every government scheme you're owed, in one place")}</h1>
            <p className="cb-body rp-lede">
              {t('Income support, crop insurance, cheap loans and subsidies, in simple words: what you get, who qualifies and how to apply. Search in English, Hindi or Marathi.')}
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
            placeholder={t('Try "bima", "loan", "पेंशन", "solar pump", "tractor"…')}
            aria-label={t('Search government schemes')}
          />
        </div>

        {/* category chips */}
        {data && (
          <div className="sy-chips">
            <button type="button" className={`st-chip${cat === '' ? ' active' : ''}`} onClick={() => { setCat(''); setSelected(null); }}>
              {t('All schemes')}
            </button>
            {Object.keys(data.categories).map((id) => (
              <button
                key={id}
                type="button"
                className={`st-chip${cat === id ? ' active' : ''}`}
                onClick={() => { setCat(cat === id ? '' : id); setSelected(null); }}
              >
                {categoryLabel(id)}
              </button>
            ))}
          </div>
        )}

        {failed && <div className="rp-detail-note">{t('Could not load the schemes. Check your connection and refresh the page.')}</div>}
        {!data && !failed && <div className="rp-detail-note">{t('Loading schemes…')}</div>}
        {data && results.length === 0 && (
          <div className="rp-detail-note">
            {t('Nothing matches “{{q}}”. Try a simpler word like “loan”, “bima”, “pension” or “solar”, or clear the search.', { q })}
          </div>
        )}

        {/* scheme cards */}
        <div className="rp-grid sy-grid">
          {results.map((s) => {
            const text = readable(s, i18n.language);
            return (
              <button
                key={s.slug}
                type="button"
                className={`rp-card${selected === s.slug ? ' active' : ''}`}
                onClick={() => setSelected(selected === s.slug ? null : s.slug)}
                aria-expanded={selected === s.slug}
              >
                <div className="rp-card-top">
                  <span className="rp-emoji" aria-hidden="true">{s.emoji}</span>
                  <span className="cb-mono rp-source">{categoryLabel(s.category).toUpperCase()}</span>
                </div>
                <div className="rp-name">{text.name}</div>
                <div className="sy-hindi">{text.second}</div>
                <div className="sy-tagline">{text.tagline}</div>
                <span className="rp-more">{t(selected === s.slug ? 'Hide details ↑' : 'What you get and how to apply ↓')}</span>
              </button>
            );
          })}
        </div>

        {/* detail panel for the selected scheme */}
        {detail && detailText && (
          <div className="sy-detail">
            <div className="sy-detail-head">
              <span className="sy-detail-emoji" aria-hidden="true">{detail.emoji}</span>
              <div>
                <h2 className="sy-detail-name">{detailText.name} <span className="sy-hindi">· {detailText.second}</span></h2>
                <p className="sy-tagline" style={{ marginTop: 2 }}>{detailText.tagline}</p>
              </div>
              <a className="cb-btn cb-btn-primary sy-apply" href={detail.link} target="_blank" rel="noopener noreferrer">
                {t('Official site')}
                <ArrowIcon />
              </a>
            </div>
            <div className="sy-detail-grid">
              <div className="sy-block">
                <span className="cb-eyebrow">{t('What you get')}</span>
                <p>{detailText.benefit}</p>
              </div>
              <div className="sy-block">
                <span className="cb-eyebrow">{t('Who qualifies')}</span>
                <p>{detailText.eligibility}</p>
              </div>
              <div className="sy-block">
                <span className="cb-eyebrow">{t('How to apply')}</span>
                <p>{detailText.apply}</p>
              </div>
            </div>
          </div>
        )}

        <p className="cb-small rp-foot">
          {t('Scheme details are simplified summaries. Amounts and rules can change, and some states add their own top-ups. The official site linked on each scheme always has the final word. Never pay an agent to "get you" a government scheme: applying is free or nearly free.')}
        </p>
      </main>

      <CBFooter />
    </div>
  );
}
