// =============================================================================
// Equipment Page — /equipment · machines, pumps and pipes to buy or hire
// =============================================================================
// A lead-gen catalogue, not a shop. Farmers filter by BUY or HIRE and by
// category, open a machine for its spec sheet, then raise an enquiry — which
// is what unlocks the dealer's phone number and hands the lead over. CropBid
// never takes payment for machinery; the dealer closes the deal offline.
//
// WHY THE BUY / HIRE TOGGLE LEADS
// It's the first question a farmer actually has. A ₹7.8L tractor is out of
// reach for a smallholder who will happily pay ₹1,400/day at sowing time, so
// the same machine leads with a sale price for one farmer and a day rate for
// another. Listings marked BOTH answer to either filter.
//
// Public page — browsing needs no login, same as /rates and /schemes. Raising
// an enquiry does, because that's when we hand over a dealer's number.
// Styling reuses the /schemes + /rates class shell (rp-*, sy-*, cb-*) rather
// than inventing a parallel stylesheet.
//
// The page reads in English, Hindi or Marathi from the header's language
// dropdown. What a dealer listed (a machine's name, specs and description)
// is shown as entered; everything around it is translated.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Link } from 'react-router-dom';
import api from '../lib/axios';
import { useAuth } from '../context/AuthContext';
import { ArcMark, ArrowIcon, CBFooter, SearchIcon } from './landing/shared';
import { SignInLink } from '../components/auth/SignInLink';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';

// --- data shapes (mirror server/src/services/equipment.service.ts) ---

interface Dealer {
  id: string;
  name: string;
  location: string;
  state: string;
  verified: boolean;
  rating: number;
  smamEmpanelled: boolean;
  // Present only in the enquiry response — never on browse/detail.
  contactPhone?: string;
  contactEmail?: string | null;
}

interface Equipment {
  id: string;
  title: string;
  category: string;
  brand?: string | null;
  modelName?: string | null;
  condition: 'NEW' | 'USED';
  yearMade?: number | null;
  mode: 'SALE' | 'RENT' | 'BOTH';
  salePrice?: number | null;
  rentPricePerDay?: number | null;
  rentPricePerHour?: number | null;
  securityDeposit?: number | null;
  currency: string;
  powerHp?: number | null;
  specs: string[];
  description?: string | null;
  location: string;
  state: string;
  dealer: Dealer;
}

interface CategoryMeta {
  id: string;
  label: string;
  count: number;
}

type Intent = 'SALE' | 'RENT';

const CATEGORY_EMOJI: Record<string, string> = {
  TRACTOR: '🚜',
  TILLAGE: '⛏️',
  HARVESTER: '🌾',
  IRRIGATION: '💧',
  SPRAYER: '🪣',
  THRESHER: '🌿',
  POWER: '⚙️',
  TOOLS: '🔧',
};

