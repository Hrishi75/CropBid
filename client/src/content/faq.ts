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
//   - Plain words, short sentences. Readers include farmers reading in their
//     second language: say "we send it back", not "funds are remitted".
//   - The WhatsApp help card (components/ui/WhatsAppButton) picks questions
//     by their exact wording, so renaming one means updating PICKED there.
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
        a: 'Right now we deliver to homes in Nagpur only. Fresh food does not travel well, and a few kilos cannot be sent far at a fair price, so we only show you shops that can reach you. Buying in bulk, by the quintal or the tonne, works anywhere in India.',
      },
      {
        q: 'How soon will my order arrive?',
        a: 'Every shop shows which kind it is before you add anything. A local shop already has the stock near you and delivers the same day. A farm picks your order after you place it and delivers the next morning. If your basket has both, it comes in two deliveries, and the cart tells you so before you pay.',
      },
      {
        q: 'What is the smallest amount I can buy?',
        a: 'Half a kilo (500 g). Everything for homes is sold by the kilo, and you can change the amount in steps of 500 g. There is no minimum order. Delivery is free when you buy ₹200 or more from one shop. Below ₹200, delivery from that shop costs ₹30. Prices per quintal or tonne that you may see elsewhere on CropBid are for bulk buyers.',
      },
      {
        q: 'Why does the same vegetable cost different amounts at different shops?',
        a: 'Each shop sets its own price, just like in your local market. We do not mix them into one price. You pick a shop first and then see what it sells, so you can compare and choose.',
      },
      {
        q: 'Can I cancel an order?',
        a: 'Yes, until the shop marks it as on the way. Open the order on the website or in the app and cancel it. Everything you ordered from that shop is cancelled together, because it comes as one delivery. If you already paid, we send back the full amount, delivery charge included. We do this by hand, so allow a few working days. Once the shop has sent your order, you cannot cancel it. A shop can also cancel if it cannot deliver, and it must tell you why.',
      },
      {
        q: 'When do I pay, and what if the order never turns up?',
        a: 'You pay when you place the order. CropBid keeps the money safe and does not pass it to the shop straight away. The shop is paid only after you confirm the order arrived. If your order never comes, do not confirm it: your money stays with us, and you can write to info@cropbid.in.',
      },
    ],
  },
  {
    title: 'Selling on CropBid',
    blurb: 'Farmers, local shops and wholesalers.',
    items: [
      {
        q: 'How do farmers sell crops on CropBid?',
        a: 'First you apply: you tell us about your farm and give your PAN, and a person at CropBid checks it. Once you are approved, you list your crop with the amount, the quality and your price. Buyers send you offers, called bids. You can accept a bid, turn it down, or reply with your own price. You can also sell through a timed auction. The latest government mandi rate is shown next to every crop, so you and the buyer both know the market price.',
      },
      {
        q: 'What documents do I need to apply?',
        a: 'Every seller, and every business that buys, gives a PAN. Some trades need one more number. A local shop gives its FSSAI food licence. A wholesaler gives its GSTIN. A restaurant, food processor or FMCG company that buys gives its FSSAI food licence. An exporter gives its IEC (Import Export Code). A farmer selling their own crops needs only a PAN. You type the numbers in; there is nothing to scan or upload. Families buying for their home need none of this.',
      },
      {
        q: 'Can I sell to households as well as to bulk buyers?',
        a: 'Yes, from the same listing, if you are in Nagpur, where we deliver to homes. Add a price per kilo and families can buy small amounts while businesses bid on the rest. Both come out of the same stock, and the listing closes when it is sold out.',
      },
      {
        q: 'Who pays for transport?',
        a: 'For bulk deals, CropBid books the truck and the seller pays for it. The cost comes out of the seller’s payment, and the seller can see it in the payment details on the deal before any money is sent. We book the transport so that the delivery is ours to answer for. For home orders, the shopper pays the ₹30 delivery charge on a shop order under ₹200.',
      },
      {
        q: 'How long does seller approval take?',
        a: 'A person at CropBid checks every application, usually within 24 to 48 hours. Until then you can sign in and look around, but you cannot sell. If something is missing, we send the application back and tell you what to add, instead of turning it down.',
      },
    ],
  },
  {
    title: 'Money, prices and quality',
    blurb: 'Fees, payments, mandi rates and what we check.',
    items: [
      {
        q: 'How does payment work on CropBid?',
        a: 'When a price is agreed, the buyer pays through Razorpay. CropBid holds the money safely and does not pass it on straight away. The crop is then delivered. When the buyer confirms it arrived, the seller is owed the money minus our 2% fee and the transport cost. We send it to the seller’s UPI ID or bank account ourselves. This is not instant, so allow a few working days. Until the buyer confirms, nobody is paid: the buyer is protected if nothing arrives, and the seller is protected because the money is already paid in.',
      },
      {
        q: 'Does it cost anything to join CropBid?',
        a: 'No. Making an account, listing crops and checking mandi rates are all free. We charge 2% only when a deal is completed. Households pay ₹30 delivery on a shop order under ₹200. To sign up you need your name, a phone number or email address, and a password. On the website you can use your Google account instead. CropBid works in English, Hindi and Marathi.',
      },
      {
        q: 'Does CropBid check the quality of the crops?',
        a: 'No, not yet. The quality grade on a listing is what the seller says it is. We do not inspect or test the produce. That is why the seller is paid only after the buyer confirms the delivery arrived. If what arrives is not what was agreed, do not confirm it, and write to info@cropbid.in.',
      },
      {
        q: 'What are live mandi rates and where do they come from?',
        a: 'Mandi rates are the daily wholesale prices at India’s government-regulated markets, called APMC mandis. We take them from official government data covering more than 4,600 mandis and show them free, so a farmer can see what a crop is selling for nearby before agreeing a price. The page shows the date of the latest report, which on some days is yesterday or older. When there is no report for a crop, we show an estimated price marked “ref” instead. They are a guide, not a shop price: a shop’s price also covers handling, delivery and its own margin.',
      },
      {
        q: 'Who buys on CropBid?',
        a: 'Businesses of every size: restaurants and cafés, small food businesses, wholesalers, food processors, FMCG companies, exporters and shops. Families also buy small amounts for their home from local shops and farms. Businesses apply and are checked, just like sellers.',
      },
    ],
  },
  {
    title: 'Your account',
    blurb: 'Signing in, languages and your data.',
    items: [
      {
        q: 'I did not get my sign-in code. What now?',
        a: 'Most people sign in with their password and never need a code. If you asked for a code, it is sent on WhatsApp, or by email if WhatsApp cannot reach your number. A code works for a few minutes, and you can ask for a new one after a short wait. Check that you typed the same number that is on your account. If it still does not come, write to info@cropbid.in.',
      },
      {
        q: 'Can I sign in with Google?',
        a: 'Yes, on the website. Press Continue with Google in the sign-in window. If you are new, an account is made for you. If your Google email already has a CropBid account, Google opens that account, and the first time it does, the old password on it stops working, for your safety. You can set a new one with Forgot password. The phone app does not have Google sign-in yet. If anything goes wrong, write to info@cropbid.in.',
      },
      {
        q: 'Do I need an email address?',
        a: 'No. You can sign up with just a phone number, because many farmers do not use email. Without an email we cannot send you a link if you forget your password. Instead, sign in with a code sent to your phone, or write to info@cropbid.in and we will help you get back in.',
      },
      {
        q: 'How do I delete my account and what happens to my data?',
        a: 'Go to Settings on the website and choose to delete your account. You will need your password; if you only ever signed in with a code or with Google, set a password first. You cannot delete the account while money is still held for one of your deals, while there are credits in your wallet, or while a supply contract is running, so finish those first. If you have never completed a deal, everything is deleted. If you have, we keep the record of the deal, because the other person has a right to it too, but we remove your name, phone number, address, photo and bank details, and nobody can sign in to the account again. The privacy policy explains this in full.',
      },
    ],
  },
];

/** Flattened, in page order — what the FAQPage structured data is built from. */
export const FAQ_ITEMS: FaqItem[] = FAQ_GROUPS.flatMap((g) => g.items);
