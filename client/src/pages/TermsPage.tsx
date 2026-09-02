// =============================================================================
// Terms and Conditions — /terms
// =============================================================================
// Public page, no login needed. Razorpay's merchant onboarding expects a live
// site to publish terms alongside the privacy, refund, shipping and contact
// policies, and the sign-in modal has been saying "you agree to our…" with
// nothing on the other end of that sentence.
//
// SAME RULE AS THE PRIVACY POLICY: every clause here describes what the code
// actually does. Where a clause would be a promise the system cannot keep
// today it says so plainly instead — see "Getting paid", which describes
// settlement as manual because releaseFunds only moves a database column and
// paying a seller's bank needs Razorpay Route, which is not built.
//
// COMMERCIAL DECISIONS, NOT CODE, lifted to constants so they can be corrected
// in one edit:
//   OPERATOR   — the registered entity. Incorporation is in progress, so this
//                stays empty and section 1 says so outright. Naming a company
//                that does not exist yet is worse than saying "being
//                incorporated": one is a false statement about who the
//                customer's contract is with, the other is a true one.
//                FILL THIS IN THE DAY THE CERTIFICATE ARRIVES, and add the
//                registered address to section 18.
//   JURISDICTION — courts named in the governing-law clause. CropBid is based
//                in India and operates only in India.
//   CANCEL_WINDOW — how long a household order can be cancelled for.
// =============================================================================

import { Link } from 'react-router-dom';
import { ArcMark, ArrowIcon, CBFooter } from './landing/shared';
import { SignInLink } from '../components/auth/SignInLink';

const UPDATED = '2 September 2026';
const CONTACT = 'info@cropbid.in';

/** Registered entity. Empty until incorporation completes — see the header note. */
const OPERATOR = '';
const OPERATOR_NAME = OPERATOR || 'CropBid';
/** Drops the "being incorporated" wording the moment OPERATOR is filled in. */
const INCORPORATED = OPERATOR !== '';
const JURISDICTION = 'Pune, Maharashtra';
const CANCEL_WINDOW = '30 minutes';

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

