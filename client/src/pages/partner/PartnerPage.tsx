// =============================================================================
// PartnerPage — the public "Become a partner" door
// =============================================================================
// Consumers never see this: their door is the storefront and a phone number.
// Sellers and business buyers come HERE, pick what they are, and the sign-in
// window opens over the page asking only for their number — the subtype they
// picked is parked for the application form (OnboardingPage), which opens
// pre-tuned to it. The account then waits at /partner/status until an admin
// approves it.
//
// The page is deliberately a pitch, not a form: the form asks for licences
// and GSTINs, so the person needs to know why it's worth it before we ask.
// =============================================================================

import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArcMark, ArrowIcon } from '../../components/ui/Brand';
import { useAuthModal } from '../../context/AuthModalContext';
import { SignInLink } from '../../components/auth/SignInLink';
import { rememberPartnerType } from '../auth/SignupPage';

interface PathCard {
  role: 'FARMER' | 'BUYER';
  type: string;
  title: string;
  desc: string;
  points: string[];
}

// One card per subtype. `type` rides the querystring into signup and
// onboarding, so it must match SellerType / CompanyType enum values exactly.
const SELLER_PATHS: PathCard[] = [
  {
    role: 'FARMER', type: 'FARMER',
    title: 'Farmer',
    desc: 'Sell your harvest to businesses and homes at your price.',
    points: ['List crops, take bids or fixed-price orders', 'Second-day delivery tier — you quote lowest, win volume', 'Payments held in escrow, released on delivery'],
  },
  {
    role: 'FARMER', type: 'LOCAL_SHOP',
    title: 'Local shop',
    desc: 'Your shop, on phones across your neighbourhood.',
    points: ['Your stock and your rates, visible to nearby buyers', 'Same-day tier — closest shop wins the urgent order', 'Keep the trust you built; we bring the footfall'],
  },
  {
    role: 'FARMER', type: 'WHOLESALER',
    title: 'Wholesaler',
    desc: 'Bulk orders from restaurants and shops, without the phone rounds.',
    points: ['Set minimum order and lead time once', 'Bulk tier — priced to win the big baskets', 'GST invoices generated per order'],
  },
];

const BUYER_PATHS: PathCard[] = [
  {
    role: 'BUYER', type: 'RESTAURANT',
    title: 'Restaurant / café',
    desc: 'Daily produce for your kitchens at wholesale rates.',
    points: ['Post what you need; sellers come to you', 'One order across outlets, one invoice', 'Quality grades checked before dispatch'],
  },
  {
    role: 'BUYER', type: 'SMALL_BUSINESS',
    title: 'Small business',
    desc: 'Tiffin service, sweet shop, caterer — buy like the big chains.',
    points: ['No minimum-volume gatekeeping', 'Recurring baskets in two taps', 'Prices from farmers, shops and wholesalers side by side'],
  },
  {
    role: 'BUYER', type: 'WHOLESALER',
    title: 'Wholesaler',
    desc: 'Source lots straight from farmers, at the farm gate price.',
    points: ['Bid on graded lots before they hit the mandi', 'Escrow protects every deal', 'Logistics quoted alongside the lot'],
  },
];

