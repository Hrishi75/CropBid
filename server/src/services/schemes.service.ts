// =============================================================================
// Sarkari Yojana Service — curated catalogue of government schemes for farmers
// =============================================================================
// WHY THIS EXISTS
// Farmers routinely miss money they are entitled to — income support, crop
// insurance, subsidised credit — because scheme information is scattered
// across a dozen portals in official English. This service is a single,
// searchable catalogue in simple words: what you get, who qualifies, how to
// apply, and the official link.
//
// DESIGN
//   - Curated static data, served from the API (not baked into the clients)
//     so scheme details can be corrected/extended without an app release.
//   - Search matches simple English AND common Hinglish words farmers
//     actually type ("bima", "karza", "pension", "solar").
//   - No auth — schemes are public information, same as mandi rates.
//
// Figures (₹ amounts, subsidy %) reflect scheme guidelines as of mid-2026;
// each entry links to the official portal as the source of truth.
// =============================================================================

export type SchemeCategory =
  | 'income'      // direct income support
  | 'insurance'   // crop insurance
  | 'credit'      // loans & credit
  | 'pension'     // old-age pension
  | 'soil'        // soil & inputs
  | 'energy'      // solar & energy
  | 'irrigation'  // water & irrigation
  | 'machinery'   // equipment & mechanisation
  | 'storage'     // warehouses & post-harvest infra
  | 'organic'     // organic farming
  | 'market'      // selling & market access
  | 'allied';     // dairy, livestock, fisheries

export interface Scheme {
  slug: string;
  name: string;          // common short name
  hindiName: string;     // Devanagari name, as farmers know it
  emoji: string;
  category: SchemeCategory;
  tagline: string;       // one line: what you get
  benefit: string;       // the money/benefit, in plain words
  eligibility: string;   // who qualifies, in plain words
  apply: string;         // how to apply, in plain words
  link: string;          // official portal
  keywords: string;      // extra search words incl. Hinglish (not displayed)
}

export const CATEGORY_LABEL: Record<SchemeCategory, string> = {
  income: 'Income support',
  insurance: 'Crop insurance',
  credit: 'Loans & credit',
  pension: 'Pension',
  soil: 'Soil & inputs',
  energy: 'Solar & energy',
  irrigation: 'Irrigation',
  machinery: 'Machines & equipment',
  storage: 'Storage & warehouses',
  organic: 'Organic farming',
  market: 'Selling & markets',
  allied: 'Dairy & livestock',
};

