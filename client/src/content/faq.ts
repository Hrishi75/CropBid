// =============================================================================
// FAQ content — the answers, once
// =============================================================================
// Read by TWO consumers that must never disagree:
//   1. pages/FaqPage.tsx, which renders them as visible page content
//   2. lib/seo.ts, which emits them as FAQPage structured data
//
// They were previously only the second of those. Google's structured data
// policy requires FAQ markup to be visible on the page that carries it, so
// answers that exist only in JSON-LD earn nothing and risk a manual action.
// Sourcing both from this file is what stops that recurring: you cannot add a
// question to the markup without it appearing on the page.
//
// WRITING RULES
//   - Plain text, no markup. Answer engines lift these almost verbatim, and
//     the same string has to render inside a <p>.
//   - Every claim must be true of the code TODAY. Numbers here are load-bearing:
//     the 2% is PLATFORM_FEE_PERCENT in transaction.service, the languages are
//     the Language enum, the 500 g floor is STEP_KG in QuantityStepper, and the
//     delivery cities are RETAIL_CITIES in server/src/utils/retailCities.
//   - No promises about things we have not built. An FAQ is the page people
//     quote back at you.
// =============================================================================

import { CROPBID_CONTACT_DISPLAY } from './support';
import { GRIEVANCE_OFFICER } from './grievance';

export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqGroup {
  title: string;
  blurb: string;
  items: FaqItem[];
}

