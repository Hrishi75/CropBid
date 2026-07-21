// =============================================================================
// Equipment Catalogue — the curated dealer and machinery data
// =============================================================================
// Dealers are curated partners rather than self-serve accounts (see the note on
// EquipmentDealer in schema.prisma), so this catalogue IS the product data —
// there is no dealer-facing UI that would otherwise create it.
//
// WHY THIS IS ITS OWN MODULE
// Two callers need it and they must not drift:
//   - prisma/seed.ts          wipes and rebuilds a development database
//   - prisma/seedEquipment.ts adds this catalogue to an existing database,
//                             which is the only way to populate production
// Keeping the rows here means adding a machine updates both paths at once.
//
// Prices are realistic Indian market rates as of 2026 — a smallholder rents the
// ₹6L tractor at ₹1,100/day rather than buying it, which is why most rows offer
// BOTH.
// =============================================================================

type Category =
  | 'TRACTOR' | 'TILLAGE' | 'HARVESTER' | 'IRRIGATION'
  | 'SPRAYER' | 'THRESHER' | 'POWER' | 'TOOLS';

type Condition = 'NEW' | 'USED';
type Mode = 'SALE' | 'RENT' | 'BOTH';

export interface DealerSeed {
  name: string;
  location: string;
  state: string;
  contactPhone: string;
  contactEmail?: string;
  verified?: boolean;
  rating?: number;
  smamEmpanelled?: boolean;
}

export interface EquipmentSeed {
  /** Matches DealerSeed.name — resolved to a dealerId at insert time. */
  dealer: string;
  title: string;
  category: Category;
  brand?: string;
  modelName?: string;
  condition: Condition;
  yearMade?: number;
  mode: Mode;
  salePrice?: number;
  rentPricePerDay?: number;
  rentPricePerHour?: number;
  securityDeposit?: number;
  powerHp?: number;
  specs: string[];
  description?: string;
  location: string;
  state: string;
}

export const EQUIPMENT_DEALERS: DealerSeed[] = [
  {
    name: 'Sharma Tractors & Implements',
    location: 'Nashik', state: 'Maharashtra',
    contactPhone: '+91-9820000101', contactEmail: 'sales@sharmatractors.in',
    verified: true, rating: 4.4, smamEmpanelled: true,
  },
  {
    name: 'Krishi Yantra Kendra',
    location: 'Pune', state: 'Maharashtra',
    contactPhone: '+91-9820000102', contactEmail: 'info@krishiyantra.in',
    verified: true, rating: 4.1, smamEmpanelled: true,
  },
  {
    name: 'Patel Pumps & Pipes',
    location: 'Ahmedabad', state: 'Gujarat',
    contactPhone: '+91-9820000103', contactEmail: 'orders@patelpumps.in',
    verified: true, rating: 4.6,
  },
  {
    name: 'Green Field Custom Hiring Centre',
    location: 'Perambalur', state: 'Tamil Nadu',
    contactPhone: '+91-9820000104',
    verified: true, rating: 4.3, smamEmpanelled: true,
  },
  {
    name: 'Deshmukh Agro Machinery',
    location: 'Nagpur', state: 'Maharashtra',
    contactPhone: '+91-9820000105', contactEmail: 'deshmukh.agro@gmail.com',
    rating: 3.8,
  },
];

