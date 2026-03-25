// =============================================================================
// CropBid Database Seed Script
// =============================================================================
//
// THIS FILE POPULATES YOUR DATABASE WITH REALISTIC TEST DATA.
//
// WHY SEED DATA?
// You can't test a marketplace with empty tables. Seed data gives you:
//   - Users to log in as (farmers, buyers, admin)
//   - Listings to browse and bid on
//   - Bids and negotiations to view in the UI
//   - Transactions in various states for testing flows
//
// All test users have password: "password123"
//
// RUN: npx prisma db seed
// =============================================================================

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

// Prisma v7 requires a driver adapter for direct database connections.
// PrismaPg connects to PostgreSQL using the `pg` library under the hood.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter } as any);

// =============================================================================
// Helper: Hash password
// =============================================================================
// bcrypt cost factor 12 ≈ 250ms per hash.
// Slow enough to resist brute-force, fast enough for dev.
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// =============================================================================
// SEED DATA DEFINITIONS
// =============================================================================

// All test users share this password
const DEFAULT_PASSWORD = 'password123';

// ---------------------------------------------------------------------------
// Indian Farmers (15) — the primary market
// ---------------------------------------------------------------------------
const indianFarmers = [
  { name: 'Rajesh Patel',       email: 'rajesh@cropbid.test',    phone: '+91-9876543210', location: 'Nashik',        state: 'Maharashtra',    farmSize: 12, crops: ['onion', 'tomato', 'grape'],             organic: false, fpo: 'Nashik Farmers FPO',      apmc: 'MH-APMC-2024-1234' },
  { name: 'Gurpreet Singh',     email: 'gurpreet@cropbid.test',  phone: '+91-9876543211', location: 'Amritsar',      state: 'Punjab',         farmSize: 25, crops: ['wheat', 'rice', 'mustard'],             organic: false, fpo: null,                      apmc: 'PB-APMC-2024-5678' },
  { name: 'Lakshmi Devi',       email: 'lakshmi@cropbid.test',   phone: '+91-9876543212', location: 'Lucknow',       state: 'Uttar Pradesh',  farmSize: 8,  crops: ['rice', 'sugarcane', 'potato'],           organic: false, fpo: 'UP Kisan Samiti',         apmc: null },
  { name: 'Venkatesh Reddy',    email: 'venkatesh@cropbid.test', phone: '+91-9876543213', location: 'Bangalore',     state: 'Karnataka',      farmSize: 15, crops: ['coffee', 'turmeric', 'pepper'],          organic: true,  fpo: null,                      apmc: 'KA-APMC-2024-9012',  certBody: 'NPOP' },
  { name: 'Amit Sharma',        email: 'amit@cropbid.test',      phone: '+91-9876543214', location: 'Indore',        state: 'Madhya Pradesh', farmSize: 30, crops: ['soybean', 'wheat', 'chana'],             organic: false, fpo: 'MP Soy Producers FPO',    apmc: 'MP-APMC-2024-3456' },
  { name: 'Priya Kumari',       email: 'priya@cropbid.test',     phone: '+91-9876543215', location: 'Jaipur',        state: 'Rajasthan',      farmSize: 20, crops: ['mustard', 'wheat', 'bajra'],             organic: false, fpo: null,                      apmc: 'RJ-APMC-2024-7890' },
  { name: 'Murugan Subramanian', email: 'murugan@cropbid.test',  phone: '+91-9876543216', location: 'Madurai',       state: 'Tamil Nadu',     farmSize: 6,  crops: ['rice', 'banana', 'turmeric'],            organic: true,  fpo: 'TN Organic Farmers FPO',  apmc: null,                  certBody: 'NPOP' },
  { name: 'Jagdish Mehta',      email: 'jagdish@cropbid.test',   phone: '+91-9876543217', location: 'Ahmedabad',     state: 'Gujarat',        farmSize: 18, crops: ['cotton', 'groundnut', 'castor'],         organic: false, fpo: null,                      apmc: 'GJ-APMC-2024-2345' },
  { name: 'Srinivas Rao',       email: 'srinivas@cropbid.test',  phone: '+91-9876543218', location: 'Vijayawada',    state: 'Andhra Pradesh', farmSize: 10, crops: ['rice', 'cotton', 'chili'],               organic: false, fpo: 'AP Cotton Growers FPO',   apmc: 'AP-APMC-2024-6789' },
  { name: 'Ramesh Reddy',       email: 'ramesh@cropbid.test',    phone: '+91-9876543219', location: 'Hyderabad',     state: 'Telangana',      farmSize: 14, crops: ['rice', 'turmeric', 'cotton'],            organic: false, fpo: null,                      apmc: 'TG-APMC-2024-0123' },
  { name: 'Baldev Singh',       email: 'baldev@cropbid.test',    phone: '+91-9876543220', location: 'Ludhiana',      state: 'Punjab',         farmSize: 35, crops: ['wheat', 'rice', 'potato'],               organic: false, fpo: 'Punjab Grain FPO',        apmc: 'PB-APMC-2024-4567' },
  { name: 'Kavitha Nair',       email: 'kavitha@cropbid.test',   phone: '+91-9876543221', location: 'Kochi',         state: 'Kerala',         farmSize: 5,  crops: ['coconut', 'pepper', 'cardamom'],         organic: true,  fpo: null,                      apmc: null,                  certBody: 'NPOP' },
  { name: 'Deepak Yadav',       email: 'deepak@cropbid.test',    phone: '+91-9876543222', location: 'Bhopal',        state: 'Madhya Pradesh', farmSize: 22, crops: ['wheat', 'soybean', 'gram'],              organic: false, fpo: null,                      apmc: 'MP-APMC-2024-8901' },
  { name: 'Sunita Patil',       email: 'sunita@cropbid.test',    phone: '+91-9876543223', location: 'Pune',          state: 'Maharashtra',    farmSize: 9,  crops: ['sugarcane', 'onion', 'pomegranate'],     organic: true,  fpo: 'Pune Organic Collective', apmc: 'MH-APMC-2024-5670', certBody: 'NPOP' },
  { name: 'Ravi Kumar',         email: 'ravi@cropbid.test',      phone: '+91-9876543224', location: 'Mysore',        state: 'Karnataka',      farmSize: 11, crops: ['rice', 'ragi', 'coconut'],               organic: false, fpo: null,                      apmc: 'KA-APMC-2024-1230' },
];