export const FAQ_GROUPS: FaqGroup[] = [
  {
    title: 'Buying for your home',
    blurb: 'Ordering a few kilos for the kitchen.',
    items: [
      {
        q: 'Which cities do you deliver to?',
        a: 'Household delivery runs in Nagpur only for now. Fresh food does not travel well across a state and a few kilos cannot be freighted economically, so we only show you shops that can actually reach you. The wholesale side of CropBid, where lots move by the tonne, works across India.',
      },
      {
        q: 'How soon will my order arrive?',
        a: 'It depends who you buy from, and every shop says which it is before you add anything. A local shop is already holding the stock near you and delivers the same day. A farm picks your order after you place it and sends it in overnight, so it reaches you the next morning. If your basket has both, it arrives as two deliveries and the cart tells you so before you pay.',
      },
      {
        q: 'What is the smallest amount I can buy?',
        a: 'Half a kilo. Everything on the shop side is priced and sold by the kilogram, and the quantity picker moves in 500 g steps, so you can buy 500 g of chillies without taking on a sack. There is no minimum order: delivery is free on ₹200 or more from a shop, and ₹30 for that shop\u2019s order below ₹200, plus a ₹10 handling fee on each shop\u2019s order. The quintal and tonne prices you may see elsewhere on CropBid are the wholesale market, which is a different part of the site.',
      },
      {
        q: 'Why does the same vegetable cost different amounts at different shops?',
        a: 'Because each shop sets its own price on its own stock, exactly as it does on the street. CropBid does not average those into a single price for a product, and you browse by shop rather than by item so you can see the difference and choose. What a shop paid, how fresh the stock is and what it costs them to hold it all show up in that number.',
      },
      {
        q: 'Can I cancel an order?',
        a: 'Yes, yourself, until the shop marks it as on the way. Open the order on the website or in the app and cancel it there. It calls off everything you bought from that shop in that order, because it comes as one delivery, and anything you have paid comes back to you, including the delivery and handling charges. We return it by bank transfer, so allow a few working days for it to reach you. After the shop has sent it you cannot cancel: the produce has been picked for you. A shop can also cancel before it sends an order if it cannot fulfil it, and has to tell you why.',
      },
      {
        q: 'When do I pay, and what if the order never turns up?',
        a: 'You pay after placing the order, and CropBid holds the money rather than passing it straight on. The seller only becomes due their share once you confirm the delivery arrived. If it never arrives, do not confirm it: the money stays held, and you can report the problem to us.',
      },
    ],
  },
  {
    title: 'Selling on CropBid',
    blurb: 'Farmers, local shops and wholesalers.',
    items: [
      {
        q: 'How do farmers sell crops on CropBid?',
        a: 'Sellers apply first: farmers, local shops and wholesalers submit an application with their location, PAN and the licence numbers their trade needs, and CropBid reviews it before the account can trade. A UPI id or bank account can be added then or later, and is needed before we can pay you. Once approved, a seller lists the crop with quantity, quality grade and an asking price. Buyers place bids; the farmer accepts, rejects or counters. The listing can also be run as a live timed auction. Live government mandi rates sit alongside every listing so both sides negotiate against the same reference price.',
      },
      {
        q: 'Can I sell to households as well as to bulk buyers?',
        a: 'Not directly. Bids and auctions on a lot are for businesses. Households buy through CropBid: they see the local shops in their area, or order farm produce for the next morning, which CropBid delivers to their door. A farm or wholesaler never deals with a household itself. If you add a price per kilo to your lot, CropBid can offer it to households and handles the order and the delivery; you see only the buyer\u2019s name. Household delivery is in Nagpur only for now.',
      },
      {
        q: 'How long does seller approval take?',
        a: 'Applications are reviewed by a person, usually within 24 to 48 hours. Until an application is approved the account can sign in and look around but cannot list stock or trade. If something is missing we send the application back with a note saying what is needed rather than rejecting it.',
      },
    ],
  },
  {
    title: 'Money and pricing',
    blurb: 'Fees, escrow and where the rates come from.',
    items: [
      {
        q: 'How does payment work on CropBid?',
        a: 'Once a price is agreed the buyer pays through Razorpay and the money is held by CropBid rather than passed straight on. CropBid books the delivery. On a bid or an auction for a listed lot, who pays for it (the seller, half each, or the buyer) is agreed with the deal before the seller accepts; on other deals the seller pays. If the buyer pays some of it, we quote the delivery first and the buyer pays it together with the goods in one payment. The crop then ships. When the buyer confirms delivery the deal is marked settled and the seller is due the deal amount less our 2% fee and less any share of delivery they agreed to pay. The 2% is never charged on delivery. That transfer is made by us separately and is not instant, so allow several working days for it to reach the seller\u2019s bank. Until a buyer confirms, nothing is owed to anyone: the buyer is protected against non-delivery and the seller against non-payment.',
      },
      {
        q: 'Does it cost anything to join CropBid?',
        a: 'Creating an account, listing crops and checking mandi rates are free; CropBid charges a flat 2% only when a deal settles. Delivery on a wholesale deal is charged separately, and who pays it is agreed with the deal. Fresh produce bought from a farm is delivered to your door the next morning. You sign up with your name, a mobile number, an email address if you have one, and a password, and sign in with the number or the email, or on the website, continue with your Google account instead. CropBid is available in English, Hindi and Marathi.',
      },
      {
        q: 'What are live mandi rates and where do they come from?',
        a: 'Mandi rates are the daily wholesale prices set at India’s regulated APMC markets. CropBid pulls them from government data covering more than 4,600 mandis and shows them free, so a farmer can see what a crop is actually fetching nearby before agreeing to any price. They are a reference price, not what you pay at a shop: a retail price includes handling, delivery and the shop’s own margin on top.',
      },
      {
        q: 'Who buys on CropBid?',
        a: 'Businesses of every size buy by the lot: restaurants and cafés, small food businesses, wholesalers, food processors, FMCG companies, exporters and retailers. Business buyers apply and are reviewed the same way sellers are. Households in Nagpur also buy through CropBid, by the kilo from local shops or farm produce delivered the next morning.',
      },
    ],
  },
  {
    title: 'Your account',
    blurb: 'Signing in, languages and your data.',
    items: [
      {
        q: 'I did not get my sign-in code. What now?',
        a: 'Codes go to WhatsApp first and fall back to email if we cannot reach your number there. A code lasts a few minutes, and you can ask for another after a short wait. If neither arrives, check that the number on your account is the one you are typing, and write to info@cropbid.in if it still does not come through.',
      },
      {
        q: 'Can I sign in with Google?',
        a: 'Yes, on the website: choose Continue with Google in the sign-in window, and you are signed in, or a new account is made for you, with no password to remember. If your Google email already belongs to a CropBid account, the first time you use Google it opens that account, and the password set on it before then stops working, because we cannot tell who set it. You can choose a new one with Forgot password, and a password you set after that keeps working. An account already linked to a different Google account cannot be opened this way: sign in with its password if it has one, or write to info@cropbid.in. Every account needs a mobile number and Google does not share yours, so we ask for one the first time, before you carry on. A suspended account cannot be signed in to at all; write to info@cropbid.in. The phone app does not offer Google sign-in yet.',
      },
      {
        q: 'Do I need an email address?',
        a: 'No. You can sign up with a phone number instead, because many farmers do not have an email address. Without an email we cannot send you a password-reset link, so if you forget your password, sign in with a code sent to your phone instead.',
      },
      {
        q: 'How do I delete my account and what happens to my data?',
        a: 'You can delete your account from Settings. If you have no settled trades, the account and its data are deleted outright. If you do have settled trades we cannot erase a completed transaction the other party is equally entitled to, so we anonymise instead: your name, phone number, location, photo and bank details are removed, your login is permanently disabled, and the transaction survives with no personal details attached. The privacy policy sets this out in full. You cannot delete the account while a deal is unpaid or still has money held, while there are credits in your wallet, or while a supply contract is proposed or running: settle, end or write to us about those first.',
      },
    ],
  },
  {
    title: 'About CropBid',
    blurb: 'Who we are and how to reach us.',
    items: [
      {
        // Mirrors /terms §1 and /privacy. Rewrite this answer the day the
        // certificate arrives, when TermsPage's OPERATOR is filled in.
        q: 'Who runs CropBid?',
        a: 'CropBid is based in India and operates only in India. The business is in the process of being incorporated, and until that completes it is run by its founder, who stands behind every commitment on this site. We will name the registered company and its address on our Terms and Privacy pages as soon as incorporation is done.',
      },
      {
        // CLAUDE.md §2d: names only, CropBid is the point of contact.
        q: 'Can I call the farmer or buyer directly?',
        a: `No. The two sides of a deal see each other’s name and nothing else: no phone number, email or address, before or after payment. CropBid books the delivery and is the point of contact for both sides, so if you need to reach the other side about a deal, call or WhatsApp us on ${CROPBID_CONTACT_DISPLAY}, or write to info@cropbid.in, and we will take it from there. Messages and listings that include a phone number, email or chat link are refused for the same reason.`,
      },
      {
        // Same details and time limits as /privacy and /terms §15 (grievance.ts).
        q: 'How do I make a complaint?',
        a: `Write to info@cropbid.in first: most problems with an order or a deal are sorted out there. If you are not satisfied, or your complaint is about how we handle your personal data, contact our Grievance Officer, ${GRIEVANCE_OFFICER.name}, at ${GRIEVANCE_OFFICER.email} or ${GRIEVANCE_OFFICER.phoneDisplay}. We acknowledge a complaint within ${GRIEVANCE_OFFICER.acknowledgeWithin} and resolve it within ${GRIEVANCE_OFFICER.resolveWithin}.`,
      },
    ],
  },
];

/** Flattened, in page order — what the FAQPage structured data is built from. */
export const FAQ_ITEMS: FaqItem[] = FAQ_GROUPS.flatMap((g) => g.items);
