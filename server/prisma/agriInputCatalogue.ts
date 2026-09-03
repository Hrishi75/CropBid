// =============================================================================
// Agri-Input Catalogue — the curated supplier and product data
// =============================================================================
// Suppliers are curated partners rather than self-serve accounts (see the note
// on InputSupplier in schema.prisma), so this catalogue IS the product data —
// there is no supplier-facing UI that would otherwise create it.
//
// WHY THIS IS ITS OWN MODULE
// Two callers need it and they must not drift:
//   - prisma/seed.ts           wipes and rebuilds a development database
//   - prisma/seedAgriInputs.ts adds this catalogue to an existing database,
//                              which is the only way to populate production
// Same split as equipmentCatalogue.ts.
//
// LICENCES ARE NOT DECORATION
// Every supplier below carries the licences for the categories they stock, and
// the service refuses to surface a row whose supplier lacks the matching one.
// So adding a CROP_PROTECTION product to a shop with no pesticideLicence makes
// that row invisible rather than making it sellable. That is deliberate: it is
// the mechanism that keeps CropBid a listing venue instead of an unlicensed
// seller. Licence numbers here follow real state formats but are PLACEHOLDERS
// until each partner's paperwork is verified.
//
// PRICES
// Realistic Indian market rates as of 2026. Urea, DAP and MOP carry a statutory
// MRP under the Fertiliser (Control) Order — those rows are marked `subsidised`
// so the UI can say the price is set by government rather than by the shop.
// =============================================================================

type Category =
  | 'SEED' | 'FERTILISER' | 'ORGANIC'
  | 'CROP_PROTECTION' | 'MICRONUTRIENT' | 'SEEDLING';

export interface SupplierSeed {
  name: string;
  location: string;
  state: string;
  contactPhone: string;
  contactEmail?: string;
  verified?: boolean;
  rating?: number;
  seedLicence?: string;
  fertiliserLicence?: string;
  pesticideLicence?: string;
}

export interface AgriInputSeed {
  /** Matches SupplierSeed.name — resolved to a supplierId at insert time. */
  supplier: string;
  title: string;
  category: Category;
  brand?: string;
  cropNames: string[];
  packSize: string;
  pricePerPack: number;
  subsidised?: boolean;
  composition?: string;
  germinationPct?: number;
  seedTreatment?: string;
  dosagePerAcre?: string;
  specs?: string[];
  description?: string;
  location: string;
  state: string;
}

export const INPUT_SUPPLIERS: SupplierSeed[] = [
  {
    name: 'Sahyadri Krishi Kendra',
    location: 'Pune',
    state: 'Maharashtra',
    contactPhone: '+91 98220 41567',
    contactEmail: 'sales@sahyadrikrishi.in',
    verified: true,
    rating: 4.6,
    seedLicence: 'MH/PUN/SEED/2019/4471',
    fertiliserLicence: 'MH/PUN/FERT/2019/8823',
    pesticideLicence: 'MH/PUN/INS/2020/1194',
  },
  {
    name: 'Vidarbha Beej Bhandar',
    location: 'Nagpur',
    state: 'Maharashtra',
    contactPhone: '+91 91560 33420',
    contactEmail: 'contact@vidarbhabeej.in',
    verified: true,
    rating: 4.4,
    seedLicence: 'MH/NAG/SEED/2018/2210',
    fertiliserLicence: 'MH/NAG/FERT/2018/6607',
  },
  {
    name: 'Godavari Agro Agencies',
    location: 'Nashik',
    state: 'Maharashtra',
    contactPhone: '+91 94220 77315',
    verified: true,
    rating: 4.3,
    seedLicence: 'MH/NAS/SEED/2021/5138',
    fertiliserLicence: 'MH/NAS/FERT/2021/9042',
    pesticideLicence: 'MH/NAS/INS/2021/3376',
  },
  {
    name: 'Bharat Organic Inputs',
    location: 'Pune',
    state: 'Maharashtra',
    contactPhone: '+91 90280 55198',
    contactEmail: 'hello@bharatorganic.co.in',
    rating: 4.2,
    // No seed / fertiliser / pesticide licence on purpose: this shop stocks
    // only ORGANIC and MICRONUTRIENT lines, which are not licensed categories.
    // It also proves the gate works — give it a SEED row and the row vanishes.
  },
];