// ---------------------------------------------------------------------------
// Global Farmers (5) — showing international reach
// ---------------------------------------------------------------------------
const globalFarmers = [
  { name: 'John Miller',        email: 'john@cropbid.test',      phone: '+1-555-0101',    location: 'Des Moines',    state: 'Iowa',           country: 'USA',       currency: 'USD' as const, farmSize: 200, crops: ['corn', 'soybean'],                organic: false, certBody: null },
  { name: 'Sarah Thompson',     email: 'sarah@cropbid.test',     phone: '+1-555-0102',    location: 'Sacramento',    state: 'California',     country: 'USA',       currency: 'USD' as const, farmSize: 80,  crops: ['almond', 'grape', 'tomato'],     organic: true,  certBody: 'USDA Organic' },
  { name: 'Carlos Silva',       email: 'carlos@cropbid.test',    phone: '+55-11-99999',   location: 'São Paulo',     state: 'São Paulo',      country: 'Brazil',    currency: 'USD' as const, farmSize: 150, crops: ['coffee', 'sugarcane', 'soybean'], organic: false, certBody: null },
  { name: 'James Mwangi',       email: 'james@cropbid.test',     phone: '+254-700-1234',  location: 'Nairobi',       state: 'Central',        country: 'Kenya',     currency: 'USD' as const, farmSize: 40,  crops: ['tea', 'coffee', 'avocado'],      organic: true,  certBody: 'EU Organic' },
  { name: 'Michael O\'Brien',   email: 'michael@cropbid.test',   phone: '+61-400-1234',   location: 'Perth',         state: 'Western Australia', country: 'Australia', currency: 'USD' as const, farmSize: 500, crops: ['wheat', 'barley', 'canola'],     organic: false, certBody: null },
];

// ---------------------------------------------------------------------------
// Indian Buyers (7)
// ---------------------------------------------------------------------------
const indianBuyers = [
  { name: 'Vikram Agarwal',     email: 'vikram@cropbid.test',    phone: '+91-9800000001', location: 'Mumbai',    state: 'Maharashtra',    company: 'Agri Foods Pvt Ltd',     type: 'PROCESSOR'  as const, taxId: '27AABCA1234A1ZA', volume: '5000-10000 tonnes' },
  { name: 'Ananya Iyer',        email: 'ananya@cropbid.test',    phone: '+91-9800000002', location: 'Chennai',   state: 'Tamil Nadu',     company: 'South Spice Exports',    type: 'EXPORTER'   as const, taxId: '33BBCDE5678B2ZB', volume: '2000-5000 tonnes' },
  { name: 'Rohit Gupta',        email: 'rohit@cropbid.test',     phone: '+91-9800000003', location: 'Delhi',     state: 'Delhi',          company: 'Fresh Basket Retail',    type: 'RETAILER'   as const, taxId: '07CDEFG9012C3ZC', volume: '1000-3000 tonnes' },
  { name: 'Neha Kapoor',        email: 'neha@cropbid.test',      phone: '+91-9800000004', location: 'Bangalore', state: 'Karnataka',      company: 'Kapoor Restaurant Chain', type: 'RESTAURANT' as const, taxId: '29DEFGH3456D4ZD', volume: '500-1000 tonnes' },
  { name: 'Suresh Bansal',      email: 'suresh@cropbid.test',    phone: '+91-9800000005', location: 'Delhi',     state: 'Delhi',          company: 'Indian FMCG Corp',       type: 'FMCG'       as const, taxId: '07EFGHI7890E5ZE', volume: '10000-20000 tonnes' },
  { name: 'Meera Joshi',        email: 'meera@cropbid.test',     phone: '+91-9800000006', location: 'Pune',      state: 'Maharashtra',    company: 'Western Agro Processors', type: 'PROCESSOR' as const, taxId: '27FGHIJ1234F6ZF', volume: '3000-7000 tonnes' },
  { name: 'Arjun Malhotra',     email: 'arjun@cropbid.test',     phone: '+91-9800000007', location: 'Kolkata',   state: 'West Bengal',    company: 'Eastern Commodities Ltd', type: 'EXPORTER'  as const, taxId: '19GHIJK5678G7ZG', volume: '4000-8000 tonnes' },
];

// ---------------------------------------------------------------------------
// Global Buyers (3)
// ---------------------------------------------------------------------------
const globalBuyers = [
  { name: 'David Chen',         email: 'david@cropbid.test',     phone: '+1-555-0201',    location: 'Chicago',   state: 'Illinois',       country: 'USA', currency: 'USD' as const, company: 'Global Foods Inc',     type: 'PROCESSOR' as const, taxId: 'EIN-12-3456789', volume: '20000-50000 tonnes' },
  { name: 'Emma Williams',      email: 'emma@cropbid.test',      phone: '+44-20-7890',    location: 'London',    state: 'England',        country: 'UK',  currency: 'GBP' as const, company: 'British Harvest Retail', type: 'RETAILER' as const, taxId: 'GB-123-4567-89', volume: '5000-15000 tonnes' },
  { name: 'Ahmed Al-Rashid',    email: 'ahmed@cropbid.test',     phone: '+971-50-1234',   location: 'Dubai',     state: 'Dubai',          country: 'UAE', currency: 'USD' as const, company: 'Gulf Trading Co',      type: 'EXPORTER'  as const, taxId: 'UAE-TRN-100234', volume: '10000-30000 tonnes' },
];

// ---------------------------------------------------------------------------
// Indian Crop Listings (40) — realistic mandi prices
// ---------------------------------------------------------------------------
interface ListingData {
  crop: string;
  variety: string;
  quantity: number;
  unit: 'KG' | 'QUINTAL' | 'TONNE';
  grade: 'A' | 'B' | 'C';
  minPrice: number;
  maxPrice: number;
  organic: boolean;
  description: string;
}

