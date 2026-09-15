// =============================================================================
// Agri-Inputs Page — /inputs · seed, fertiliser and crop protection
// =============================================================================
// A lead-gen catalogue, not a shop — the same bargain as /equipment. Farmers
// filter by crop and category, open a product for its label facts, then raise
// an enquiry, which is what unlocks the shop's phone number and hands the lead
// over. CropBid never takes payment for inputs and never holds the stock.
//
// WHY THE CROP FILTER LEADS, NOT THE CATEGORY
// A farmer does not wake up wanting "fertiliser". They want to know what to put
// on cotton this season. Leading with the crop turns a catalogue into an
// answer, and it is the one filter a farmer can always complete without knowing
// any product names.
//
// WHY LICENCES ARE ON THE CARD
// Selling seed, fertiliser and pesticide is a licensed trade, and unlicensed
// counters are exactly where spurious seed enters the market. Showing that a
// shop holds the licence for what it is selling is therefore a real trust
// signal rather than a badge — and it is the same fact the server uses to
// decide whether the row may be listed at all.
//
// Public page — browsing needs no login, same as /rates, /schemes and
// /equipment. Raising an enquiry does, because that's when we hand over a
// shop's number. Styling reuses the /schemes + /rates class shell (rp-*, sy-*,
// cb-*) rather than inventing a parallel stylesheet.
// =============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/axios';
import { useAuth } from '../context/AuthContext';
import { ArcMark, ArrowIcon, CBFooter, SearchIcon } from './landing/shared';
import { SignInLink } from '../components/auth/SignInLink';

// --- data shapes (mirror server/src/services/agriInput.service.ts) ---

interface Licences {
  seed: boolean;
  fertiliser: boolean;
  pesticide: boolean;
}

interface Supplier {
  id: string;
  name: string;
  location: string;
  state: string;
  verified: boolean;
  rating: number;
  licences: Licences;
  // Present only in the enquiry response — never on browse/detail.
  contactPhone?: string;
  contactEmail?: string | null;
}

interface AgriInput {
  id: string;
  title: string;
  category: string;
  brand?: string | null;
  cropNames: string[];
  packSize: string;
  pricePerPack: number;
  currency: string;
  subsidised: boolean;
  composition?: string | null;
  germinationPct?: number | null;
  seedTreatment?: string | null;
  dosagePerAcre?: string | null;
  specs: string[];
  description?: string | null;
  location: string;
  state: string;
  supplier: Supplier;
}

interface CategoryMeta {
  id: string;
  label: string;
  count: number;
}

const CATEGORY_EMOJI: Record<string, string> = {
  SEED: '🌱',
  FERTILISER: '🧪',
  ORGANIC: '🍂',
  CROP_PROTECTION: '🛡️',
  MICRONUTRIENT: '⚗️',
  SEEDLING: '🌿',
};

// Which licence a category needs. Mirrors requiredLicence in the service — the
// client uses it only to word the badge, the server uses it to decide whether
// the row exists at all.
const CATEGORY_LICENCE: Record<string, keyof Licences | null> = {
  SEED: 'seed',
  FERTILISER: 'fertiliser',
  CROP_PROTECTION: 'pesticide',
  ORGANIC: null,
  MICRONUTRIENT: null,
  SEEDLING: null,
};

const LICENCE_LABEL: Record<keyof Licences, string> = {
  seed: 'LICENSED SEED DEALER',
  fertiliser: 'LICENSED FERTILISER DEALER',
  pesticide: 'LICENSED PESTICIDE DEALER',
};