function PathGrid({
  eyebrow, heading, paths, anchorId, onApply,
}: {
  eyebrow: string;
  heading: React.ReactNode;
  paths: PathCard[];
  anchorId?: string;
  onApply: (p: PathCard) => void;
}) {
  return (
    <section id={anchorId} style={{ marginTop: 56, scrollMarginTop: 24 }}>
      <div className="cb-eyebrow">{eyebrow}</div>
      <h2 className="cb-h2" style={{ marginTop: 12, marginBottom: 24 }}>{heading}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {paths.map((p) => (
          <div key={p.type + p.role} className="cb-card" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 24 }}>
            <div style={{ fontSize: 19, fontWeight: 500, letterSpacing: '-0.01em' }}>{p.title}</div>
            <p className="cb-small" style={{ margin: 0 }}>{p.desc}</p>
            <ul className="cb-small" style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              {p.points.map((pt) => (
                <li key={pt} style={{ display: 'flex', gap: 8 }}>
                  <span style={{ color: 'var(--cb-sage)' }}>—</span>
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
            {/* Opens the sign-in window over this page rather than walking
                somebody to a separate signup screen: they picked what they
                are right here, and the number is all we still need. */}
            <button
              type="button"
              className="cb-btn cb-btn-primary"
              style={{ justifyContent: 'center', marginTop: 6, width: '100%' }}
              onClick={() => onApply(p)}
            >
              Apply as {p.title.toLowerCase()}
              <ArrowIcon />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

const STEPS: { n: string; title: string; body: string }[] = [
  { n: '01', title: 'Apply', body: 'Create an account and fill the application — who you are, what you sell or buy, your licences. Ten minutes.' },
  { n: '02', title: 'We review', body: 'Our team checks the application, usually within 24–48 hours. If anything is missing we ask — you don\'t start over.' },
  { n: '03', title: 'Go live', body: 'Approved partners get the full dashboard: listings, orders, bids, analytics. You\'re trading the same day.' },
];

export function PartnerPage() {
  const { openAuth } = useAuthModal();
  const { hash } = useLocation();

  // #sell / #buy are linked from the footer and from the sign-in window's
  // side panel. The browser's own anchor jump fires against the PRERENDERED
  // markup and is then undone when React hydrates and rebuilds the DOM, so
  // the scroll has to be redone here — otherwise every one of those links
  // silently dumps people at the top of the page.
  useEffect(() => {
    if (!hash) return;
    const target = document.getElementById(hash.slice(1));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);

  // Park the subtype for the application form, then ask for the number. The
  // account this creates is a seller/buyer rather than a shopper, which is
  // what intendedRole carries.
  function onApply(p: PathCard) {
    rememberPartnerType(p.role, p.type);
    openAuth({
      intendedRole: p.role,
      title: <>Applying as<br /><span className="cb-italic">{p.title.toLowerCase()}.</span></>,
    });
  }

  return (
    <div className="cb-app" style={{ minHeight: '100vh' }}>
      <header className="cb-auth-nav">
        <Link to="/" className="wordmark">
          <ArcMark size={22} />
          <span className="wordmark-text">CropBid</span>
        </Link>
        <nav className="cb-auth-nav-links">
          <Link to="/">Marketplace</Link>
          <SignInLink />
        </nav>
      </header>

      <main style={{ maxWidth: 1020, margin: '0 auto', padding: '48px 24px 80px' }}>
        {/* Hero */}
        <div style={{ maxWidth: 680 }}>
          <div className="cb-eyebrow">Partner with CropBid</div>
          <h1 className="cb-page-title" style={{ marginTop: 14 }}>
            Your trade, minus<br />
            <span className="cb-italic">the middlemen.</span>
          </h1>
          <p className="cb-body" style={{ marginTop: 18, maxWidth: 560 }}>
            One marketplace connecting the people who grow food, the shops that
            stock it, and the kitchens that cook it. Apply once — approved
            partners trade directly, at their own price.
          </p>
        </div>

        {/* How it works */}
        <div className="cb-card" style={{ marginTop: 40, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {STEPS.map((s, i) => (
            <div key={s.n} style={{ padding: '22px 24px', borderLeft: i > 0 ? '1px solid var(--cb-line)' : 'none' }}>
              <div className="cb-mono cb-tiny" style={{ color: 'var(--cb-ember)' }}>{s.n}</div>
              <div style={{ fontWeight: 500, marginTop: 6 }}>{s.title}</div>
              <p className="cb-small" style={{ marginTop: 6, marginBottom: 0 }}>{s.body}</p>
            </div>
          ))}
        </div>

        <PathGrid
          eyebrow="Sell on CropBid"
          heading={<>I have something <span className="cb-italic">to sell.</span></>}
          paths={SELLER_PATHS}
          anchorId="sell"
          onApply={onApply}
        />

        {/* #buy is linked from the sign-in window's "business account" door. */}
        <PathGrid
          eyebrow="Buy for your business"
          heading={<>I'm buying <span className="cb-italic">for my business.</span></>}
          paths={BUYER_PATHS}
          anchorId="buy"
          onApply={onApply}
        />

        {/* Consumer redirect — wrong door, point them home */}
        <div className="cb-card cb-card-flat" style={{ marginTop: 56, padding: 24, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 500 }}>Just shopping for your home?</div>
            <p className="cb-small" style={{ margin: '4px 0 0' }}>No application needed — browse the shelf and order in minutes.</p>
          </div>
          <Link to="/" className="cb-btn cb-btn-ghost">Go to the shop <ArrowIcon /></Link>
        </div>
      </main>
    </div>
  );
}