const indianListings: ListingData[] = [
  // Rice varieties
  { crop: 'Rice',       variety: 'Basmati',       quantity: 200, unit: 'QUINTAL', grade: 'A', minPrice: 3200, maxPrice: 3800, organic: false, description: 'Premium Basmati rice from Punjab, aged 1 year. Long grain, aromatic.' },
  { crop: 'Rice',       variety: 'Sona Masoori',  quantity: 150, unit: 'QUINTAL', grade: 'A', minPrice: 2800, maxPrice: 3200, organic: false, description: 'Sona Masoori rice, lightweight and aromatic. Ideal for daily consumption.' },
  { crop: 'Rice',       variety: 'Basmati',       quantity: 100, unit: 'QUINTAL', grade: 'B', minPrice: 2600, maxPrice: 3000, organic: false, description: 'Standard Basmati rice, good grain length.' },
  { crop: 'Rice',       variety: 'Ponni',         quantity: 80,  unit: 'QUINTAL', grade: 'A', minPrice: 2400, maxPrice: 2800, organic: true,  description: 'Organic Ponni rice from Tamil Nadu. NPOP certified.' },

  // Wheat varieties
  { crop: 'Wheat',      variety: 'Sharbati',      quantity: 300, unit: 'QUINTAL', grade: 'A', minPrice: 2400, maxPrice: 2800, organic: false, description: 'Sharbati wheat from MP, golden color, high protein content.' },
  { crop: 'Wheat',      variety: 'Lok-1',         quantity: 250, unit: 'QUINTAL', grade: 'B', minPrice: 2100, maxPrice: 2500, organic: false, description: 'Lok-1 wheat variety, good for chapati and bread making.' },
  { crop: 'Wheat',      variety: 'HD-2967',       quantity: 400, unit: 'QUINTAL', grade: 'A', minPrice: 2200, maxPrice: 2600, organic: false, description: 'High-yielding wheat variety from Punjab. Excellent for flour.' },
  { crop: 'Wheat',      variety: 'Sharbati',      quantity: 150, unit: 'QUINTAL', grade: 'A', minPrice: 2800, maxPrice: 3200, organic: true,  description: 'Organic Sharbati wheat, stone-ground ready.' },

  // Cotton
  { crop: 'Cotton',     variety: 'Shankar-6',     quantity: 100, unit: 'QUINTAL', grade: 'A', minPrice: 6200, maxPrice: 6800, organic: false, description: 'Shankar-6 cotton, long staple, high quality lint.' },
  { crop: 'Cotton',     variety: 'DCH-32',        quantity: 80,  unit: 'QUINTAL', grade: 'B', minPrice: 5800, maxPrice: 6200, organic: false, description: 'DCH-32 hybrid cotton, good fiber strength.' },
  { crop: 'Cotton',     variety: 'Shankar-6',     quantity: 120, unit: 'QUINTAL', grade: 'A', minPrice: 6000, maxPrice: 6600, organic: false, description: 'Premium cotton from Gujarat, ready for spinning mills.' },

  // Soybean
  { crop: 'Soybean',    variety: 'JS-335',        quantity: 200, unit: 'QUINTAL', grade: 'A', minPrice: 4200, maxPrice: 4800, organic: false, description: 'JS-335 soybean, high oil content (20%). Ideal for oil extraction.' },
  { crop: 'Soybean',    variety: 'JS-9560',       quantity: 150, unit: 'QUINTAL', grade: 'B', minPrice: 3800, maxPrice: 4200, organic: false, description: 'High-yielding soybean variety from central India.' },

  // Sugarcane
  { crop: 'Sugarcane',  variety: 'Co-86032',      quantity: 500, unit: 'TONNE',   grade: 'A', minPrice: 350,  maxPrice: 420,  organic: false, description: 'High-sucrose sugarcane variety, 14% sugar recovery.' },
  { crop: 'Sugarcane',  variety: 'CoM-0265',      quantity: 300, unit: 'TONNE',   grade: 'B', minPrice: 310,  maxPrice: 370,  organic: false, description: 'Early maturing sugarcane, suitable for jaggery production.' },

  // Turmeric
  { crop: 'Turmeric',   variety: 'Salem',         quantity: 50,  unit: 'QUINTAL', grade: 'A', minPrice: 8500, maxPrice: 9500, organic: true,  description: 'Salem turmeric, high curcumin content (5%+). Organic certified.' },
  { crop: 'Turmeric',   variety: 'Erode',         quantity: 40,  unit: 'QUINTAL', grade: 'A', minPrice: 8000, maxPrice: 9000, organic: false, description: 'Erode finger turmeric, bright yellow, aromatic.' },
  { crop: 'Turmeric',   variety: 'Rajapore',      quantity: 60,  unit: 'QUINTAL', grade: 'B', minPrice: 7000, maxPrice: 8000, organic: false, description: 'Rajapore turmeric from Maharashtra, good for powder production.' },

  // Onion
  { crop: 'Onion',      variety: 'Nashik Red',    quantity: 100, unit: 'QUINTAL', grade: 'A', minPrice: 1800, maxPrice: 2400, organic: false, description: 'Nashik red onion, firm, long shelf life. Export quality.' },
  { crop: 'Onion',      variety: 'Bellary',       quantity: 80,  unit: 'QUINTAL', grade: 'B', minPrice: 1400, maxPrice: 1800, organic: false, description: 'Bellary onion from Karnataka, medium size, good taste.' },

  // Tomato
  { crop: 'Tomato',     variety: 'Hybrid',        quantity: 60,  unit: 'QUINTAL', grade: 'A', minPrice: 1200, maxPrice: 2000, organic: false, description: 'Hybrid tomatoes, firm and red, suitable for processing.' },
  { crop: 'Tomato',     variety: 'Desi',          quantity: 40,  unit: 'QUINTAL', grade: 'B', minPrice: 800,  maxPrice: 1400, organic: true,  description: 'Organic desi tomatoes, rich flavor for cooking.' },

  // Chana Dal (Chickpea)
  { crop: 'Chana Dal',  variety: 'Desi',          quantity: 100, unit: 'QUINTAL', grade: 'A', minPrice: 5200, maxPrice: 5800, organic: false, description: 'Desi chana, high protein, split dal ready.' },
  { crop: 'Chana Dal',  variety: 'Kabuli',        quantity: 60,  unit: 'QUINTAL', grade: 'A', minPrice: 6500, maxPrice: 7200, organic: false, description: 'Kabuli chana, large grain, premium quality for retail.' },

  // Mustard
  { crop: 'Mustard',    variety: 'Yellow',        quantity: 80,  unit: 'QUINTAL', grade: 'A', minPrice: 5000, maxPrice: 5600, organic: false, description: 'Yellow mustard seeds, high oil content (38-40%).' },
  { crop: 'Mustard',    variety: 'Black',         quantity: 50,  unit: 'QUINTAL', grade: 'B', minPrice: 4800, maxPrice: 5200, organic: false, description: 'Black mustard for oil pressing, strong flavor.' },

  // Coffee
  { crop: 'Coffee',     variety: 'Arabica',       quantity: 30,  unit: 'QUINTAL', grade: 'A', minPrice: 18000, maxPrice: 22000, organic: true,  description: 'Arabica coffee beans from Coorg, shade-grown organic.' },
  { crop: 'Coffee',     variety: 'Robusta',       quantity: 50,  unit: 'QUINTAL', grade: 'B', minPrice: 12000, maxPrice: 15000, organic: false, description: 'Robusta coffee beans, strong body, good for blends.' },

  // Pepper & Spices
  { crop: 'Black Pepper', variety: 'Malabar',     quantity: 20,  unit: 'QUINTAL', grade: 'A', minPrice: 42000, maxPrice: 48000, organic: true,  description: 'Malabar black pepper, bold grade, high piperine content.' },
  { crop: 'Cardamom',    variety: 'Green',        quantity: 10,  unit: 'QUINTAL', grade: 'A', minPrice: 120000, maxPrice: 140000, organic: false, description: 'Green cardamom from Kerala, bold 8mm+, intense aroma.' },

  // Other crops
  { crop: 'Groundnut',  variety: 'Bold',          quantity: 100, unit: 'QUINTAL', grade: 'A', minPrice: 5500, maxPrice: 6200, organic: false, description: 'Bold groundnut from Gujarat, 45% oil content.' },
  { crop: 'Coconut',    variety: 'Hybrid',        quantity: 5000, unit: 'KG',     grade: 'A', minPrice: 25,   maxPrice: 32,   organic: false, description: 'Fresh mature coconuts from Kerala, good copra yield.' },
  { crop: 'Banana',     variety: 'Cavendish',     quantity: 200, unit: 'QUINTAL', grade: 'A', minPrice: 1200, maxPrice: 1600, organic: false, description: 'Cavendish banana from Tamil Nadu, export quality.' },
  { crop: 'Potato',     variety: 'Kufri Jyoti',   quantity: 150, unit: 'QUINTAL', grade: 'B', minPrice: 800,  maxPrice: 1200, organic: false, description: 'Kufri Jyoti potatoes from UP, good for chips and cooking.' },
  { crop: 'Chili',      variety: 'Guntur Sannam', quantity: 30,  unit: 'QUINTAL', grade: 'A', minPrice: 14000, maxPrice: 18000, organic: false, description: 'Guntur Sannam dried red chili, high SHU, deep red color.' },
  { crop: 'Pomegranate', variety: 'Bhagwa',       quantity: 40,  unit: 'QUINTAL', grade: 'A', minPrice: 8000, maxPrice: 10000, organic: true,  description: 'Bhagwa pomegranate from Maharashtra, ruby red arils.' },
  { crop: 'Castor',     variety: 'GCH-7',         quantity: 80,  unit: 'QUINTAL', grade: 'B', minPrice: 5800, maxPrice: 6400, organic: false, description: 'Castor seeds for oil extraction, high oil yield.' },
  { crop: 'Bajra',      variety: 'HHB-67',        quantity: 100, unit: 'QUINTAL', grade: 'B', minPrice: 2100, maxPrice: 2500, organic: false, description: 'Pearl millet from Rajasthan, drought-resistant variety.' },
  { crop: 'Ragi',       variety: 'GPU-28',        quantity: 60,  unit: 'QUINTAL', grade: 'A', minPrice: 3200, maxPrice: 3800, organic: true,  description: 'Organic finger millet from Karnataka, high calcium content.' },
  { crop: 'Gram',       variety: 'JG-11',         quantity: 80,  unit: 'QUINTAL', grade: 'A', minPrice: 4800, maxPrice: 5400, organic: false, description: 'Bengal gram from MP, bold seeds, suitable for besan production.' },
];