function rupees(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

// The headline price depends on what the farmer is shopping for. A BOTH
// listing under the HIRE filter must lead with its day rate, not its sale
// price, or the farmer reads "₹7,85,000" and bounces off a machine they could
// have rented for ₹1,400.
function priceLine(e: Equipment, intent: Intent, t: TFunction): string {
  if (intent === 'RENT') {
    if (e.rentPricePerDay) return t('{{price}} a day', { price: rupees(e.rentPricePerDay) });
    if (e.rentPricePerHour) return t('{{price}} an hour', { price: rupees(e.rentPricePerHour) });
    return t('Ask the dealer');
  }
  return e.salePrice ? rupees(e.salePrice) : t('Ask the dealer');
}

export function EquipmentPage() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const [items, setItems] = useState<Equipment[] | null>(null);
  const [categories, setCategories] = useState<CategoryMeta[]>([]);
  const [failed, setFailed] = useState(false);

  const [intent, setIntent] = useState<Intent>('SALE');
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [enquiryError, setEnquiryError] = useState('');
  // Dealer contacts unlocked this session, keyed by equipment id. Populated
  // only by a successful enquiry — see the service's contact rule.
  const [unlocked, setUnlocked] = useState<Record<string, Dealer>>({});

  // Category counts come from real stock, so empty categories never show up.
  useEffect(() => {
    let on = true;
    api.get('/equipment/meta')
      .then(({ data }) => { if (on) setCategories(data.categories.filter((c: CategoryMeta) => c.count > 0)); })
      .catch(() => { /* chips are optional — the list still works without them */ });
    return () => { on = false; };
  }, []);

  // Mode and category filter server-side; free text filters locally so typing
  // stays instant.
  useEffect(() => {
    let on = true;
    setItems(null);
    setFailed(false);
    setSelected(null);
    api.get('/equipment', { params: { mode: intent, category: cat || undefined, limit: 50 } })
      .then(({ data }) => { if (on) setItems(data.equipment); })
      .catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, [intent, cat]);

  const results = useMemo(() => {
    if (!items) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((e) =>
      [e.title, e.brand, e.modelName, e.location, e.dealer.name]
        .filter(Boolean).join(' ').toLowerCase().includes(needle)
    );
  }, [items, q]);

  const detail = results.find((e) => e.id === selected) ?? null;

  async function enquire(e: Equipment) {
    setEnquiryError('');
    setSending(true);
    try {
      // A BOTH listing needs the intent spelled out; for SALE/RENT-only rows
      // the server would reject a mismatched intent, so send what's on offer.
      const askFor: Intent = e.mode === 'BOTH' ? intent : (e.mode as Intent);
      const { data } = await api.post(`/equipment/${e.id}/enquiry`, {
        intent: askFor,
        message: note.trim() || undefined,
      });
      setUnlocked((prev) => ({ ...prev, [e.id]: data.dealer }));
      setNote('');
    } catch (err: any) {
      setEnquiryError(err?.response?.data?.message ?? t('Could not send the enquiry. Please try again.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="cb-landing rp">
      {/* slim header — same shell as /rates and /schemes */}
      <header className="rp-nav rp-nav-lang">
        <Link to="/" className="wordmark" aria-label="CropBid" style={{ color: 'var(--cb-ink)' }}>
          <ArcMark />
          <span className="wordmark-text">CropBid</span>
        </Link>
        <nav className="rp-nav-links" aria-label="Primary">
          <LanguageSwitcher />
          <Link to="/">{t('Marketplace')}</Link>
          <Link to="/rates">{t('Live rates')}</Link>
          <Link to="/inputs">{t('Seeds & fertiliser')}</Link>
          <Link to="/schemes">{t('Yojana')}</Link>
          <Link to="/partner" className="nav-signin rp-nav-optional">{t('Become a partner')}</Link>
          <SignInLink className="cb-btn cb-btn-primary" label={t('Sign in')}>
            <ArrowIcon />
          </SignInLink>
        </nav>
      </header>

      <main className="rp-main">
        <div className="rp-head">
          <div>
            <span className="cb-chip cb-chip-sage" style={{ marginBottom: 14 }}>
              🚜 {t('Machines & equipment')}
            </span>
            <h1 className="cb-h1">{t('Buy it, or just hire it for the season')}</h1>
            <p className="cb-body rp-lede">
              {t('Tractors, rotavators, pumps, pipes and sprayers from dealers near you. Most machines come both ways: buy one outright, or hire it by the day when you only need it at sowing and harvest.')}
            </p>
          </div>
        </div>

        {/* buy vs hire — the first question a farmer has */}
        <div className="sy-chips" role="group" aria-label={t('Buy or hire')}>
          {(['SALE', 'RENT'] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={`st-chip${intent === id ? ' active' : ''}`}
              onClick={() => setIntent(id)}
              aria-pressed={intent === id}
            >
              {t(id === 'SALE' ? 'Buy' : 'Hire by the day')}
            </button>
          ))}
        </div>

        {/* search */}
        <div className="sy-search">
          <SearchIcon />
          <input
            type="search"
            value={q}
            onChange={(e) => { setQ(e.target.value); setSelected(null); }}
            placeholder={t('Try "pump", "rotavator", "tractor", "drip"…')}
            aria-label={t('Search equipment')}
          />
        </div>

        {/* category chips */}
        {categories.length > 0 && (
          <div className="sy-chips">
            <button type="button" className={`st-chip${cat === '' ? ' active' : ''}`} onClick={() => setCat('')}>
              {t('All')}
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`st-chip${cat === c.id ? ' active' : ''}`}
                onClick={() => setCat(cat === c.id ? '' : c.id)}
              >
                {t(c.label)}
              </button>
            ))}
          </div>
        )}

        {failed && <div className="rp-detail-note">{t('Could not load machines. Check your connection and refresh the page.')}</div>}
        {!items && !failed && <div className="rp-detail-note">{t('Loading machines…')}</div>}
        {items && results.length === 0 && (
          <div className="rp-detail-note">
            {t(intent === 'RENT'
              ? 'No machine on hire matches that. Try “Buy”, or another category.'
              : 'No machine for sale matches that. Try “Hire by the day”, or another category.')}
          </div>
        )}

        {/* equipment cards */}
        <div className="rp-grid sy-grid">
          {results.map((e) => (
            <button
              key={e.id}
              type="button"
              className={`rp-card${selected === e.id ? ' active' : ''}`}
              onClick={() => { setSelected(selected === e.id ? null : e.id); setNote(''); setEnquiryError(''); }}
            >
              <div className="rp-card-top">
                <span className="rp-emoji" aria-hidden="true">{CATEGORY_EMOJI[e.category] ?? '🚜'}</span>
                <span className="cb-mono rp-source">
                  {e.condition === 'USED'
                    ? `${t('USED')}${e.yearMade ? ` ${e.yearMade}` : ''}`
                    : t('NEW')}
                </span>
              </div>
              <div className="rp-name">{e.title}</div>
              <div className="sy-hindi">
                {e.dealer.location}, {e.dealer.state}{e.powerHp ? ` · ${e.powerHp} HP` : ''}
              </div>
              <div className="sy-tagline" style={{ fontWeight: 600, color: 'var(--cb-forest, #1f2d18)' }}>
                {priceLine(e, intent, t)}
                {/* A BOTH listing is worth flagging: a farmer browsing to buy
                    may not realise they could hire the same machine instead. */}
                {e.mode === 'BOTH' && (
                  <span className="cb-mono" style={{ marginLeft: 8, fontSize: '0.7em', opacity: 0.7 }}>
                    {t(intent === 'SALE' ? 'ALSO ON HIRE' : 'ALSO FOR SALE')}
                  </span>
                )}
              </div>
              {(e.dealer.verified || e.dealer.smamEmpanelled) && (
                <div className="cb-mono" style={{ fontSize: '0.68rem', marginTop: 6, opacity: 0.75 }}>
                  {e.dealer.verified && `✓ ${t('VERIFIED DEALER')}`}
                  {e.dealer.verified && e.dealer.smamEmpanelled && ' · '}
                  {e.dealer.smamEmpanelled && t('SMAM SUBSIDY')}
                </div>
              )}
              <span className="rp-more">{t(selected === e.id ? 'Hide details ↑' : 'Specs and dealer ↓')}</span>
            </button>
          ))}
        </div>

        {/* detail panel for the selected machine */}
        {detail && (
          <div className="sy-detail">
            <div className="sy-detail-head">
              <span className="sy-detail-emoji" aria-hidden="true">{CATEGORY_EMOJI[detail.category] ?? '🚜'}</span>
              <div>
                <h2 className="sy-detail-name">
                  {detail.title}
                  {detail.brand && <span className="sy-hindi"> · {detail.brand}</span>}
                </h2>
                <p className="sy-tagline" style={{ marginTop: 2 }}>
                  {priceLine(detail, intent, t)} · {detail.dealer.location}, {detail.dealer.state}
                </p>
              </div>
            </div>

            <div className="sy-detail-grid">
              {detail.specs.length > 0 && (
                <div className="sy-block">
                  <span className="cb-eyebrow">{t('Specifications')}</span>
                  <p>{detail.specs.join(' · ')}</p>
                </div>
              )}

              {/* Rental terms the farmer needs before calling: the deposit is
                  often the real barrier, not the day rate. */}
              {(detail.mode === 'RENT' || detail.mode === 'BOTH') && intent === 'RENT' && (
                <div className="sy-block">
                  <span className="cb-eyebrow">{t('Hire terms')}</span>
                  <p>
                    {detail.rentPricePerDay ? `${t('{{price}} a day.', { price: rupees(detail.rentPricePerDay) })} ` : ''}
                    {detail.rentPricePerHour ? `${t('{{price}} an hour.', { price: rupees(detail.rentPricePerHour) })} ` : ''}
                    {detail.securityDeposit ? `${t('{{price}} deposit, returned to you.', { price: rupees(detail.securityDeposit) })} ` : ''}
                    {t('The dealer confirms when it is free. CropBid does not take bookings.')}
                  </p>
                </div>
              )}

              <div className="sy-block">
                <span className="cb-eyebrow">{t('Dealer')}</span>
                <p>
                  <strong>{detail.dealer.name}</strong> · ★ {detail.dealer.rating.toFixed(1)}
                  {detail.dealer.smamEmpanelled && (
                    <>. {t('Listed under the SMAM scheme, so you may be able to claim 40 to 50% back on a machine bought from them.')}</>
                  )}
                </p>
              </div>

              {detail.description && (
                <div className="sy-block">
                  <span className="cb-eyebrow">{t('About')}</span>
                  <p>{detail.description}</p>
                </div>
              )}
            </div>

            {/* Contact is revealed only after an enquiry — that's the lead
                capture, and it's what stops the catalogue being scraped for
                dealer numbers. */}
            {unlocked[detail.id]?.contactPhone ? (
              <div className="sy-block" style={{ marginTop: 14 }}>
                <span className="cb-eyebrow">{t('Enquiry sent')}</span>
                <p>
                  {t('The dealer has your details and will call you back. You can also call them on')}{' '}
                  <a href={`tel:${unlocked[detail.id]!.contactPhone}`}>
                    <strong>{unlocked[detail.id]!.contactPhone}</strong>
                  </a>
                  {unlocked[detail.id]!.contactEmail && <> · {unlocked[detail.id]!.contactEmail}</>}
                </p>
              </div>
            ) : user ? (
              <div className="sy-block" style={{ marginTop: 14 }}>
                <span className="cb-eyebrow">
                  {t(intent === 'RENT' ? 'Ask about hiring' : 'Get the dealer’s number')}
                </span>
                <textarea
                  value={note}
                  onChange={(ev) => setNote(ev.target.value)}
                  placeholder={t(
                    intent === 'RENT'
                      ? 'When do you need it, and for how many days? (optional)'
                      : 'Anything you want to ask the dealer? (optional)',
                  )}
                  rows={3}
                  style={{ width: '100%', marginTop: 8, padding: 10, borderRadius: 10, border: '1px solid var(--cb-line, #d8d4c8)', font: 'inherit' }}
                />
                {enquiryError && <p className="rp-detail-note" style={{ marginTop: 8 }}>{enquiryError}</p>}
                <button
                  type="button"
                  className="cb-btn cb-btn-primary"
                  style={{ marginTop: 10 }}
                  disabled={sending}
                  onClick={() => enquire(detail)}
                >
                  {t(sending ? 'Sending…' : intent === 'RENT' ? 'Ask and get the dealer’s number' : 'Get the dealer’s number')}
                  {!sending && <ArrowIcon />}
                </button>
              </div>
            ) : (
              <div className="sy-block" style={{ marginTop: 14 }}>
                <span className="cb-eyebrow">{t('Get the dealer’s number')}</span>
                <p>
                  {t('Sign in to send an enquiry. The dealer gets your name so they can call you back, and their number shows here.')}
                </p>
                <Link to="/login" className="cb-btn cb-btn-primary" style={{ marginTop: 10 }}>
                  {t('Sign in')}
                  <ArrowIcon />
                </Link>
              </div>
            )}
          </div>
        )}

        <p className="cb-small rp-foot">
          {t('CropBid lists what dealers stock and passes on your enquiry. The sale or hire is agreed directly between you and the dealer, and we take no payment for machines. Prices and availability change, so confirm them on the call. Never pay in advance to anyone who says they are from CropBid.')}
        </p>
      </main>

      <CBFooter />
    </div>
  );
}