export function TermsPage() {
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
              Terms
            </span>
            <h1 className="cb-h1">Terms and Conditions</h1>
            <p className="cb-body rp-lede">
              The agreement between you and {OPERATOR_NAME} when you use this platform to
              buy or sell. Last updated {UPDATED}.
            </p>
          </div>
        </div>

        <Section title="1. Who these terms are with">
          <p>
            {OPERATOR_NAME} operates this website and the CropBid Android app (together, the
            "platform"). Using the platform, creating an account, listing produce, bidding or
            placing an order means you accept these terms. If you do not accept them, do not
            use the platform.
          </p>
          {!INCORPORATED && (
            <p>
              <strong>CropBid is based in India and operates only in India.</strong> The
              business is currently in the process of being incorporated. Until that completes,
              the platform is run by its founder, who stands behind the commitments in these
              terms. We will name the registered company and its address on this page as soon
              as incorporation is done, and these terms will continue to apply to it.
            </p>
          )}
          <p>
            These terms sit alongside our{' '}
            <Link to="/privacy">Privacy Policy</Link>, which explains what we do with your
            personal data and forms part of this agreement.
          </p>
        </Section>

        <Section title="2. Who can use CropBid">
          <p>
            You must be at least 18 and able to enter a contract under Indian law. You must
            give accurate details and keep them current — your phone number is your account,
            and a wrong one locks you out of your own sign-in.
          </p>
          <p>
            <strong>Selling is by application.</strong> Farmers, local shops and wholesalers
            submit an application and cannot list produce or trade until we approve it. We may
            ask for more information, and we may decline an application. Approval is a check
            that an applicant is who they say they are; it is not an endorsement of their
            produce, and it is not a guarantee about them.
          </p>
          <p>
            Buying at volume is also by application. Buying as a household is not: anyone with
            a phone number can order for their home.
          </p>
          <p>
            You are responsible for what happens under your account. Tell us at{' '}
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a> if you think someone else is using it.
          </p>
        </Section>

        <Section title="3. What CropBid is, and what it is not">
          <p>
            CropBid is a venue where sellers and buyers find each other and agree a price. The
            contract of sale is between the two of you. We are not the seller, not the buyer,
            and not a party to your trade.
          </p>
          <p>
            That means the seller — not CropBid — is responsible for the produce being what
            the listing says it is: the crop, the variety, the quality grade, the weight, and
            its condition when it is handed over. We publish government mandi rates alongside
            listings as a reference price. They are published data, not our valuation of
            anyone's produce, and not a promise about what anything is worth.
          </p>
        </Section>

        <Section title="4. Listing and selling">
          <p>
            When you list, you confirm that you have the right to sell the produce, that it is
            described accurately, and that you can actually supply the quantity you list. You
            set your own price. You may open a listing to bids, run it as a timed auction, put
            a retail price on it for households, or let an AI agent negotiate inside limits you
            set — the limits are yours and the resulting deal is yours.
          </p>
          <p>
            Accepting a bid sells the whole listing to that buyer. A household buying direct
            takes only what they ordered, and the rest stays on sale until the stock runs out.
          </p>
          <p>
            You must comply with the law that applies to you, including food safety rules and
            any licence your trade requires. Local shops must hold a valid FSSAI licence.
          </p>
        </Section>

        <Section title="5. Buying">
          <p>
            A bid is an offer you are bound to if the seller accepts it. A household order is
            a purchase at the price shown, and is confirmed as soon as you place it.
          </p>
          <p>
            Check what you are buying before you commit: quantity, grade, price, and where it
            ships from. Retail prices include the seller's own margin and handling and are not
            the same as the wholesale mandi rate shown elsewhere on the platform.
          </p>
        </Section>

        <Section title="6. Prices, weights and fees">
          <p>
            Sellers set prices. Household prices are quoted per kilogram and orders are placed
            in kilograms, from 500&nbsp;g upward. Wholesale lots are quoted in the seller's own
            unit — kilogram, quintal or tonne.
          </p>
          <p>
            <strong>CropBid charges a flat 2% of the value of a settled deal.</strong> Creating
            an account, listing produce and viewing mandi rates are free. The fee is taken from
            the amount held for a deal when it settles, so the seller receives the deal value
            less 2%. Where you book delivery through a logistics partner on the platform, that
            partner's charge is shown before you book and is separate from this fee.
          </p>
          <p>
            Weights are as declared by the seller. Fresh produce loses a little weight in
            transit, and small differences between the weight ordered and the weight delivered
            are normal.
          </p>
        </Section>

        <Section title="7. Payment and escrow">
          <p>
            Payments are taken by <strong>Razorpay</strong>. Card and bank details are entered
            on Razorpay's checkout and never reach CropBid's servers.
          </p>
          <p>
            Money you pay for a deal is <strong>held</strong>, not passed straight to the
            seller. It is held until delivery is confirmed. Your payment moves through four
            states, and you can see which one your order is in at any time: awaiting payment,
            held in escrow, released to the seller, or refunded.
          </p>
          <p>
            <strong>How settlement actually happens today.</strong> Marking a deal released or
            refunded records the decision on the platform; the corresponding transfer to a
            seller's bank account or back to a buyer's card is made by us separately, by hand,
            and is not instantaneous. Allow several working days. We would rather say this than
            imply a transfer happens the moment a status changes.
          </p>
        </Section>

        <Section title="8. Delivery">
          <p>
            Household delivery runs in Pune and Nagpur. Every seller shows which of two
            delivery promises applies before you add anything to your basket:
          </p>
          <p>
            <strong>Local shops</strong> already hold the stock near you and deliver the same
            day. <strong>Farms</strong> pick your order after you place it and send it in
            overnight, for delivery the next morning. A basket containing both arrives as two
            separate deliveries, and the basket says so before you pay.
          </p>
          <p>
            These are the seller's commitments, and delivery is arranged between you and them
            or through a logistics partner. Weather, transport and market conditions can delay
            fresh produce. If an order is going to be late, contact the seller first; if that
            does not resolve it, write to us.
          </p>
          <p>
            Wholesale lots are shipped by arrangement between the seller and buyer, or through
            a logistics partner booked on the platform, and are not covered by the two delivery
            promises above.
          </p>
        </Section>

        <Section title="9. Cancellations and refunds">
          <p>
            <strong>Household orders.</strong> You can cancel within {CANCEL_WINDOW} of placing
            an order, provided the seller has not already dispatched it. After that, a fresh
            order has usually been picked or packed for you and cannot be cancelled.
          </p>
          <p>
            <strong>If it does not arrive, or arrives wrong.</strong> Do not confirm the
            delivery. Money is only released to a seller after you confirm receipt, so an order
            you never confirm stays held. Report the problem to us within 48 hours of the
            delivery date with photographs where the produce is damaged, short or not what was
            described, and we will look at both sides and decide.
          </p>
          <p>
            <strong>Where we decide in your favour</strong>, the held amount is returned to the
            payment method you used. See section 7 on timing: we make that transfer separately
            and it is not instant.
          </p>
          <p>
            <strong>Wholesale deals.</strong> A bid you have made cannot be withdrawn once the
            seller accepts it. Disputes on accepted lots are handled case by case, and we may
            hold funds while we look into it.
          </p>
          <p>
            Fresh produce is perishable. We cannot offer refunds for a change of mind after
            delivery, or where produce has deteriorated because it was not stored properly
            after it reached you.
          </p>
        </Section>

        <Section title="10. Things you must not do">
          <p>
            Do not list produce you cannot supply or do not have the right to sell. Do not
            misdescribe quality, grade, weight or origin. Do not bid without intending to buy,
            or bid to inflate a price. Do not use another person's account or impersonate
            anyone. Do not attempt to take a trade off the platform to avoid the fee after
            using it to find the other side. Do not scrape, overload, probe or interfere with
            the platform, and do not upload anything unlawful or anyone else's copyrighted
            material.
          </p>
        </Section>

        <Section title="11. What you upload">
          <p>
            You keep ownership of the photographs and descriptions you upload. You give us
            permission to host, resize and display them on the platform so your listing can be
            shown to buyers, and to show them in the record of a completed trade. You confirm
            you have the right to give that permission.
          </p>
          <p>
            We may remove content that breaks these terms or the law.
          </p>
        </Section>

        <Section title="12. Suspension and closing accounts">
          <p>
            We may suspend or close an account that breaks these terms, that we reasonably
            believe is being used fraudulently, or where we are required to by law. A suspended
            account cannot trade. Where it is fair to do so we will tell you why and give you a
            chance to put it right.
          </p>
          <p>
            You can close your own account at any time. Obligations from deals you have already
            struck survive it, and section 8 of the{' '}
            <Link to="/privacy">Privacy Policy</Link> explains what happens to your data.
          </p>
        </Section>

        <Section title="13. Availability">
          <p>
            We work to keep the platform running but do not promise it will be available
            without interruption. Features change, and some depend on outside services —
            government rate data, payments, messaging — that can be unavailable for reasons
            outside our control. Mandi rates are published government figures reproduced as
            they are given to us; where the feed is unavailable the platform shows reference
            prices instead and labels them as such.
          </p>
        </Section>

        <Section title="14. Our responsibility to you">
          <p>
            Because the sale is between the buyer and the seller, we are not responsible for
            the quality, safety, legality or delivery of anyone's produce, or for a user's
            failure to do what they agreed. Our responsibility is to run the platform honestly
            and with reasonable care.
          </p>
          <p>
            Where we are liable to you, our liability for any deal is limited to the fee we
            charged on it, except where the law does not allow that limit — nothing here
            excludes liability for fraud, for death or personal injury caused by negligence, or
            for anything else that cannot lawfully be excluded. Nothing in these terms affects
            the rights you have as a consumer under Indian law.
          </p>
        </Section>

        <Section title="15. Complaints">
          <p>
            Write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a> with your order or listing
            reference and what went wrong. We aim to acknowledge within two working days. If a
            complaint concerns your personal data, the Privacy Policy names who to contact.
          </p>
        </Section>

        <Section title="16. Governing law">
          <p>
            CropBid operates only in India. These terms are governed by the laws of India, and
            the courts at {JURISDICTION} have exclusive jurisdiction over any dispute arising
            from them.
          </p>
        </Section>

        <Section title="17. Changes to these terms">
          <p>
            We may update these terms as the platform changes. The date at the top of this page
            always says when. Where a change materially affects you we will tell you in the app
            or by message. Continuing to use the platform after a change means you accept it.
          </p>
        </Section>

        <Section title="18. Contact">
          <p>
            {OPERATOR_NAME}, {JURISDICTION}, India —{' '}
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Questions about how the platform works
            are answered on the <Link to="/faq">FAQ</Link>.
          </p>
        </Section>
      </main>

      <CBFooter />
    </div>
  );
}