// ---------------------------------------------------------------------------
// Global Listings (10)
// ---------------------------------------------------------------------------
const globalListings: (ListingData & { country: string; state: string; currency: 'USD' | 'GBP' })[] = [
  { crop: 'Corn',       variety: 'Yellow Dent',   quantity: 1000, unit: 'TONNE', grade: 'A', minPrice: 180, maxPrice: 220, organic: false, description: 'Yellow dent corn from Iowa, #2 grade, suitable for feed and ethanol.', country: 'USA', state: 'Iowa', currency: 'USD' },
  { crop: 'Soybean',    variety: 'Pioneer',       quantity: 500,  unit: 'TONNE', grade: 'A', minPrice: 380, maxPrice: 440, organic: false, description: 'Pioneer soybean, high protein content, non-GMO.', country: 'USA', state: 'Iowa', currency: 'USD' },
  { crop: 'Almond',     variety: 'Nonpareil',     quantity: 50,   unit: 'TONNE', grade: 'A', minPrice: 6000, maxPrice: 7500, organic: true, description: 'California Nonpareil almonds, USDA Organic certified.', country: 'USA', state: 'California', currency: 'USD' },
  { crop: 'Coffee',     variety: 'Santos',        quantity: 100,  unit: 'TONNE', grade: 'A', minPrice: 3200, maxPrice: 3800, organic: false, description: 'Santos coffee beans from Brazil, medium body, nutty flavor.', country: 'Brazil', state: 'São Paulo', currency: 'USD' },
  { crop: 'Sugarcane',  variety: 'SP80-1816',     quantity: 2000, unit: 'TONNE', grade: 'B', minPrice: 28,  maxPrice: 35,  organic: false, description: 'Brazilian sugarcane for ethanol and sugar production.', country: 'Brazil', state: 'São Paulo', currency: 'USD' },
  { crop: 'Tea',        variety: 'KTDA Purple',   quantity: 20,   unit: 'TONNE', grade: 'A', minPrice: 2800, maxPrice: 3500, organic: true, description: 'Kenyan purple tea, high anthocyanin, EU Organic.', country: 'Kenya', state: 'Central', currency: 'USD' },
  { crop: 'Coffee',     variety: 'AA',            quantity: 30,   unit: 'TONNE', grade: 'A', minPrice: 4500, maxPrice: 5500, organic: false, description: 'Kenya AA coffee beans, bright acidity, berry notes.', country: 'Kenya', state: 'Central', currency: 'USD' },
  { crop: 'Wheat',      variety: 'ASW',           quantity: 800,  unit: 'TONNE', grade: 'A', minPrice: 280, maxPrice: 340, organic: false, description: 'Australian Standard White wheat, high protein.', country: 'Australia', state: 'Western Australia', currency: 'USD' },
  { crop: 'Barley',     variety: 'Bass',          quantity: 400,  unit: 'TONNE', grade: 'B', minPrice: 240, maxPrice: 290, organic: false, description: 'Bass barley for malting and feed.', country: 'Australia', state: 'Western Australia', currency: 'USD' },
  { crop: 'Grape',      variety: 'Thompson',      quantity: 30,   unit: 'TONNE', grade: 'A', minPrice: 1800, maxPrice: 2200, organic: true, description: 'Thompson Seedless table grapes, USDA Organic.', country: 'USA', state: 'California', currency: 'USD' },
];