export const EQUIPMENT_CATALOGUE: EquipmentSeed[] = [
  // --- Tractors: expensive to buy, so hire rates matter most ---
  {
    dealer: 'Sharma Tractors & Implements',
    title: 'Mahindra 575 DI XP Plus',
    category: 'TRACTOR', brand: 'Mahindra', modelName: '575 DI XP Plus',
    condition: 'NEW', mode: 'BOTH',
    salePrice: 785000, rentPricePerDay: 1400, securityDeposit: 10000,
    powerHp: 47,
    specs: ['47 HP', '1600 kg lift capacity', '8 forward + 2 reverse gears', 'Power steering'],
    description: 'Workhorse 47 HP tractor suited to 5–20 acre holdings. Eligible for 40–50% SMAM subsidy through this dealer.',
    location: 'Nashik', state: 'Maharashtra',
  },
  {
    dealer: 'Green Field Custom Hiring Centre',
    title: 'John Deere 5050 D — hire only',
    category: 'TRACTOR', brand: 'John Deere', modelName: '5050 D',
    condition: 'USED', yearMade: 2022, mode: 'RENT',
    rentPricePerDay: 1800, rentPricePerHour: 320, securityDeposit: 15000,
    powerHp: 50,
    specs: ['50 HP', '2000 kg lift capacity', 'Operator included'],
    description: 'Custom Hiring Centre tractor with operator. Book by the day through sowing and harvest season.',
    location: 'Perambalur', state: 'Tamil Nadu',
  },
  {
    dealer: 'Krishi Yantra Kendra',
    title: 'Kubota Power Tiller PEM 140 DI',
    category: 'TRACTOR', brand: 'Kubota', modelName: 'PEM 140 DI',
    condition: 'NEW', mode: 'BOTH',
    salePrice: 168000, rentPricePerDay: 650, securityDeposit: 5000,
    powerHp: 14,
    specs: ['14 HP diesel', 'Suits paddy and vegetable plots', 'Rotary tiller attachment'],
    location: 'Pune', state: 'Maharashtra',
  },

  // --- Tillage ---
  {
    dealer: 'Sharma Tractors & Implements',
    title: 'Rotavator 7 feet — Shaktiman',
    category: 'TILLAGE', brand: 'Shaktiman', modelName: 'Regular 210',
    condition: 'NEW', mode: 'BOTH',
    salePrice: 96000, rentPricePerDay: 900,
    specs: ['7 ft working width', '42 blades', 'Needs 45+ HP tractor'],
    location: 'Nashik', state: 'Maharashtra',
  },
  {
    dealer: 'Deshmukh Agro Machinery',
    title: 'Disc Harrow 16-blade (used)',
    category: 'TILLAGE', brand: 'Landforce',
    condition: 'USED', yearMade: 2021, mode: 'SALE',
    salePrice: 42000,
    specs: ['16 discs', 'Offset mounted', 'Suits 35–50 HP tractors'],
    location: 'Nagpur', state: 'Maharashtra',
  },

  // --- Irrigation: the everyday spend, affordable to buy outright ---
  {
    dealer: 'Patel Pumps & Pipes',
    title: 'Kirloskar 5 HP Openwell Submersible Pump',
    category: 'IRRIGATION', brand: 'Kirloskar', modelName: 'KOS-535+',
    condition: 'NEW', mode: 'SALE',
    salePrice: 28500,
    powerHp: 5,
    specs: ['5 HP', 'Three phase', 'Max head 45 m', 'Copper winding'],
    description: 'Openwell submersible for borewell and canal irrigation. Two-year manufacturer warranty.',
    location: 'Ahmedabad', state: 'Gujarat',
  },
  {
    dealer: 'Patel Pumps & Pipes',
    title: 'HDPE Irrigation Pipe 63 mm — 100 m coil',
    category: 'IRRIGATION', brand: 'Supreme',
    condition: 'NEW', mode: 'SALE',
    salePrice: 6800,
    specs: ['63 mm diameter', '100 m coil', '6 kg/cm² pressure rating', 'ISI marked'],
    location: 'Ahmedabad', state: 'Gujarat',
  },
  {
    dealer: 'Patel Pumps & Pipes',
    title: 'Drip Irrigation Set — 1 acre',
    category: 'IRRIGATION', brand: 'Jain Irrigation',
    condition: 'NEW', mode: 'SALE',
    salePrice: 34000,
    specs: ['Covers 1 acre', 'Inline drippers at 40 cm', 'Filter and venturi included'],
    description: 'Complete 1-acre drip set. Eligible for PMKSY micro-irrigation subsidy — dealer assists with the paperwork.',
    location: 'Ahmedabad', state: 'Gujarat',
  },
  {
    dealer: 'Krishi Yantra Kendra',
    title: 'Solar Pump 3 HP DC',
    category: 'IRRIGATION', brand: 'Shakti', modelName: 'SSP-3000',
    condition: 'NEW', mode: 'SALE',
    salePrice: 165000,
    powerHp: 3,
    specs: ['3 HP DC', 'Solar panels included', 'Zero running cost', 'PM-KUSUM eligible'],
    description: 'Off-grid solar pump. Under PM-KUSUM the effective cost drops sharply — ask the dealer for the current state subsidy split.',
    location: 'Pune', state: 'Maharashtra',
  },

  // --- Sprayers ---
  {
    dealer: 'Krishi Yantra Kendra',
    title: 'Battery Knapsack Sprayer 16 L',
    category: 'SPRAYER', brand: 'Neptune',
    condition: 'NEW', mode: 'SALE',
    salePrice: 3200,
    specs: ['16 litre tank', '12V 8Ah battery', '4 nozzles included'],
    location: 'Pune', state: 'Maharashtra',
  },
  {
    dealer: 'Deshmukh Agro Machinery',
    title: 'Tractor-mounted Boom Sprayer 400 L',
    category: 'SPRAYER',
    condition: 'NEW', mode: 'BOTH',
    salePrice: 58000, rentPricePerDay: 700,
    specs: ['400 litre tank', '12 m boom', 'PTO driven'],
    location: 'Nagpur', state: 'Maharashtra',
  },

  // --- Harvester / thresher: classic hire items ---
  {
    dealer: 'Green Field Custom Hiring Centre',
    title: 'Combine Harvester — hire with operator',
    category: 'HARVESTER', brand: 'Preet', modelName: '987',
    condition: 'USED', yearMade: 2020, mode: 'RENT',
    rentPricePerHour: 2400, securityDeposit: 20000,
    specs: ['Self-propelled', 'Paddy and wheat', 'Operator and diesel extra'],
    description: 'Booked by the hour through harvest season. Reserve early — availability tightens in November.',
    location: 'Perambalur', state: 'Tamil Nadu',
  },
  {
    dealer: 'Sharma Tractors & Implements',
    title: 'Multi-crop Thresher 5 HP',
    category: 'THRESHER', brand: 'Dashmesh',
    condition: 'NEW', mode: 'BOTH',
    salePrice: 78000, rentPricePerDay: 850,
    powerHp: 5,
    specs: ['Wheat, gram, soybean', '8–10 quintal/hour', 'Blower cleaning'],
    location: 'Nashik', state: 'Maharashtra',
  },

  // --- Power + tools ---
  {
    dealer: 'Patel Pumps & Pipes',
    title: 'Crompton 7.5 HP Three-Phase Motor',
    category: 'POWER', brand: 'Crompton',
    condition: 'NEW', mode: 'SALE',
    salePrice: 21500,
    powerHp: 7.5,
    specs: ['7.5 HP', '1440 RPM', 'Three phase', 'IE2 efficiency'],
    location: 'Ahmedabad', state: 'Gujarat',
  },
  {
    dealer: 'Deshmukh Agro Machinery',
    title: 'Brush Cutter / Weeder 2-stroke',
    category: 'TOOLS', brand: 'Honda', modelName: 'UMK 435',
    condition: 'NEW', mode: 'SALE',
    salePrice: 14500,
    specs: ['35.8 cc 2-stroke', 'Backpack type', 'Blade and nylon head'],
    location: 'Nagpur', state: 'Maharashtra',
  },
];