export const AGRI_INPUT_CATALOGUE: AgriInputSeed[] = [
  // --- SEED -----------------------------------------------------------------
  {
    supplier: 'Vidarbha Beej Bhandar',
    title: 'Ajeet 155 BG II Bt Cotton',
    category: 'SEED',
    brand: 'Ajeet Seeds',
    cropNames: ['Cotton'],
    packSize: '475 g packet',
    pricePerPack: 864,
    composition: 'Bt cotton hybrid, BG II',
    germinationPct: 75,
    seedTreatment: 'Imidacloprid treated',
    dosagePerAcre: '1 packet / acre',
    specs: ['160–180 day duration', 'Sucking-pest tolerant', 'Rainfed & irrigated'],
    description:
      'The standard rainfed cotton hybrid across Vidarbha. Packet price for BG II cotton is government-capped, so it is the same at every licensed counter.',
    location: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    supplier: 'Vidarbha Beej Bhandar',
    title: 'JS 335 Soybean (certified)',
    category: 'SEED',
    brand: 'Mahabeej',
    cropNames: ['Soybean'],
    packSize: '30 kg bag',
    pricePerPack: 2850,
    composition: 'Certified variety, yellow seeded',
    germinationPct: 70,
    dosagePerAcre: '30 kg / acre',
    specs: ['95–100 day duration', 'Yields 10–12 quintal/acre'],
    description: 'Mahabeej certified stock with a tagged germination guarantee on every bag.',
    location: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    supplier: 'Sahyadri Krishi Kendra',
    title: 'HD 2967 Wheat (certified)',
    category: 'SEED',
    brand: 'Mahabeej',
    cropNames: ['Wheat'],
    packSize: '40 kg bag',
    pricePerPack: 1640,
    germinationPct: 85,
    seedTreatment: 'Thiram treated',
    dosagePerAcre: '40 kg / acre',
    specs: ['140 day duration', 'Rust resistant', 'Irrigated timely sowing'],
    location: 'Pune',
    state: 'Maharashtra',
  },
  {
    supplier: 'Godavari Agro Agencies',
    title: 'Syngenta Saaho Tomato Hybrid',
    category: 'SEED',
    brand: 'Syngenta',
    cropNames: ['Tomato'],
    packSize: '10 g tin',
    pricePerPack: 1780,
    germinationPct: 85,
    dosagePerAcre: '2 tins / acre',
    specs: ['Firm fruit, long transport life', 'Leaf-curl tolerant'],
    description: 'Table tomato hybrid that travels well, which matters if you are selling into Mumbai or Pune mandis.',
    location: 'Nashik',
    state: 'Maharashtra',
  },
  {
    supplier: 'Sahyadri Krishi Kendra',
    title: 'Pioneer 3396 Maize Hybrid',
    category: 'SEED',
    brand: 'Corteva Pioneer',
    cropNames: ['Maize'],
    packSize: '4 kg packet',
    pricePerPack: 1450,
    germinationPct: 90,
    dosagePerAcre: '8 kg / acre',
    specs: ['110–115 day duration', 'Good for grain and fodder'],
    location: 'Pune',
    state: 'Maharashtra',
  },

  // --- FERTILISER -----------------------------------------------------------
  {
    supplier: 'Sahyadri Krishi Kendra',
    title: 'Urea (46% N)',
    category: 'FERTILISER',
    brand: 'IFFCO',
    cropNames: ['Wheat', 'Maize', 'Cotton', 'Sugarcane', 'Rice'],
    packSize: '45 kg bag',
    pricePerPack: 266.5,
    subsidised: true,
    composition: 'N 46%',
    dosagePerAcre: '2–3 bags / acre, split across top dressings',
    specs: ['Neem-coated', 'Statutory MRP'],
    description:
      'Price is fixed by government under the Fertiliser (Control) Order and is identical at every licensed outlet. If anyone quotes more, that is overcharging.',
    location: 'Pune',
    state: 'Maharashtra',
  },
  {
    supplier: 'Sahyadri Krishi Kendra',
    title: 'DAP (18:46:0)',
    category: 'FERTILISER',
    brand: 'IFFCO',
    cropNames: ['Wheat', 'Soybean', 'Cotton', 'Gram'],
    packSize: '50 kg bag',
    pricePerPack: 1350,
    subsidised: true,
    composition: 'N 18%, P 46%',
    dosagePerAcre: '1 bag / acre at sowing',
    specs: ['Basal application', 'Statutory MRP'],
    location: 'Pune',
    state: 'Maharashtra',
  },
  {
    supplier: 'Vidarbha Beej Bhandar',
    title: 'NPK 10:26:26 Complex',
    category: 'FERTILISER',
    brand: 'Coromandel',
    cropNames: ['Cotton', 'Soybean', 'Chilli'],
    packSize: '50 kg bag',
    pricePerPack: 1470,
    composition: 'N 10%, P 26%, K 26%',
    dosagePerAcre: '1 bag / acre basal',
    specs: ['Balanced basal dose', 'Granular'],
    location: 'Nagpur',
    state: 'Maharashtra',
  },
  {
    supplier: 'Godavari Agro Agencies',
    title: 'Muriate of Potash (MOP)',
    category: 'FERTILISER',
    brand: 'IPL',
    cropNames: ['Grapes', 'Onion', 'Banana', 'Sugarcane'],
    packSize: '50 kg bag',
    pricePerPack: 1700,
    subsidised: true,
    composition: 'K 60%',
    dosagePerAcre: '40–50 kg / acre',
    specs: ['Improves fruit firmness', 'Statutory MRP'],
    location: 'Nashik',
    state: 'Maharashtra',
  },

  // --- ORGANIC --------------------------------------------------------------
  {
    supplier: 'Bharat Organic Inputs',
    title: 'Vermicompost (screened)',
    category: 'ORGANIC',
    cropNames: ['Vegetables', 'Grapes', 'Pomegranate', 'Sugarcane'],
    packSize: '50 kg bag',
    pricePerPack: 420,
    dosagePerAcre: '20–40 bags / acre',
    specs: ['Screened, low moisture', 'Organic-certification friendly'],
    description: 'Bulk orders are delivered loose by tractor trolley, which works out cheaper per tonne than bagged.',
    location: 'Pune',
    state: 'Maharashtra',
  },
  {
    supplier: 'Bharat Organic Inputs',
    title: 'Neem Cake Powder',
    category: 'ORGANIC',
    cropNames: ['Cotton', 'Vegetables', 'Sugarcane'],
    packSize: '40 kg bag',
    pricePerPack: 780,
    dosagePerAcre: '4–5 bags / acre',
    specs: ['Soil-borne pest suppression', 'Slow-release nitrogen'],
    location: 'Pune',
    state: 'Maharashtra',
  },
  {
    supplier: 'Bharat Organic Inputs',
    title: 'Trichoderma viride Bio-fungicide',
    category: 'ORGANIC',
    cropNames: ['Chilli', 'Tomato', 'Soybean', 'Gram'],
    packSize: '1 kg pouch',
    pricePerPack: 260,
    dosagePerAcre: '2 kg / acre with compost',
    specs: ['Seed and soil treatment', 'Wilt and root-rot suppression'],
    location: 'Pune',
    state: 'Maharashtra',
  },

  // --- CROP PROTECTION ------------------------------------------------------
  {
    supplier: 'Sahyadri Krishi Kendra',
    title: 'Confidor Super (Imidacloprid 30.5% SC)',
    category: 'CROP_PROTECTION',
    brand: 'Bayer',
    cropNames: ['Cotton', 'Chilli', 'Tomato', 'Rice'],
    packSize: '250 ml bottle',
    pricePerPack: 1120,
    composition: 'Imidacloprid 30.5% SC',
    dosagePerAcre: '60–80 ml / acre',
    specs: ['Sucking pests', 'Systemic'],
    description: 'Follow the label dose and the pre-harvest interval. Over-spraying builds resistance and costs you the next season.',
    location: 'Pune',
    state: 'Maharashtra',
  },
  {
    supplier: 'Godavari Agro Agencies',
    title: 'Coragen (Chlorantraniliprole 18.5% SC)',
    category: 'CROP_PROTECTION',
    brand: 'FMC',
    cropNames: ['Cotton', 'Tomato', 'Cabbage', 'Rice'],
    packSize: '60 ml bottle',
    pricePerPack: 1290,
    composition: 'Chlorantraniliprole 18.5% SC',
    dosagePerAcre: '60 ml / acre',
    specs: ['Bollworm and fruit borer', 'Low bee toxicity'],
    location: 'Nashik',
    state: 'Maharashtra',
  },
  {
    supplier: 'Godavari Agro Agencies',
    title: 'Mancozeb 75% WP',
    category: 'CROP_PROTECTION',
    brand: 'Indofil',
    cropNames: ['Grapes', 'Potato', 'Tomato', 'Onion'],
    packSize: '1 kg pack',
    pricePerPack: 480,
    composition: 'Mancozeb 75% WP',
    dosagePerAcre: '600–800 g / acre',
    specs: ['Contact fungicide', 'Downy and early blight'],
    location: 'Nashik',
    state: 'Maharashtra',
  },

  // --- MICRONUTRIENT --------------------------------------------------------
  {
    supplier: 'Bharat Organic Inputs',
    title: 'Zinc Sulphate Heptahydrate (21%)',
    category: 'MICRONUTRIENT',
    cropNames: ['Rice', 'Wheat', 'Maize', 'Sugarcane'],
    packSize: '5 kg pack',
    pricePerPack: 385,
    composition: 'Zn 21%',
    dosagePerAcre: '10 kg / acre soil application',
    specs: ['Corrects zinc deficiency', 'Soil or foliar'],
    description: 'Zinc deficiency is the most common micronutrient gap in Maharashtra soils. Worth a soil test before you buy.',
    location: 'Pune',
    state: 'Maharashtra',
  },
  {
    supplier: 'Sahyadri Krishi Kendra',
    title: 'Boron 20% (Di-sodium octaborate)',
    category: 'MICRONUTRIENT',
    cropNames: ['Pomegranate', 'Grapes', 'Cauliflower', 'Groundnut'],
    packSize: '1 kg pack',
    pricePerPack: 340,
    composition: 'B 20%',
    dosagePerAcre: '1 kg / acre foliar split',
    specs: ['Fruit set and pollen viability'],
    location: 'Pune',
    state: 'Maharashtra',
  },

  // --- SEEDLING -------------------------------------------------------------
  {
    supplier: 'Godavari Agro Agencies',
    title: 'Kesar Mango Grafts (2-year)',
    category: 'SEEDLING',
    cropNames: ['Mango'],
    packSize: 'per graft',
    pricePerPack: 165,
    dosagePerAcre: '70 grafts / acre at 8m × 8m',
    specs: ['2-year grafted stock', 'Bears from year 4'],
    location: 'Nashik',
    state: 'Maharashtra',
  },
  {
    supplier: 'Godavari Agro Agencies',
    title: 'Chilli Seedlings (portray raised)',
    category: 'SEEDLING',
    cropNames: ['Chilli'],
    packSize: 'tray of 200',
    pricePerPack: 340,
    dosagePerAcre: '45 trays / acre',
    specs: ['Portray raised, 25–30 days old', 'Hardened before dispatch'],
    location: 'Nashik',
    state: 'Maharashtra',
  },
];
