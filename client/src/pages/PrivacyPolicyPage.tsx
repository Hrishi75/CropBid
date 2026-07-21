// =============================================================================
// Privacy Policy — /privacy
// =============================================================================
// Public page, no login needed. Google Play's Data Safety declaration requires
// a publicly reachable privacy policy URL, and this is it — so the contents
// have to match what the code actually does, not generic boilerplate. Every
// claim below is traceable: the field lists come from prisma/schema.prisma, the
// deletion behaviour from authService.deleteAccount, and the "what the other
// side sees" section from the farmer-PII fixes in #72/#73/#74.
//
// If you change what the app collects, change this page in the same PR.
// =============================================================================

import { Link } from 'react-router-dom';
import { ArcMark, ArrowIcon, CBFooter } from './landing/shared';

const UPDATED = '20 July 2026';
const CONTACT = 'info@cropbid.in';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 36 }}>
      <h2 className="cb-h2" style={{ marginBottom: 12 }}>{title}</h2>
      <div className="cb-body" style={{ maxWidth: '72ch', display: 'grid', gap: 12 }}>
        {children}
      </div>
    </section>
  );
}

export function PrivacyPolicyPage() {
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
          <Link to="/how-it-works">How it works</Link>
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
              Privacy
            </span>
            <h1 className="cb-h1">Privacy Policy</h1>
            <p className="cb-body rp-lede">
              What CropBid collects, why we need it, who else can see it, and how to get it
              deleted. Last updated {UPDATED}.
            </p>
          </div>
        </div>

        <Section title="Who we are">
          <p>
            CropBid is an agricultural marketplace that connects farmers directly with buyers.
            This policy covers the CropBid website and the CropBid Android app.
          </p>
        </Section>

        <Section title="What we collect">
          <p>
            <strong>Account details.</strong> Your name, phone number, and password. An email
            address is optional — many farmers do not have one, so we do not require it. Your
            password is stored only as a bcrypt hash; nobody at CropBid can read it.
          </p>
          <p>
            <strong>Profile details.</strong> Your role (farmer, buyer or consumer), location,
            country, preferred language and currency, and a profile photo if you upload one.
            Buyers may add company details such as company name and GST number. Farmers may add
            an FPO name, APMC licence, and bank details for settlement.
          </p>
          <p>
            <strong>Trading activity.</strong> Crop listings you create including photographs,
            bids you place or receive, negotiations, orders, and delivery addresses.
          </p>
          <p>
            <strong>Payment information.</strong> Payments are processed by Razorpay. Card and
            bank credentials are entered on Razorpay's checkout and never reach CropBid's
            servers — we store only the Razorpay order and payment reference for the
            transaction.
          </p>
          <p>
            <strong>Technical data.</strong> Standard server logs, and an internal audit log of
            significant account actions (for example account deletion) used for security and
            dispute resolution.
          </p>
        </Section>

        <Section title="What the other side of a trade can see">
          <p>
            When you list a crop or place a bid, the counterparty sees what they need to trade
            with you and no more: your name, your general location, and your listing or bid
            details.
          </p>
          <p>
            <strong>A farmer's phone number and email are never shown to buyers browsing
            listings, bidding, or negotiating.</strong> Contact details are exchanged only once
            an order is confirmed between the two of you, because at that point a delivery has
            to be arranged.
          </p>
        </Section>

        <Section title="Why we collect it">
          <p>
            To create and secure your account, to show your listings to the right buyers, to
            run bidding and negotiation, to process payments and arrange delivery, to send you
            notifications about your trades, and to detect and prevent abuse of the platform.
          </p>
          <p>
            We do not sell your personal data, and we do not use it for advertising.
          </p>
        </Section>

        <Section title="Who we share it with">
          <p>
            <strong>Other CropBid users</strong>, limited as described above.{' '}
            <strong>Razorpay</strong>, our payment processor, to take payment.{' '}
            <strong>Logistics partners</strong>, where you choose to book delivery through the
            platform — they receive the pickup and delivery details needed for that shipment.{' '}
            <strong>Our infrastructure providers</strong>, who host the application, database
            and uploaded images on our behalf.
          </p>
          <p>
            We may also disclose information where the law requires it, or to protect the
            safety and rights of our users.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            We keep your account data for as long as your account is open. Completed
            transaction records are retained after that where we need them for tax, accounting
            and dispute-resolution purposes.
          </p>
        </Section>

        <Section title="Deleting your account">
          <p>
            You can delete your account from Settings. If you have no settled trades, your
            account and its data are deleted outright.
          </p>
          <p>
            If you do have settled trades, we cannot erase the record of a completed
            transaction the other party is also entitled to. In that case we anonymise your
            account instead: your name, phone number, location, profile photo and bank details
            are removed, your login is permanently disabled, and the transaction survives with
            no personal details attached. Uploaded images that are no longer referenced are
            deleted.
          </p>
          <p>
            You can also ask us to access or correct your data by writing to{' '}
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
        </Section>

        <Section title="How we protect it">
          <p>
            Passwords are hashed with bcrypt. Password-reset links are stored only as a hash,
            expire after one hour, and can be used once. Sessions use short-lived access tokens
            with refresh tokens that are invalidated on logout. All traffic is served over
            HTTPS. Repeated failed sign-in attempts are rate limited per account.
          </p>
          <p>
            No system is perfectly secure, but if we ever discover a breach affecting your
            personal data we will tell you.
          </p>
        </Section>

        <Section title="Children">
          <p>
            CropBid is not intended for anyone under 18, and we do not knowingly collect data
            from children.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If we change what we collect or how we use it, we will update this page and change
            the date at the top. Significant changes will also be notified in the app.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy, or about your data, go to{' '}
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
        </Section>

        <p className="cb-small rp-foot" style={{ marginTop: 40 }}>
          This policy describes how CropBid handles personal data. It does not limit any rights
          you have under applicable law, including India's Digital Personal Data Protection
          Act, 2023.
        </p>
      </main>

      <CBFooter />
    </div>
  );
}