function rupees(amount: number): string {
  // Fertiliser MRPs carry paise (urea is ₹266.50), seed packets never do.
  // Rounding everything would misquote a statutory price, so keep the decimal
  // only when there is one.
  const rounded = Math.round(amount * 100) / 100;
  return `₹${rounded.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function AgriInputsPage() {
  const { user } = useAuth();

  const [items, setItems] = useState<AgriInput[] | null>(null);
  const [categories, setCategories] = useState<CategoryMeta[]>([]);
  const [crops, setCrops] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);

  const [crop, setCrop] = useState('');
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const [acres, setAcres] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [enquiryError, setEnquiryError] = useState('');
  // Supplier contacts unlocked this session, keyed by product id. Populated
  // only by a successful enquiry — see the service's contact rule.
  const [unlocked, setUnlocked] = useState<Record<string, Supplier>>({});

  // Chips come from real stock, so empty categories and crops never show up.
  useEffect(() => {
    let on = true;
    api.get('/agri-inputs/meta')
      .then(({ data }) => {
        if (!on) return;
        setCategories(data.categories.filter((c: CategoryMeta) => c.count > 0));
        setCrops(data.crops ?? []);
      })
      .catch(() => { /* chips are optional — the list still works without them */ });
    return () => { on = false; };
  }, []);

  // Crop and category filter server-side; free text filters locally so typing
  // stays instant.
  useEffect(() => {
    let on = true;
    setItems(null);
    setFailed(false);
    setSelected(null);
    api.get('/agri-inputs', { params: { crop: crop || undefined, category: cat || undefined, limit: 50 } })
      .then(({ data }) => { if (on) setItems(data.inputs); })
      .catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, [crop, cat]);

  const results = useMemo(() => {
    if (!items) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((p) =>
      [p.title, p.brand, p.composition, p.location, p.supplier.name, ...p.cropNames]
        .filter(Boolean).join(' ').toLowerCase().includes(needle)
    );
  }, [items, q]);

  const detail = results.find((p) => p.id === selected) ?? null;

  // The licence badge for a row, or null where the category is not controlled.
  function licenceBadge(p: AgriInput): string | null {
    const needed = CATEGORY_LICENCE[p.category];
    if (!needed) return null;
    return p.supplier.licences[needed] ? LICENCE_LABEL[needed] : null;
  }

  async function enquire(p: AgriInput) {
    setEnquiryError('');
    setSending(true);
    try {
      const acreValue = Number(acres);
      const { data } = await api.post(`/agri-inputs/${p.id}/enquiry`, {
        // Only send acres when it parses to a sensible positive number — the
        // server bounds it too, but sending NaN would fail validation and lose
        // an otherwise good lead.
        acres: Number.isFinite(acreValue) && acreValue > 0 ? acreValue : undefined,
        message: note.trim() || undefined,
      });
      setUnlocked((prev) => ({ ...prev, [p.id]: data.supplier }));
      setNote('');
      setAcres('');
    } catch (err: any) {
      setEnquiryError(err?.response?.data?.message ?? 'Could not send the enquiry — please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="cb-landing rp">
      {/* slim header — same shell as /rates, /schemes and /equipment */}
      <header className="rp-nav">
        <Link to="/" className="wordmark" aria-label="CropBid" style={{ color: 'var(--cb-ink)' }}>
          <ArcMark />
          <span className="wordmark-text">CropBid</span>
        </Link>
        <nav className="rp-nav-links" aria-label="Primary">
          <Link to="/">Marketplace</Link>
          <Link to="/rates">Live rates</Link>
          <Link to="/equipment">Equipment</Link>
          <Link to="/schemes">Yojana</Link>
          <SignInLink className="cb-btn cb-btn-primary">
            <ArrowIcon />
          </SignInLink>
        </nav>
      </header>

      <main className="rp-main">
        <div className="rp-head">
          <div>
            <span className="cb-chip cb-chip-sage" style={{ marginBottom: 14 }}>
              🌱 Seeds, fertiliser & crop protection
            </span>
            <h1 className="cb-h1">Everything you need before sowing</h1>
            <p className="cb-body rp-lede">
              Certified seed, fertiliser, organic inputs and crop protection from licensed shops
              near you. Pick your crop and see what it takes per acre, with the pack price before
              you go. Every shop listed here holds the licence for what it sells.
            </p>
          </div>
        </div>

        {/* crop first — the question a farmer actually has */}
        {crops.length > 0 && (
          <div className="sy-chips" role="group" aria-label="Filter by crop">
            <button type="button" className={`st-chip${crop === '' ? ' active' : ''}`} onClick={() => setCrop('')}>
              All crops
            </button>
            {crops.map((c) => (
              <button
                key={c}
                type="button"
                className={`st-chip${crop === c ? ' active' : ''}`}
                onClick={() => setCrop(crop === c ? '' : c)}
                aria-pressed={crop === c}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* search */}
        <div className="sy-search">
          <SearchIcon />
          <input
            type="search"
            value={q}
            onChange={(e) => { setQ(e.target.value); setSelected(null); }}
            placeholder='Try "urea", "Bt cotton", "vermicompost", "zinc"…'
            aria-label="Search seeds and fertiliser"
          />
        </div>

        {/* category chips */}
        {categories.length > 0 && (
          <div className="sy-chips">
            <button type="button" className={`st-chip${cat === '' ? ' active' : ''}`} onClick={() => setCat('')}>
              Everything
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

        {failed && <div className="rp-detail-note">Could not load the catalogue — check your connection and refresh.</div>}
        {!items && !failed && <div className="rp-detail-note">Loading products…</div>}
        {items && results.length === 0 && (
          <div className="rp-detail-note">
            {crop
              ? `Nothing listed for ${crop} yet. Try "All crops", or a different category.`
              : 'Nothing matches that. Try a different category or search term.'}
          </div>
        )}

        {/* product cards */}
        <div className="rp-grid sy-grid">
          {results.map((p) => {
            const badge = licenceBadge(p);
            return (
              <button
                key={p.id}
                type="button"
                className={`rp-card${selected === p.id ? ' active' : ''}`}
                onClick={() => { setSelected(selected === p.id ? null : p.id); setNote(''); setAcres(''); setEnquiryError(''); }}
              >
                <div className="rp-card-top">
                  <span className="rp-emoji" aria-hidden="true">{CATEGORY_EMOJI[p.category] ?? '🌱'}</span>
                  <span className="cb-mono rp-source">{p.packSize.toUpperCase()}</span>
                </div>
                <div className="rp-name">{p.title}</div>
                <div className="sy-hindi">
                  {p.supplier.location}, {p.supplier.state}
                  {p.cropNames.length > 0 && ` · ${p.cropNames.slice(0, 3).join(', ')}`}
                </div>
                <div className="sy-tagline" style={{ fontWeight: 600, color: 'var(--cb-forest, #1f2d18)' }}>
                  {rupees(p.pricePerPack)}
                  <span style={{ fontWeight: 400, opacity: 0.7 }}> / {p.packSize}</span>
                  {/* A government-capped price is not this shop competing — it
                      is the same everywhere, and saying so stops a farmer
                      shopping around for a number nobody can move. */}
                  {p.subsidised && (
                    <span className="cb-mono" style={{ marginLeft: 8, fontSize: '0.7em', opacity: 0.7 }}>
                      GOVT PRICE
                    </span>
                  )}
                </div>
                {(p.supplier.verified || badge) && (
                  <div className="cb-mono" style={{ fontSize: '0.68rem', marginTop: 6, opacity: 0.75 }}>
                    {p.supplier.verified && '✓ VERIFIED'}
                    {p.supplier.verified && badge && ' · '}
                    {badge}
                  </div>
                )}
                <span className="rp-more">{selected === p.id ? 'hide details ↑' : 'label & shop ↓'}</span>
              </button>
            );
          })}
        </div>

        {/* detail panel for the selected product */}
        {detail && (
          <div className="sy-detail">
            <div className="sy-detail-head">
              <span className="sy-detail-emoji" aria-hidden="true">{CATEGORY_EMOJI[detail.category] ?? '🌱'}</span>
              <div>
                <h2 className="sy-detail-name">
                  {detail.title}
                  {detail.brand && <span className="sy-hindi"> · {detail.brand}</span>}
                </h2>
                <p className="sy-tagline" style={{ marginTop: 2 }}>
                  {rupees(detail.pricePerPack)} / {detail.packSize} · {detail.supplier.location}, {detail.supplier.state}
                </p>
              </div>
            </div>

            <div className="sy-detail-grid">
              {/* How much to buy is the question the price alone never answers. */}
              {detail.dosagePerAcre && (
                <div className="sy-block">
                  <span className="cb-eyebrow">How much per acre</span>
                  <p>{detail.dosagePerAcre}</p>
                </div>
              )}

              {detail.composition && (
                <div className="sy-block">
                  <span className="cb-eyebrow">Composition</span>
                  <p>{detail.composition}</p>
                </div>
              )}

              {/* Seed-only label facts. Germination is the number a farmer is
                  entitled to see on a certified tag, so it gets its own line
                  rather than being buried in specs. */}
              {(detail.germinationPct || detail.seedTreatment) && (
                <div className="sy-block">
                  <span className="cb-eyebrow">On the tag</span>
                  <p>
                    {detail.germinationPct ? `Germination ${detail.germinationPct}% minimum. ` : ''}
                    {detail.seedTreatment ? `${detail.seedTreatment}. ` : ''}
                    Check the tag on the bag matches this before you pay.
                  </p>
                </div>
              )}

              {detail.cropNames.length > 0 && (
                <div className="sy-block">
                  <span className="cb-eyebrow">Used on</span>
                  <p>{detail.cropNames.join(' · ')}</p>
                </div>
              )}

              {detail.specs.length > 0 && (
                <div className="sy-block">
                  <span className="cb-eyebrow">Details</span>
                  <p>{detail.specs.join(' · ')}</p>
                </div>
              )}

              {detail.subsidised && (
                <div className="sy-block">
                  <span className="cb-eyebrow">Government-set price</span>
                  <p>
                    This is a controlled fertiliser — the maximum price is fixed by government, so
                    it is the same at every licensed shop. Paying more than {rupees(detail.pricePerPack)}
                    {' '}per {detail.packSize} is overcharging, and you can report it to your district
                    agriculture officer.
                  </p>
                </div>
              )}

              <div className="sy-block">
                <span className="cb-eyebrow">Shop</span>
                <p>
                  <strong>{detail.supplier.name}</strong> · ★ {detail.supplier.rating.toFixed(1)}
                  {licenceBadge(detail) && (
                    <> — holds a valid licence to sell this category, checked by CropBid.</>
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
                shop numbers. */}
            {unlocked[detail.id]?.contactPhone ? (
              <div className="sy-block" style={{ marginTop: 14 }}>
                <span className="cb-eyebrow">Enquiry sent</span>
                <p>
                  The shop has your details and will call back. You can reach them directly on{' '}
                  <a href={`tel:${unlocked[detail.id]!.contactPhone}`}>
                    <strong>{unlocked[detail.id]!.contactPhone}</strong>
                  </a>
                  {unlocked[detail.id]!.contactEmail && <> · {unlocked[detail.id]!.contactEmail}</>}.
                </p>
              </div>
            ) : user ? (
              <div className="sy-block" style={{ marginTop: 14 }}>
                <span className="cb-eyebrow">Check stock &amp; get the shop&rsquo;s number</span>
                {/* Acreage is the single most useful thing the shop can know
                    before calling back — it sizes the order for them, so they
                    quote instead of asking. */}
                <label className="cb-label" style={{ display: 'block', marginTop: 8 }}>
                  How many acres? (optional)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={acres}
                  onChange={(ev) => setAcres(ev.target.value)}
                  placeholder="e.g. 3"
                  style={{ width: 140, marginTop: 4, padding: 10, borderRadius: 10, border: '1px solid var(--cb-line, #d8d4c8)', font: 'inherit' }}
                />
                <textarea
                  value={note}
                  onChange={(ev) => setNote(ev.target.value)}
                  placeholder="Anything you want to ask the shop? (optional)"
                  rows={3}
                  style={{ width: '100%', marginTop: 10, padding: 10, borderRadius: 10, border: '1px solid var(--cb-line, #d8d4c8)', font: 'inherit' }}
                />
                {enquiryError && <p className="rp-detail-note" style={{ marginTop: 8 }}>{enquiryError}</p>}
                <button
                  type="button"
                  className="cb-btn cb-btn-primary"
                  style={{ marginTop: 10 }}
                  disabled={sending}
                  onClick={() => enquire(detail)}
                >
                  {sending ? 'Sending…' : 'Enquire & get shop number'}
                  {!sending && <ArrowIcon />}
                </button>
              </div>
            ) : (
              <div className="sy-block" style={{ marginTop: 14 }}>
                <span className="cb-eyebrow">Get the shop&rsquo;s number</span>
                <p>
                  Sign in to send an enquiry — it shares your name with the shop so they can call
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
          CropBid lists what licensed shops stock and passes on your enquiry — the sale is directly
          between you and the shop, and we take no payment for inputs. Always check the tag, batch
          number and expiry on the bag, and keep the receipt: it is your only proof if a seed lot
          fails. Follow label doses on crop protection. Prices and stock change; confirm on the
          call. Never pay in advance to anyone claiming to represent CropBid.
        </p>
      </main>

      <CBFooter />
    </div>
  );
}
