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
//     delivery cities are RETAIL_CITIES in prisma/seed.
//   - No promises about things we have not built. An FAQ is the page people
//     quote back at you.
// =============================================================================

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
        a: 'Household delivery runs in Pune and Nagpur today. Fresh food does not travel well across a state and a few kilos cannot be freighted economically, so we only show you shops that can actually reach you. The wholesale side of CropBid, where lots move by the tonne, works across India.',
      },
      {
        q: 'How soon will my order arrive?',
        a: 'It depends who you buy from, and every shop says which it is before you add anything. A local shop is already holding the stock near you and delivers the same day. A farm picks your order after you place it and sends it in overnight, so it reaches you the next morning. If your basket has both, it arrives as two deliveries and the cart tells you so before you pay.',
      },
      {
        q: 'What is the smallest amount I can buy?',
        a: 'Half a kilo. Everything on the shop side is priced and sold by the kilogram, and the quantity picker moves in 500 g steps, so you can buy 500 g of chillies without taking on a sack. The quintal and tonne prices you may see elsewhere on CropBid are the wholesale market, which is a different part of the site.',
      },
      {
        q: 'Why does the same vegetable cost different amounts at different shops?',
        a: 'Because each shop sets its own price on its own stock, exactly as it does on the street. CropBid does not average those into a single price for a product, and you browse by shop rather than by item so you can see the difference and choose. What a shop paid, how fresh the stock is and what it costs them to hold it all show up in that number.',
      },
      {
        q: 'When do I pay, and what if the order never turns up?',
        a: 'You pay after placing the order, and CropBid holds the money rather than passing it straight on. It is released to the seller only once you confirm the delivery arrived. If it does not arrive, the money has not left escrow.',
      },
    ],
  },
  {
    title: 'Selling on CropBid',
    blurb: 'Farmers, local shops and wholesalers.',
    items: [
      {
        q: 'How do farmers sell crops on CropBid?',
        a: 'Sellers apply first: farmers, local shops and wholesalers submit an application with their location, licence numbers and payout details, and CropBid reviews it before the account can trade. Once approved, a seller lists the crop with quantity, quality grade and an asking price. Buyers place bids; the farmer accepts, rejects or counters. The listing can also be run as a live timed auction, or handed to an AI agent that negotiates within price limits the farmer sets. Live government mandi rates sit alongside every listing so both sides negotiate against the same reference price.',
      },
      {
        q: 'Can I sell to households as well as to bulk buyers?',
        a: 'Yes, from the same listing. A lot can be open for bidding by businesses and also carry a retail price for households buying by the kilo. The stock is shared, so anything sold direct comes off what a bulk buyer can bid for, and the listing closes when it runs out.',
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
        a: 'Once a price is agreed the buyer pays into escrow via Razorpay. The money is held, not released. The crop then ships through a logistics partner, and the payment releases to the farmer once delivery is confirmed. The buyer is protected against non-delivery and the farmer against non-payment.',
      },
      {
        q: 'Does it cost anything to join CropBid?',
        a: 'Creating an account, listing crops and checking mandi rates are free; CropBid charges a flat 2% only when a deal settles. Signing in needs nothing but a phone number and a 6-digit code — there is no password. CropBid is available in English, Hindi and Marathi.',
      },
      {
        q: 'What are live mandi rates and where do they come from?',
        a: 'Mandi rates are the daily wholesale prices set at India’s regulated APMC markets. CropBid pulls them from government data covering more than 4,600 mandis and shows them free, so a farmer can see what a crop is actually fetching nearby before agreeing to any price. They are a reference price, not what you pay at a shop: a retail price includes handling, delivery and the shop’s own margin on top.',
      },
      {
        q: 'Who buys on CropBid?',
        a: 'Buyers of every size use the same exchange — restaurants and cafés, small food businesses, wholesalers, food processors, FMCG companies, exporters and retailers buying in bulk, alongside individual consumers buying household quantities direct from the seller. Business buyers apply and are reviewed the same way sellers are.',
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
        q: 'Do I need an email address?',
        a: 'Not to buy or to sell as a farmer. Your phone number is the account, and many farmers do not have an email address, so we do not require one. Business buyers do need an email, because that is where their application and order paperwork goes.',
      },
      {
        q: 'How do I delete my account and what happens to my data?',
        a: 'You can delete your account from Settings. If you have no settled trades, the account and its data are deleted outright. If you do have settled trades we cannot erase a completed transaction the other party is equally entitled to, so we anonymise instead: your name, phone number, location, photo and bank details are removed, your login is permanently disabled, and the transaction survives with no personal details attached. The privacy policy sets this out in full.',
      },
    ],
  },
];

/** Flattened, in page order — what the FAQPage structured data is built from. */
export const FAQ_ITEMS: FaqItem[] = FAQ_GROUPS.flatMap((g) => g.items);