const SCHEMES: Scheme[] = [
  {
    slug: 'pm-kisan',
    name: 'PM-KISAN',
    hindiName: 'पीएम किसान सम्मान निधि',
    emoji: '💰',
    category: 'income',
    tagline: '₹6,000 every year, straight to your bank account.',
    benefit: '₹2,000 three times a year (every 4 months), paid directly into your bank account by the central government. Nobody to pay, no fee.',
    eligibility: 'All landholding farmer families — the land must be in your (or your family\'s) name. Institutional landholders and income-tax payers are excluded.',
    apply: 'Register free at pmkisan.gov.in ("New Farmer Registration") or at your nearest CSC centre with Aadhaar, bank passbook and land papers. Check your installment status on the same site under "Know Your Status".',
    link: 'https://pmkisan.gov.in',
    keywords: 'samman nidhi kist installment paisa 6000 2000 direct benefit transfer dbt status पैसा किस्त सम्मान निधि',
  },
  {
    slug: 'pmfby',
    name: 'Fasal Bima (PMFBY)',
    hindiName: 'प्रधानमंत्री फसल बीमा योजना',
    emoji: '🛡️',
    category: 'insurance',
    tagline: 'Crop insurance — pay 2% premium, government pays the rest.',
    benefit: 'If your crop fails from drought, flood, hail, pests or disease, the insurance pays you the full insured amount. You pay only 2% premium for kharif, 1.5% for rabi (5% for horticulture/commercial crops) — the government pays the remaining premium.',
    eligibility: 'All farmers growing notified crops in notified areas — including sharecroppers and tenant farmers. Optional for everyone (including loanee farmers).',
    apply: 'Through your bank when you take a crop loan, at a CSC centre, or directly at pmfby.gov.in before the season\'s cut-off date. Report crop loss within 72 hours on the app or helpline 14447.',
    link: 'https://pmfby.gov.in',
    keywords: 'bima insurance fasal crop loss drought flood hail barish sukha muavza claim 14447 बीमा फसल मुआवजा',
  },
  {
    slug: 'kcc',
    name: 'Kisan Credit Card (KCC)',
    hindiName: 'किसान क्रेडिट कार्ड',
    emoji: '💳',
    category: 'credit',
    tagline: 'Crop loans up to ₹5 lakh at ~4% effective interest.',
    benefit: 'A revolving credit line for seeds, fertiliser and expenses. Loans up to ₹5 lakh (limit raised in Budget 2025) get an interest subsidy — pay on time and the effective rate comes to about 4%, far below moneylender rates. Also covers dairy and fisheries needs.',
    eligibility: 'All farmers — owners, tenants, sharecroppers and SHG members. Land records or a cultivation proof needed; the card is issued by your bank.',
    apply: 'Apply at any bank branch with land papers, Aadhaar and photos, or through the common KCC form on pmkisan.gov.in. Banks must decide within 14 days.',
    link: 'https://www.myscheme.gov.in/schemes/kcc',
    keywords: 'loan karza credit card byaj interest subvention 4 percent 5 lakh moneylender sahukar fertiliser beej लोन कर्ज ब्याज',
  },
  {
    slug: 'pm-kmy',
    name: 'Kisan Maandhan (Pension)',
    hindiName: 'पीएम किसान मानधन योजना',
    emoji: '👴',
    category: 'pension',
    tagline: '₹3,000/month pension after age 60.',
    benefit: 'A guaranteed ₹3,000 monthly pension after you turn 60. You contribute ₹55–₹200 per month (depending on joining age) and the government matches it rupee for rupee.',
    eligibility: 'Small and marginal farmers (up to 2 hectares), aged 18–40 at entry. PM-KISAN beneficiaries can pay contributions directly from that money.',
    apply: 'Enrol free at your nearest CSC centre with Aadhaar and bank passbook, or at maandhan.in.',
    link: 'https://maandhan.in',
    keywords: 'pension budhapa old age 3000 monthly mandhan retirement पेंशन बुढ़ापा',
  },
  {
    slug: 'soil-health-card',
    name: 'Soil Health Card',
    hindiName: 'मृदा स्वास्थ्य कार्ड',
    emoji: '🧪',
    category: 'soil',
    tagline: 'Free soil test + exact fertiliser dose for your field.',
    benefit: 'The government tests your soil free of cost and gives you a card showing exactly which nutrients your field needs — so you stop wasting money on fertiliser your soil doesn\'t need. Farmers typically save 8–10% on input costs.',
    eligibility: 'Every farmer, for every plot. Cards are re-issued on a cycle so your recommendations stay current.',
    apply: 'Contact your village agriculture officer / Krishi Vigyan Kendra, or register at soilhealth.dac.gov.in. Soil samples are collected from your field.',
    link: 'https://soilhealth.dac.gov.in',
    keywords: 'mitti soil test khad fertiliser urea dap npk nutrients free jaanch मिट्टी खाद जांच',
  },
  {
    slug: 'pm-kusum',
    name: 'PM-KUSUM (Solar)',
    hindiName: 'पीएम कुसुम योजना',
    emoji: '☀️',
    category: 'energy',
    tagline: 'Up to 60% subsidy on solar pumps — plus sell extra power.',
    benefit: 'Roughly 60% subsidy (30% central + 30% state, varies by state) on standalone solar pumps and on solarising existing grid pumps — plus 30% as a bank loan, so you pay only ~10% upfront. Diesel cost disappears; some states let you sell surplus power to the grid.',
    eligibility: 'Individual farmers, FPOs, panchayats and cooperatives. Priority where grid power is unreliable or diesel pumps are in use.',
    apply: 'Through your state\'s renewable-energy agency (state KUSUM portal) — beware of fake websites; the official list is on pmkusum.mnre.gov.in.',
    link: 'https://pmkusum.mnre.gov.in',
    keywords: 'solar pump subsidy diesel bijli electricity kusum surya urja grid सोलर पंप बिजली',
  },
  {
    slug: 'per-drop-more-crop',
    name: 'Drip & Sprinkler Subsidy',
    hindiName: 'प्रति बूंद अधिक फसल (सूक्ष्म सिंचाई)',
    emoji: '💧',
    category: 'irrigation',
    tagline: '45–55% subsidy on drip and sprinkler systems.',
    benefit: '55% subsidy for small/marginal farmers (45% for others) on drip and sprinkler irrigation. Uses 30–50% less water, cuts fertiliser cost (fertigation), and typically raises yields 20–40%.',
    eligibility: 'All farmers; higher subsidy for small and marginal holdings. Some states top up the central subsidy further.',
    apply: 'Through your district horticulture/agriculture office or your state\'s micro-irrigation portal. Empanelled suppliers install; the subsidy is adjusted in the bill.',
    link: 'https://pmksy.gov.in',
    keywords: 'drip sprinkler sinchai pani water tapak micro irrigation fertigation subsidy सिंचाई पानी ड्रिप',
  },
  {
    slug: 'smam',
    name: 'Machinery Subsidy (SMAM)',
    hindiName: 'कृषि यंत्रीकरण उप-मिशन',
    emoji: '🚜',
    category: 'machinery',
    tagline: '40–50% subsidy on tractors, tillers and farm machines.',
    benefit: '40–50% subsidy on farm machinery — higher end for SC/ST, women and small/marginal farmers. Also funds Custom Hiring Centres so groups of farmers can rent machines instead of buying.',
    eligibility: 'All farmers; priority and higher rates for small/marginal, SC/ST and women farmers. FPOs and cooperatives can apply for hiring centres.',
    apply: 'Register on agrimachinery.nic.in (Direct Benefit Transfer in Agriculture Mechanisation portal), choose the machine, and buy from an empanelled dealer.',
    link: 'https://agrimachinery.nic.in',
    keywords: 'tractor machine yantra rotavator tiller harvester subsidy custom hiring rent ट्रैक्टर मशीन यंत्र',
  },
  {
    slug: 'aif',
    name: 'Warehouse Loan (AIF)',
    hindiName: 'कृषि अवसंरचना कोष',
    emoji: '🏗️',
    category: 'storage',
    tagline: 'Cheap loans up to ₹2 crore for storage & processing.',
    benefit: '3% interest subsidy on loans up to ₹2 crore for building warehouses, cold storage, grading/sorting units and processing plants — with a credit guarantee so smaller borrowers get bank approval. Store your harvest and sell when prices are better instead of dumping at harvest lows.',
    eligibility: 'Farmers, FPOs, SHGs, cooperatives, agri-entrepreneurs and startups.',
    apply: 'Apply online at agriinfra.dac.gov.in; the portal routes your project to banks.',
    link: 'https://agriinfra.dac.gov.in',
    keywords: 'warehouse godown cold storage processing loan infrastructure fund 2 crore store harvest गोदाम भंडारण',
  },
  {
    slug: 'pkvy',
    name: 'Organic Farming (PKVY)',
    hindiName: 'परम्परागत कृषि विकास योजना',
    emoji: '🌿',
    category: 'organic',
    tagline: '~₹31,500/hectare over 3 years to go organic.',
    benefit: 'Around ₹31,500 per hectare over 3 years for farmers converting to organic — a large part paid directly to you for inputs, plus free certification and help selling organic produce at premium prices.',
    eligibility: 'Farmers joining an organic cluster/group in their area (the scheme works cluster-wise, usually 20 hectares per cluster).',
    apply: 'Through your district agriculture office or state organic mission — ask about joining or forming a PKVY cluster in your village.',
    link: 'https://pgsindia-ncof.gov.in',
    keywords: 'organic jaivik kheti natural certification premium desi khad compost जैविक खेती',
  },
  {
    slug: 'enam',
    name: 'e-NAM',
    hindiName: 'राष्ट्रीय कृषि बाज़ार',
    emoji: '🏪',
    category: 'market',
    tagline: 'Sell in 1,400+ mandis across India, online.',
    benefit: 'One online licence to sell in 1,400+ connected mandis across India — buyers from other states can bid on your produce, payments come online, and you see live prices before you sell.',
    eligibility: 'Any farmer with produce to sell through an e-NAM mandi; free registration.',
    apply: 'Register free at enam.gov.in or at the e-NAM desk in your nearest connected mandi with Aadhaar and bank details.',
    link: 'https://enam.gov.in',
    keywords: 'mandi bech sell online auction bid price national agriculture market मंडी बेचना भाव',
  },
  {
    slug: 'nlm',
    name: 'Livestock Mission (NLM)',
    hindiName: 'राष्ट्रीय पशुधन मिशन',
    emoji: '🐄',
    category: 'allied',
    tagline: '50% subsidy for poultry, goat, sheep & fodder units.',
    benefit: 'Capital subsidy of 50% (up to ₹25–50 lakh depending on the unit) for setting up poultry farms, goat/sheep breeding units, piggery and fodder enterprises — a second income alongside crops.',
    eligibility: 'Individuals, farmers, SHGs, FPOs and companies. Bank loan or self-financing for the non-subsidy part.',
    apply: 'Apply on the NLM portal at nlm.udyamimitra.in with a project proposal; state animal husbandry departments assist.',
    link: 'https://nlm.udyamimitra.in',
    keywords: 'pashu dairy poultry murgi bakri goat sheep bhed suar pig fodder chara dudh subsidy पशु डेयरी मुर्गी बकरी दूध',
  },
];

// -----------------------------------------------------------------------------
// Search — case-insensitive match across every text field incl. Hinglish
// keywords, so "bima", "loan", "solar", "पेंशन" all land on the right scheme.
// -----------------------------------------------------------------------------
export function searchSchemes(q?: string, category?: string): Scheme[] {
  let out = SCHEMES;
  if (category) out = out.filter((s) => s.category === category);
  if (q && q.trim()) {
    const needle = q.trim().toLowerCase();
    out = out.filter((s) =>
      [s.name, s.hindiName, s.tagline, s.benefit, s.eligibility, s.apply, s.keywords, CATEGORY_LABEL[s.category]]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }
  return out;
}