// =============================================================================
// MAIN SEED FUNCTION
// =============================================================================
async function main() {
  console.log('🌱 Starting CropBid database seed...\n');

  // Clean existing data (order matters due to foreign keys)
  console.log('  Cleaning existing data...');
  await prisma.shipment.deleteMany();
  await prisma.logisticsPartner.deleteMany();
  await prisma.waitlist.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.negotiation.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.bid.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.agentConfig.deleteMany();
  await prisma.buyerProfile.deleteMany();
  await prisma.farmerProfile.deleteMany();
  await prisma.user.deleteMany();

  const hashedPassword = await hashPassword(DEFAULT_PASSWORD);

  // =========================================================================
  // 1. Create Admin Users
  // =========================================================================
  console.log('  Creating admin users...');
  const admin = await prisma.user.create({
    data: {
      name: 'CropBid Admin',
      email: 'admin@cropbid.test',
      password: hashedPassword,
      role: 'ADMIN',
      phone: '+91-9000000000',
      location: 'Mumbai',
      country: 'India',
      trustScore: 100,
    },
  });

  // =========================================================================
  // 2. Create Indian Farmers + Profiles
  // =========================================================================
  console.log('  Creating 15 Indian farmers...');
  const farmerUsers: any[] = [];
  const farmerProfiles: any[] = [];

  for (const f of indianFarmers) {
    const user = await prisma.user.create({
      data: {
        name: f.name,
        email: f.email,
        password: hashedPassword,
        role: 'FARMER',
        phone: f.phone,
        location: f.location,
        country: 'India',
        currency: 'INR',
        trustScore: 40 + Math.random() * 40, // 40-80 range
      },
    });

    const profile = await prisma.farmerProfile.create({
      data: {
        userId: user.id,
        farmSizeAcres: f.farmSize,
        cropsGrown: f.crops,
        country: 'India',
        state: f.state,
        fpoName: f.fpo,
        apmcLicense: f.apmc,
        organicCertified: f.organic,
        certificationBody: (f as any).certBody || null,
        verified: Math.random() > 0.3, // 70% verified
      },
    });

    farmerUsers.push(user);
    farmerProfiles.push(profile);
  }

  // =========================================================================
  // 3. Create Global Farmers + Profiles
  // =========================================================================
  console.log('  Creating 5 global farmers...');
  for (const f of globalFarmers) {
    const user = await prisma.user.create({
      data: {
        name: f.name,
        email: f.email,
        password: hashedPassword,
        role: 'FARMER',
        phone: f.phone,
        location: f.location,
        country: f.country,
        currency: f.currency,
        trustScore: 50 + Math.random() * 30,
      },
    });

    const profile = await prisma.farmerProfile.create({
      data: {
        userId: user.id,
        farmSizeAcres: f.farmSize,
        cropsGrown: f.crops,
        country: f.country,
        state: f.state,
        organicCertified: f.organic,
        certificationBody: f.certBody,
        verified: Math.random() > 0.4,
      },
    });

    farmerUsers.push(user);
    farmerProfiles.push(profile);
  }

  // =========================================================================
  // 4. Create Indian Buyers + Profiles
  // =========================================================================
  console.log('  Creating 7 Indian buyers...');
  const buyerUsers: any[] = [];

  for (const b of indianBuyers) {
    const user = await prisma.user.create({
      data: {
        name: b.name,
        email: b.email,
        password: hashedPassword,
        role: 'BUYER',
        phone: b.phone,
        location: b.location,
        country: 'India',
        currency: 'INR',
        trustScore: 50 + Math.random() * 35,
      },
    });

    await prisma.buyerProfile.create({
      data: {
        userId: user.id,
        companyName: b.company,
        companyType: b.type,
        country: 'India',
        taxId: b.taxId,
        annualProcurementVolume: b.volume,
        verified: Math.random() > 0.2,
      },
    });

    buyerUsers.push(user);
  }

  // =========================================================================
  // 5. Create Global Buyers + Profiles
  // =========================================================================
  console.log('  Creating 3 global buyers...');
  for (const b of globalBuyers) {
    const user = await prisma.user.create({
      data: {
        name: b.name,
        email: b.email,
        password: hashedPassword,
        role: 'BUYER',
        phone: b.phone,
        location: b.location,
        country: b.country,
        currency: b.currency,
        trustScore: 55 + Math.random() * 30,
      },
    });

    await prisma.buyerProfile.create({
      data: {
        userId: user.id,
        companyName: b.company,
        companyType: b.type,
        country: b.country,
        taxId: b.taxId,
        annualProcurementVolume: b.volume,
        verified: true,
      },
    });

    buyerUsers.push(user);
  }

  // =========================================================================
  // 6. Create Indian Listings (40)
  // =========================================================================
  console.log('  Creating 40 Indian crop listings...');
  const allListings: any[] = [];

  for (let i = 0; i < indianListings.length; i++) {
    const l = indianListings[i];
    // Distribute listings across Indian farmers (round-robin)
    const farmerProfile = farmerProfiles[i % 15]; // first 15 are Indian
    const farmerUser = farmerUsers[i % 15];

    const listing = await prisma.listing.create({
      data: {
        farmerId: farmerProfile.id,
        cropName: l.crop,
        cropVariety: l.variety,
        quantity: l.quantity,
        unit: l.unit,
        qualityGrade: l.grade,
        pricePerUnitMin: l.minPrice,
        pricePerUnitMax: l.maxPrice,
        currency: 'INR',
        harvestDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // last 30 days
        expiryDate: new Date(Date.now() + (30 + Math.random() * 60) * 24 * 60 * 60 * 1000), // 30-90 days out
        description: l.description,
        images: [],
        organic: l.organic,
        location: farmerUser.location,
        country: 'India',
        state: farmerProfile.state,
        status: i < 35 ? 'ACTIVE' : (i < 38 ? 'IN_AUCTION' : 'SOLD'), // mostly active
      },
    });

    allListings.push(listing);
  }

  // =========================================================================
  // 7. Create Global Listings (10)
  // =========================================================================
  console.log('  Creating 10 global listings...');
  for (let i = 0; i < globalListings.length; i++) {
    const l = globalListings[i];
    // Distribute across global farmers (indices 15-19)
    const farmerIdx = 15 + (i % 5);
    const farmerProfile = farmerProfiles[farmerIdx];

    const listing = await prisma.listing.create({
      data: {
        farmerId: farmerProfile.id,
        cropName: l.crop,
        cropVariety: l.variety,
        quantity: l.quantity,
        unit: l.unit,
        qualityGrade: l.grade,
        pricePerUnitMin: l.minPrice,
        pricePerUnitMax: l.maxPrice,
        currency: l.currency,
        harvestDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        expiryDate: new Date(Date.now() + (30 + Math.random() * 60) * 24 * 60 * 60 * 1000),
        description: l.description,
        images: [],
        organic: l.organic,
        location: l.country === 'USA' ? (l.state === 'Iowa' ? 'Des Moines' : 'Sacramento') : l.state,
        country: l.country,
        state: l.state,
        status: 'ACTIVE',
      },
    });

    allListings.push(listing);
  }

  // =========================================================================
  // 8. Create Agent Configs (30)
  // =========================================================================
  console.log('  Creating 30 agent configs...');
  const styles: ('AGGRESSIVE' | 'BALANCED' | 'CONSERVATIVE')[] = ['AGGRESSIVE', 'BALANCED', 'CONSERVATIVE'];
  const allAgentConfigs: any[] = [];

  // Farmer agents
  for (let i = 0; i < farmerUsers.length; i++) {
    const config = await prisma.agentConfig.create({
      data: {
        userId: farmerUsers[i].id,
        agentType: 'FARMER_AGENT',
        autoNegotiate: Math.random() > 0.3,
        active: Math.random() > 0.2,
        minPrice: indianListings[i % indianListings.length]?.minPrice || 2000,
        preferredCrops: [],
        negotiationStyle: styles[i % 3],
        autoAcceptThreshold: (indianListings[i % indianListings.length]?.maxPrice || 3000) * 0.95,
      },
    });
    allAgentConfigs.push(config);
  }

  // Buyer agents
  for (let i = 0; i < buyerUsers.length; i++) {
    const config = await prisma.agentConfig.create({
      data: {
        userId: buyerUsers[i].id,
        agentType: 'BUYER_AGENT',
        autoNegotiate: Math.random() > 0.4,
        active: Math.random() > 0.3,
        maxPrice: 5000 + Math.random() * 5000,
        preferredCrops: ['rice', 'wheat', 'soybean', 'cotton'].slice(0, 2 + Math.floor(Math.random() * 3)),
        negotiationStyle: styles[i % 3],
        qualityRequirements: { minGrade: i % 2 === 0 ? 'A' : 'B', maxMoisture: 12 + Math.floor(Math.random() * 4) },
        maxDistanceKm: 200 + Math.floor(Math.random() * 800),
      },
    });
    allAgentConfigs.push(config);
  }

  // =========================================================================
  // 9. Create Bids (20)
  // =========================================================================
  console.log('  Creating 20 sample bids...');
  const bidStatuses: ('PENDING' | 'ACCEPTED' | 'REJECTED' | 'COUNTERED')[] = ['PENDING', 'ACCEPTED', 'REJECTED', 'COUNTERED'];
  const allBids: any[] = [];

  for (let i = 0; i < 20; i++) {
    const listing = allListings[i % allListings.length];
    const buyer = buyerUsers[i % buyerUsers.length];

    // Bid somewhere between min and max price
    const bidPrice = listing.pricePerUnitMin + Math.random() * (listing.pricePerUnitMax - listing.pricePerUnitMin);
    const roundedBidPrice = Math.round(bidPrice / 10) * 10; // Round to nearest 10

    const bid = await prisma.bid.create({
      data: {
        listingId: listing.id,
        buyerId: buyer.id,
        bidPricePerUnit: roundedBidPrice,
        totalAmount: roundedBidPrice * listing.quantity,
        quantity: listing.quantity,
        currency: listing.currency,
        message: i % 3 === 0 ? 'Interested in bulk purchase. Can arrange own transport.' : null,
        isAgentBid: i % 2 === 0,
        status: bidStatuses[i % 4],
        counterPrice: bidStatuses[i % 4] === 'COUNTERED' ? roundedBidPrice * 1.05 : null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    allBids.push(bid);
  }

  // =========================================================================
  // 10. Create Negotiations (5)
  // =========================================================================
  console.log('  Creating 5 sample negotiations...');

  for (let i = 0; i < 5; i++) {
    const listing = allListings[i];
    const bid = allBids[i];
    const farmerAgent = allAgentConfigs[i % farmerUsers.length];
    const buyerAgent = allAgentConfigs[farmerUsers.length + (i % buyerUsers.length)];

    const basePrice = listing.pricePerUnitMin;
    const outcomes: ('DEAL' | 'NO_DEAL' | 'IN_PROGRESS')[] = ['DEAL', 'DEAL', 'NO_DEAL', 'IN_PROGRESS', 'IN_PROGRESS'];

    // Build realistic negotiation rounds
    const rounds = [];
    let currentPrice = basePrice * 0.85;

    for (let r = 0; r < (outcomes[i] === 'IN_PROGRESS' ? 2 : 3); r++) {
      // Buyer offers
      rounds.push({
        round: r + 1,
        from: 'buyer_agent',
        action: r === 2 && outcomes[i] === 'DEAL' ? 'accept' : 'counter',
        price: Math.round(currentPrice),
        reasoning: r === 0
          ? `Starting with a competitive offer based on current market rates for ${listing.cropName}.`
          : `Increasing offer by 5% to move closer to agreement.`,
      });

      currentPrice *= 1.05;

      if (r === 2 && outcomes[i] === 'DEAL') break;

      // Farmer responds
      rounds.push({
        round: r + 1,
        from: 'farmer_agent',
        action: r === 2 && outcomes[i] === 'NO_DEAL' ? 'reject' : 'counter',
        price: Math.round(listing.pricePerUnitMax * (1 - r * 0.05)),
        reasoning: r === 0
          ? `The offer is below our minimum. Countering with a price reflecting the quality grade ${listing.qualityGrade}.`
          : `Reducing ask by 5% as a goodwill gesture, but cannot go lower.`,
      });
    }

    await prisma.negotiation.create({
      data: {
        listingId: listing.id,
        bidId: bid.id,
        farmerAgentId: farmerAgent.id,
        buyerAgentId: buyerAgent.id,
        rounds: rounds,
        finalOutcome: outcomes[i],
        startedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        endedAt: outcomes[i] !== 'IN_PROGRESS' ? new Date() : null,
      },
    });
  }

  // =========================================================================
  // 11. Create Transactions (10)
  // =========================================================================
  console.log('  Creating 10 sample transactions...');
  const paymentStatuses: ('ESCROW' | 'RELEASED' | 'REFUNDED')[] = ['ESCROW', 'RELEASED', 'RELEASED', 'RELEASED', 'ESCROW'];
  const deliveryStatuses: ('PENDING' | 'IN_TRANSIT' | 'DELIVERED' | 'CONFIRMED')[] = ['PENDING', 'IN_TRANSIT', 'DELIVERED', 'CONFIRMED', 'PENDING'];

  for (let i = 0; i < 10; i++) {
    const listing = allListings[5 + i]; // Use different listings than negotiations
    const bid = allBids[5 + i];
    const farmer = farmerUsers[(5 + i) % farmerUsers.length];
    const buyer = buyerUsers[i % buyerUsers.length];

    const finalPrice = listing.pricePerUnitMin + (listing.pricePerUnitMax - listing.pricePerUnitMin) * 0.7;
    const totalAmount = finalPrice * listing.quantity;
    const platformFee = totalAmount * 0.02;

    await prisma.transaction.create({
      data: {
        listingId: listing.id,
        bidId: bid.id,
        farmerId: farmer.id,
        buyerId: buyer.id,
        finalPricePerUnit: Math.round(finalPrice),
        totalAmount: Math.round(totalAmount),
        currency: listing.currency,
        platformFeePercent: 2.0,
        platformFeeAmount: Math.round(platformFee),
        paymentStatus: paymentStatuses[i % 5],
        deliveryStatus: deliveryStatuses[i % 5],
      },
    });
  }

  // =========================================================================
  // 12. Create Notifications (sample)
  // =========================================================================
  console.log('  Creating sample notifications...');
  const notificationTypes = [
    { type: 'NEW_BID', title: 'New bid received!', message: 'You received a new bid of ₹3,200/quintal on your Rice listing.' },
    { type: 'BID_ACCEPTED', title: 'Your bid was accepted!', message: 'Congratulations! The farmer accepted your bid for Wheat.' },
    { type: 'AGENT_ACTION', title: 'Your AI agent made a decision', message: 'Your agent counter-offered ₹2,800/quintal for Soybean.' },
    { type: 'TRANSACTION_UPDATE', title: 'Payment released', message: 'Payment of ₹48,000 has been released to your account.' },
    { type: 'PROFILE_VERIFIED', title: 'Profile verified!', message: 'Your farmer profile has been verified by CropBid admin.' },
  ];

  for (let i = 0; i < 20; i++) {
    const user = [...farmerUsers, ...buyerUsers][i % (farmerUsers.length + buyerUsers.length)];
    const notif = notificationTypes[i % notificationTypes.length];

    await prisma.notification.create({
      data: {
        userId: user.id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        read: Math.random() > 0.5,
      },
    });
  }

  // =========================================================================
  // 12. Logistics Partners (8)
  // =========================================================================
  const logisticsPartners = await Promise.all([
    prisma.logisticsPartner.create({
      data: {
        name: 'SpeedHaul Logistics',
        type: 'TRUCKING',
        coverageRegions: ['Maharashtra', 'Gujarat', 'Karnataka', 'Rajasthan', 'Madhya Pradesh'],
        coverageCountries: ['India'],
        vehicleTypes: ['10-ton truck', '20-ton truck'],
        minQuantityKg: 500, maxQuantityKg: 50000,
        costPerKmPerKg: 0.003, avgDeliveryDays: 3, rating: 4.2,
        contactEmail: 'ops@speedhaul.in', contactPhone: '+91-9000000001',
        commissionPercent: 7.5,
      },
    }),
    prisma.logisticsPartner.create({
      data: {
        name: 'ColdChain Express',
        type: 'COLD_CHAIN',
        coverageRegions: ['Maharashtra', 'Delhi', 'Tamil Nadu', 'Karnataka', 'Kerala'],
        coverageCountries: ['India'],
        vehicleTypes: ['Reefer Van', 'Cold Truck'],
        minQuantityKg: 200, maxQuantityKg: 20000,
        costPerKmPerKg: 0.008, avgDeliveryDays: 2, rating: 4.5,
        contactEmail: 'dispatch@coldchain.in', contactPhone: '+91-9000000002',
        commissionPercent: 8.0,
      },
    }),
    prisma.logisticsPartner.create({
      data: {
        name: 'Kisan Transport Co',
        type: 'LOCAL',
        coverageRegions: ['Punjab', 'Haryana', 'Uttar Pradesh', 'Delhi'],
        coverageCountries: ['India'],
        vehicleTypes: ['Tractor Trolley', 'Mini Truck'],
        minQuantityKg: 100, maxQuantityKg: 10000,
        costPerKmPerKg: 0.002, avgDeliveryDays: 1, rating: 3.8,
        contactEmail: 'book@kisantransport.in', contactPhone: '+91-9000000003',
        commissionPercent: 6.0,
      },
    }),
    prisma.logisticsPartner.create({
      data: {
        name: 'BharatFreight',
        type: 'FREIGHT',
        coverageRegions: ['Maharashtra', 'Gujarat', 'Karnataka', 'Tamil Nadu', 'Delhi', 'Punjab', 'Uttar Pradesh', 'Andhra Pradesh', 'Telangana', 'West Bengal'],
        coverageCountries: ['India'],
        vehicleTypes: ['Container', 'Flatbed', '40ft Trailer'],
        minQuantityKg: 5000, maxQuantityKg: 100000,
        costPerKmPerKg: 0.0015, avgDeliveryDays: 5, rating: 4.0,
        contactEmail: 'logistics@bharatfreight.in', contactPhone: '+91-9000000004',
        commissionPercent: 5.0,
      },
    }),
    prisma.logisticsPartner.create({
      data: {
        name: 'Global Agri Shipping',
        type: 'EXPORT',
        coverageRegions: [],
        coverageCountries: ['India', 'USA', 'Kenya', 'Brazil', 'Australia', 'UK', 'UAE'],
        vehicleTypes: ['Container Ship', 'Air Cargo'],
        minQuantityKg: 10000, maxQuantityKg: 500000,
        costPerKmPerKg: 0.01, avgDeliveryDays: 21, rating: 4.3,
        contactEmail: 'trade@globalagrishipping.com', contactPhone: '+91-9000000005',
        commissionPercent: 10.0,
      },
    }),
    prisma.logisticsPartner.create({
      data: {
        name: 'MidWest Haulers',
        type: 'TRUCKING',
        coverageRegions: ['Iowa', 'Illinois', 'Indiana', 'Ohio'],
        coverageCountries: ['USA'],
        vehicleTypes: ['Semi Truck', 'Grain Hopper'],
        minQuantityKg: 5000, maxQuantityKg: 100000,
        costPerKmPerKg: 0.001, avgDeliveryDays: 2, rating: 4.1,
        contactEmail: 'dispatch@midwesthaulers.com', contactPhone: '+1-5551234567',
        commissionPercent: 7.0,
      },
    }),
    prisma.logisticsPartner.create({
      data: {
        name: 'FreshMove India',
        type: 'COLD_CHAIN',
        coverageRegions: ['Tamil Nadu', 'Kerala', 'Karnataka', 'Andhra Pradesh', 'Telangana'],
        coverageCountries: ['India'],
        vehicleTypes: ['Reefer 14ft', 'Reefer 24ft'],
        minQuantityKg: 100, maxQuantityKg: 15000,
        costPerKmPerKg: 0.007, avgDeliveryDays: 2, rating: 4.4,
        contactEmail: 'ops@freshmove.in', contactPhone: '+91-9000000007',
        commissionPercent: 8.5,
      },
    }),
    prisma.logisticsPartner.create({
      data: {
        name: 'RuralConnect',
        type: 'LOCAL',
        coverageRegions: ['Rajasthan', 'Madhya Pradesh', 'Gujarat'],
        coverageCountries: ['India'],
        vehicleTypes: ['Pickup Van', 'Mini Truck'],
        minQuantityKg: 50, maxQuantityKg: 5000,
        costPerKmPerKg: 0.0025, avgDeliveryDays: 1, rating: 3.9,
        contactEmail: 'connect@ruralconnect.in', contactPhone: '+91-9000000008',
        commissionPercent: 6.5,
      },
    }),
  ]);

  console.log(`  ✅ Created ${logisticsPartners.length} logistics partners`);

  // =========================================================================
  // Summary
  // =========================================================================
  const counts = {
    users: await prisma.user.count(),
    farmerProfiles: await prisma.farmerProfile.count(),
    buyerProfiles: await prisma.buyerProfile.count(),
    listings: await prisma.listing.count(),
    agentConfigs: await prisma.agentConfig.count(),
    bids: await prisma.bid.count(),
    negotiations: await prisma.negotiation.count(),
    transactions: await prisma.transaction.count(),
    notifications: await prisma.notification.count(),
    logisticsPartners: await prisma.logisticsPartner.count(),
  };

  console.log('\n🌾 Seed completed! Database populated with:\n');
  console.log(`  👤 Users:              ${counts.users} (1 admin, 20 farmers, 10 buyers)`);
  console.log(`  🧑‍🌾 Farmer Profiles:     ${counts.farmerProfiles}`);
  console.log(`  🏢 Buyer Profiles:      ${counts.buyerProfiles}`);
  console.log(`  📦 Listings:            ${counts.listings} (40 Indian + 10 global)`);
  console.log(`  🤖 Agent Configs:       ${counts.agentConfigs}`);
  console.log(`  💰 Bids:                ${counts.bids}`);
  console.log(`  🤝 Negotiations:        ${counts.negotiations}`);
  console.log(`  📋 Transactions:        ${counts.transactions}`);
  console.log(`  🔔 Notifications:       ${counts.notifications}`);
  console.log(`  🚚 Logistics Partners:  ${counts.logisticsPartners}`);
  console.log('\n  All test users password: password123');
  console.log('  Admin login: admin@cropbid.test / password123');
  console.log('  Sample farmer: rajesh@cropbid.test / password123');
  console.log('  Sample buyer: vikram@cropbid.test / password123\n');
}

// =============================================================================
// RUN
// =============================================================================
main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
