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
// If you change what the app collects, change this page in the same PR. That
// rule was already here and had been broken twice: browser storage and Vercel
// Analytics were both live and undisclosed, and household orders had begun
// handing a delivery address to a seller with only the bidding case written up.
//
// The third-party list is the one most likely to rot. It is keyed to
// server/src/config/index.ts — anything there that takes an API key and sees
// user data belongs in "Who we share it with".
// =============================================================================

import { Link } from 'react-router-dom';
import { ArcMark, ArrowIcon, CBFooter } from './landing/shared';
import { SignInLink } from '../components/auth/SignInLink';

const UPDATED = '2 September 2026';
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
            <strong>Account details.</strong> Your name, phone number, and a password if you
            set one. An email address is optional for farmers and households — many farmers do
            not have one, so we do not require it — and required for business buyers, because
            that is where their application and order paperwork goes. Your password is stored
            only as a bcrypt hash; nobody at CropBid can read it. We also hold the sign-in
            tokens that keep you logged in, and, briefly, a hashed one-time code when you sign
            in by phone or reset a password.
          </p>
          <p>
            <strong>Profile details.</strong> Your role (farmer, buyer or consumer), city,
            country, preferred language and currency, a profile photo if you upload one, and a
            trust score calculated from your completed deals.
          </p>
          <p>
            <strong>If you apply to sell,</strong> we collect what the application asks for and
            what your trade requires: whether you are a farmer, a local shop or a wholesaler,
            your business or shop name and type, your address, your state, farm size and crops
            grown, an FSSAI licence number for a shop, a GSTIN, an APMC licence, an FPO name,
            organic certification details, minimum order value and lead time for a wholesaler,
            and bank details for settlement. We keep the outcome of the review and any note the
            reviewer wrote.
          </p>
          <p>
            <strong>If you apply to buy at volume,</strong> we collect your company name and
            type, country, tax identifier and annual procurement volume, and the outcome of
            that review.
          </p>
          <p>
            <strong>Trading activity.</strong> The listings you create, the photographs on
            them, bids you place or receive, counter-offers and negotiation messages, auctions
            you take part in, the limits you set for an AI negotiating agent, buyer
            requirements you post, offers you make against them, equipment enquiries, and the
            record of every completed deal.
          </p>
          <p>
            <strong>Orders and delivery.</strong> What you ordered, from whom, the amount, and
            the delivery address and contact phone number you enter at checkout. Delivery and
            payment status is tracked through the life of the order, and shipment details where
            a logistics partner is booked.
          </p>
          <p>
            <strong>Voice recordings, if you use the microphone.</strong> Dictating a listing
            sends that audio clip to our speech provider to be turned into text. The clip is
            sent for transcription and the text is what we keep on the listing; we do not build
            a voice profile, and the feature only appears when the provider is configured.
          </p>
          <p>
            <strong>Images you upload.</strong> Listing photographs and profile pictures are
            compressed and stored with our image host. Anything you photograph for a listing
            becomes publicly visible on that listing, so take care not to include documents,
            faces or anything else you did not mean to publish.
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
          <p>
            <strong>Stored in your browser, not on our servers.</strong> Your shopping basket,
            your chosen delivery city and your sign-in session are kept in your own browser's
            storage, so the basket survives a reload and you are not signed out on every visit.
            They stay on your device and clearing your browser data removes them.
          </p>
          <p>
            <strong>Usage analytics.</strong> The website uses Vercel Analytics to count page
            views and see which pages are used. It is privacy-focused and cookie-free: it does
            not set advertising cookies, does not follow you to other websites, and does not
            build a profile of you. We use it to know which parts of the site are worth
            improving. We do not run advertising trackers of any kind.
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
          <p>
            <strong>If you order for your home,</strong> the shop or farm you bought from is
            told what you ordered straight away, but <strong>your delivery address and phone
            number are withheld from them until your payment clears</strong>. Placing an order
            creates it unpaid; the seller sees your contact details only once the money is
            held, because that is the point at which a delivery has to be arranged. They go
            only to the seller you bought that order from, and browsing a shop shares nothing.
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
            We do not sell your personal data and we do not share it for anyone else's
            advertising. The full list of who else touches it:
          </p>
          <p>
            <strong>Other CropBid users</strong> — limited to what the section above describes.
          </p>
          <p>
            <strong>Razorpay</strong> (payments) — the amount, an order reference and the
            contact details their checkout asks for. Card and bank credentials are entered on
            Razorpay's own checkout and never reach us.
          </p>
          <p>
            <strong>Logistics partners</strong> — where you book delivery through the platform,
            the pickup and delivery details needed for that shipment.
          </p>
          <p>
            <strong>Meta (WhatsApp)</strong> — your phone number and a one-time code, to
            deliver your sign-in code. If we cannot reach you there we send the code by email
            instead, through our email provider.
          </p>
          <p>
            <strong>Sarvam AI</strong> (speech and translation) — the audio clip you record
            when dictating a listing, and listing or requirement text to be translated. Only if
            you use those features.
          </p>
          <p>
            <strong>Google (Gemini)</strong> — where an AI agent negotiates on your behalf, the
            listing and bid details that negotiation is about. Only if you switch an agent on.
          </p>
          <p>
            <strong>Cloudinary</strong> (image hosting) — the photographs you upload.
          </p>
          <p>
            <strong>Our infrastructure providers</strong> — Vercel (website), Render
            (application server) and Neon (database) host the platform on our behalf, and
            Vercel Analytics counts page views as described above.
          </p>
          <p>
            <strong>data.gov.in</strong> supplies the government mandi rates we display. We
            request published price data and send them nothing about you.
          </p>
          <p>
            We may also disclose information where the law requires it, or to protect the
            safety and rights of our users. If CropBid is ever acquired or merged, account data
            may transfer with the business, and we will tell you before that happens.
          </p>
        </Section>

        <Section title="Where your data is held">
          <p>
            The platform is hosted with providers who may store and process data on servers
            outside India, including in the United States and Europe. Where that happens we
            rely on the provider's contractual data-protection commitments. Payments are
            processed by Razorpay in India.
          </p>
        </Section>

        <Section title="Your rights over your data">
          <p>
            You can see and correct most of your details yourself in Settings. Beyond that, you
            can ask us to give you a copy of the personal data we hold about you, correct
            anything that is wrong or incomplete, delete your account and data as described
            below, or tell us you object to a particular use of it. You can also nominate
            someone to exercise these rights on your behalf if you are unable to.
          </p>
          <p>
            Write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will respond within 30
            days. There is no charge. If you are not satisfied with how we handle a request you
            can complain to the Data Protection Board of India.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            We keep your account data for as long as your account is open. Completed
            transaction records are retained after that where we need them for tax, accounting
            and dispute-resolution purposes — Indian tax law expects business records to be
            kept for several years, and the other party to a settled deal has an interest in
            them that outlives your account.
          </p>
          <p>
            Shorter-lived items expire on their own: a sign-in code lasts a few minutes, a
            password-reset link one hour, and a sign-in session ends when you log out or after
            a period of inactivity. Notifications and uploaded images are removed with the
            listing or account they belong to.
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

        <Section title="Contact and complaints">
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
