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
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/axios';
import { useAuth } from '../context/AuthContext';
import { ArcMark, ArrowIcon, CBFooter, SearchIcon } from './landing/shared';
import { SignInLink } from '../components/auth/SignInLink';

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
function priceLine(e: Equipment, intent: Intent): string {
  if (intent === 'RENT') {
    if (e.rentPricePerDay) return `${rupees(e.rentPricePerDay)}/day`;
    if (e.rentPricePerHour) return `${rupees(e.rentPricePerHour)}/hour`;
    return 'Ask dealer';
  }
  return e.salePrice ? rupees(e.salePrice) : 'Ask dealer';
}

export function EquipmentPage() {
  const { user } = useAuth();

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
      setEnquiryError(err?.response?.data?.message ?? 'Could not send the enquiry — please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="cb-landing rp">
      {/* slim header — same shell as /rates and /schemes */}
      <header className="rp-nav">
        <Link to="/" className="wordmark" aria-label="CropBid" style={{ color: 'var(--cb-ink)' }}>
          <ArcMark />
          <span className="wordmark-text">CropBid</span>
        </Link>
        <nav className="rp-nav-links" aria-label="Primary">
          <Link to="/">Marketplace</Link>
          <Link to="/rates">Live rates</Link>
          <Link to="/inputs">Seeds &amp; fertiliser</Link>
          <Link to="/schemes">Yojana</Link>
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
              🚜 Machines & equipment
            </span>
            <h1 className="cb-h1">Buy it, or just hire it for the season</h1>
            <p className="cb-body rp-lede">
              Tractors, rotavators, pumps, pipes and sprayers from verified dealers near you.
              Most machines are available both ways — buy outright, or hire by the day when you
              only need it at sowing and harvest.
            </p>
          </div>
        </div>

        {/* buy vs hire — the first question a farmer has */}
        <div className="sy-chips" role="group" aria-label="Buy or hire">
          {(['SALE', 'RENT'] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={`st-chip${intent === id ? ' active' : ''}`}
              onClick={() => setIntent(id)}
              aria-pressed={intent === id}
            >
              {id === 'SALE' ? 'Buy' : 'Hire by the day'}
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
            placeholder='Try "pump", "rotavator", "tractor", "drip"…'
            aria-label="Search equipment"
          />
        </div>

        {/* category chips */}
        {categories.length > 0 && (
          <div className="sy-chips">
            <button type="button" className={`st-chip${cat === '' ? ' active' : ''}`} onClick={() => setCat('')}>
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`st-chip${cat === c.id ? ' active' : ''}`}
                onClick={() => setCat(cat === c.id ? '' : c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {failed && <div className="rp-detail-note">Could not load equipment — check your connection and refresh.</div>}
        {!items && !failed && <div className="rp-detail-note">Loading equipment…</div>}
        {items && results.length === 0 && (
          <div className="rp-detail-note">
            {intent === 'RENT'
              ? 'No machines on hire match that. Try "Buy", or a different category.'
              : 'Nothing matches that. Try "Hire by the day", or a different category.'}
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
                  {e.condition === 'USED' ? `USED${e.yearMade ? ` ${e.yearMade}` : ''}` : 'NEW'}
                </span>
              </div>
              <div className="rp-name">{e.title}</div>
              <div className="sy-hindi">
                {e.dealer.location}, {e.dealer.state}{e.powerHp ? ` · ${e.powerHp} HP` : ''}
              </div>
              <div className="sy-tagline" style={{ fontWeight: 600, color: 'var(--cb-forest, #1f2d18)' }}>
                {priceLine(e, intent)}
                {/* A BOTH listing is worth flagging: a farmer browsing to buy
                    may not realise they could hire the same machine instead. */}
                {e.mode === 'BOTH' && (
                  <span className="cb-mono" style={{ marginLeft: 8, fontSize: '0.7em', opacity: 0.7 }}>
                    {intent === 'SALE' ? 'ALSO ON HIRE' : 'ALSO FOR SALE'}
                  </span>
                )}
              </div>
              {(e.dealer.verified || e.dealer.smamEmpanelled) && (
                <div className="cb-mono" style={{ fontSize: '0.68rem', marginTop: 6, opacity: 0.75 }}>
                  {e.dealer.verified && '✓ VERIFIED DEALER'}
                  {e.dealer.verified && e.dealer.smamEmpanelled && ' · '}
                  {e.dealer.smamEmpanelled && 'SMAM SUBSIDY'}
                </div>
              )}
              <span className="rp-more">{selected === e.id ? 'hide details ↑' : 'specs & dealer ↓'}</span>
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
                  {priceLine(detail, intent)} · {detail.dealer.location}, {detail.dealer.state}
                </p>
              </div>
            </div>

            <div className="sy-detail-grid">
              {detail.specs.length > 0 && (
                <div className="sy-block">
                  <span className="cb-eyebrow">Specifications</span>
                  <p>{detail.specs.join(' · ')}</p>
                </div>
              )}

              {/* Rental terms the farmer needs before calling: the deposit is
                  often the real barrier, not the day rate. */}
              {(detail.mode === 'RENT' || detail.mode === 'BOTH') && intent === 'RENT' && (
                <div className="sy-block">
                  <span className="cb-eyebrow">Hire terms</span>
                  <p>
                    {detail.rentPricePerDay ? `${rupees(detail.rentPricePerDay)} per day. ` : ''}
                    {detail.rentPricePerHour ? `${rupees(detail.rentPricePerHour)} per hour. ` : ''}
                    {detail.securityDeposit ? `${rupees(detail.securityDeposit)} refundable deposit. ` : ''}
                    Availability is confirmed by the dealer — CropBid does not hold bookings.
                  </p>
                </div>
              )}

              <div className="sy-block">
                <span className="cb-eyebrow">Dealer</span>
                <p>
                  <strong>{detail.dealer.name}</strong> · ★ {detail.dealer.rating.toFixed(1)}
                  {detail.dealer.smamEmpanelled && (
                    <> — empanelled under the SMAM scheme, so you may be able to claim 40–50% back on a purchase through them.</>
                  )}
                </p>
              </div>

              {detail.description && (
                <div className="sy-block">
                  <span className="cb-eyebrow">About</span>
                  <p>{detail.description}</p>
                </div>
              )}
            </div>

            {/* Contact is revealed only after an enquiry — that's the lead
                capture, and it's what stops the catalogue being scraped for
                dealer numbers. */}
            {unlocked[detail.id]?.contactPhone ? (
              <div className="sy-block" style={{ marginTop: 14 }}>
                <span className="cb-eyebrow">Enquiry sent</span>
                <p>
                  The dealer has your details and will call back. You can reach them directly on{' '}
                  <a href={`tel:${unlocked[detail.id]!.contactPhone}`}>
                    <strong>{unlocked[detail.id]!.contactPhone}</strong>
                  </a>
                  {unlocked[detail.id]!.contactEmail && <> · {unlocked[detail.id]!.contactEmail}</>}.
                </p>
              </div>
            ) : user ? (
              <div className="sy-block" style={{ marginTop: 14 }}>
                <span className="cb-eyebrow">
                  {intent === 'RENT' ? 'Enquire about hiring' : 'Get the dealer’s number'}
                </span>
                <textarea
                  value={note}
                  onChange={(ev) => setNote(ev.target.value)}
                  placeholder={
                    intent === 'RENT'
                      ? 'When do you need it, and for how many days? (optional)'
                      : 'Anything you want to ask the dealer? (optional)'
                  }
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
                  {sending ? 'Sending…' : intent === 'RENT' ? 'Enquire & get dealer number' : 'Get dealer number'}
                  {!sending && <ArrowIcon />}
                </button>
              </div>
            ) : (
              <div className="sy-block" style={{ marginTop: 14 }}>
                <span className="cb-eyebrow">Get the dealer&rsquo;s number</span>
                <p>
                  Sign in to send an enquiry — it shares your name with the dealer so they can call
                  you back, and unlocks their number here.
                </p>
                <Link to="/login" className="cb-btn cb-btn-primary" style={{ marginTop: 10 }}>
                  Sign in
                  <ArrowIcon />
                </Link>
              </div>
            )}
          </div>
        )}

        <p className="cb-small rp-foot">
          CropBid lists what dealers stock and passes on your enquiry — the sale or hire agreement is
          directly between you and the dealer, and we take no payment for machinery. Prices and
          availability change; confirm on the call. Never pay in advance to anyone claiming to
          represent CropBid.
        </p>
      </main>

      <CBFooter />
    </div>
  );
}
