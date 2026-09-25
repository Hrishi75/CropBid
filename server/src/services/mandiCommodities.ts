// =============================================================================
// Mandi commodities: what each name in the government feed is
// =============================================================================
// The Agmarknet feed names about 260 commodities a day and says nothing about
// them beyond the name: not whether it is a vegetable or a pulse, not that two
// names are one product, not that "Kakada" is a jasmine sold in flower markets.
// This table says so, so /rates can show every crop the feed reported, grouped
// the way a buyer looks for it.
//
// A name the table does not know is NOT dropped: it shows under "Other farm
// produce" with the feed's own spelling, so a new crop reaches the page the
// day it is first reported and the table can catch up afterwards.
//
// Names are matched exactly (trimmed, any case). The feed's own filters match
// on any shared WORD, which is how "Onion" used to pull in spring onion and
// "Andhra Pradesh" every other Pradesh; see mandiFeed.ts.
// =============================================================================

export type Group =
  | 'vegetables' | 'greens' | 'fruits' | 'cereals' | 'pulses'
  | 'oilseeds' | 'spices' | 'dryfruits' | 'dairy' | 'other';

export const GROUPS: Array<{ id: Group; title: string }> = [
  { id: 'vegetables', title: 'Vegetables' },
  { id: 'greens', title: 'Leafy greens & herbs' },
  { id: 'fruits', title: 'Fruits' },
  { id: 'cereals', title: 'Cereals & millets' },
  { id: 'pulses', title: 'Pulses' },
  { id: 'oilseeds', title: 'Oilseeds' },
  { id: 'spices', title: 'Spices' },
  { id: 'dryfruits', title: 'Dry fruits & nuts' },
  { id: 'dairy', title: 'Milk & dairy' },
  { id: 'other', title: 'Other farm produce' },
];

export interface Commodity {
  id: string;       // the first feed name; what clients pass back as ?crop=
  names: string[];  // every feed spelling that means this product
  label: string;
  group: Group;
}

// [feed names (first is the id), label]. A single string is a name that reads
// fine as it stands. Several names on one row are ONE product the feed files
// under more than one code, checked against today's prices before merging:
// bhindi and "Ladies Finger" sit near each other; lemon (₹150/kg) and lime
// (₹50/kg) do not, so they stay apart. Spring onion is not onion either.
type Row = string | [string | string[], string];

const TABLE: Record<Group, Row[]> = {
  vegetables: [
    'Tomato', 'Onion', 'Potato', 'Brinjal', 'Cabbage', 'Cauliflower', 'Carrot', 'Garlic', 'Beetroot',
    'Pumpkin', 'Drumstick', 'Beans', 'Tapioca', 'Turnip', 'Tinda', 'Yam',
    [['Green Chilli'], 'Green Chilli'],
    [['Ginger(Green)'], 'Ginger'],
    [['Bhindi(Ladies Finger)', 'Ladies Finger'], 'Lady Finger (Bhindi)'],
    [['Cucumbar(Kheera)'], 'Cucumber (Kheera)'],
    [['Capsicum', 'Chilly Capsicum'], 'Capsicum'],
    [['Raddish'], 'Radish'],
    [['Bitter gourd'], 'Bitter Gourd (Karela)'],
    [['Bottle gourd'], 'Bottle Gourd (Lauki)'],
    [['Ridgeguard(Tori)'], 'Ridge Gourd (Tori)'],
    [['Ridge Gourd(Permal/Hybrid Gourd)'], 'Hybrid Gourd (Permal)'],
    [['Snakeguard'], 'Snake Gourd'],
    [['Sponge gourd'], 'Sponge Gourd'],
    [['Ashgourd'], 'Ash Gourd'],
    [['Little gourd(Kundru)', 'Thondekai'], 'Ivy Gourd (Kundru)'],
    [['Pointed gourd(Parval)'], 'Pointed Gourd (Parval)'],
    [['Round gourd'], 'Round Gourd'],
    [['Spiny Gourd / Kartali(Kantola)'], 'Spiny Gourd (Kantola)'],
    [['Squash(Chappal Kadoo)'], 'Squash (Chappal Kaddu)'],
    [['Sweet Pumpkin'], 'Sweet Pumpkin'],
    [['White Pumpkin'], 'White Pumpkin'],
    [['Chow Chow', 'Seemebadnekai'], 'Chayote (Chow Chow)'],
    [['Knool Khol'], 'Kohlrabi (Knol Khol)'],
    [['Long Melon(Kakri)'], 'Long Melon (Kakri)'],
    [['Wild Cucumber'], 'Wild Cucumber'],
    [['Cluster beans', 'Guar'], 'Cluster Beans (Guar)'],
    [['French Beans(Frasbean)'], 'French Beans'],
    [['Indian Beans(Seam)'], 'Indian Beans (Sem)'],
    [['Surat Beans(Papadi)'], 'Surti Papdi'],
    [['Bunch Beans'], 'Bunch Beans'],
    [['Duster Beans'], 'Duster Beans'],
    [['Cowpea(Veg)', 'Alsandikai'], 'Cowpea Pods (Lobia)'],
    [['Green Avare(W)'], 'Field Beans (Avare)'],
    [['Chapparad Avare'], 'Flat Beans (Chapparada Avare)'],
    [['Field Bean(Anumulu)'], 'Field Beans (Anumulu)'],
    [['Green Peas'], 'Green Peas'],
    [['Peas Wet', 'Pea Pod/Pea Cod/हरी मटर'], 'Pea Pods'],
    [['Pegeon Pea(Arhar Fali)'], 'Pigeon Pea Pods (Arhar Fali)'],
    [['Gram Raw(Chholia)'], 'Green Chickpeas (Chholia)'],
    [['Baby Corn'], 'Baby Corn'],
    [['Sweet Corn'], 'Sweet Corn'],
    [['Mashrooms'], 'Mushrooms'],
    [['Colacasia', 'Taro (Arvi) Stem'], 'Colocasia (Arbi)'],
    [['Elephant Yam(Suran)/Amorphophallus'], 'Elephant Yam (Suran)'],
    [['Yam(Ratalu)'], 'Purple Yam (Ratalu)'],
    [['Sweet Potato'], 'Sweet Potato'],
    [['Lotus Sticks'], 'Lotus Stem'],
    [['Banana - Green'], 'Raw Banana'],
    [['Papaya(Raw)'], 'Raw Papaya'],
    [['Other green and fresh vegetables'], 'Other Vegetables'],
  ],
  greens: [
    'Spinach', 'Amaranthus',
    [['Coriander(Leaves)'], 'Coriander Leaves'],
    [['Methi(Leaves)'], 'Methi Leaves'],
    [['Mint(Pudina)'], 'Mint (Pudina)'],
    [['Onion Green'], 'Spring Onion'],
    [['Taro (Arvi) Leaves'], 'Colocasia Leaves'],
    [['Sweet Saag'], 'Sweet Saag'],
    [['Chicory(Chikori/Kasni)'], 'Chicory (Kasni)'],
    [['Leafy Vegetable'], 'Mixed Leafy Greens'],
    [['basil'], 'Basil'],
  ],
  fruits: [
    'Apple', 'Banana', 'Grapes', 'Guava', 'Lemon', 'Orange', 'Papaya', 'Pineapple', 'Pomegranate',
    'Avocado', 'Kinnow', 'Litchi', 'Plum',
    [['Mango', 'Mango(Raw-Ripe)'], 'Mango'],
    [['Lime'], 'Lime (Nimbu)'],
    [['Galgal(Lemon)'], 'Galgal (Hill Lemon)'],
    [['Water Melon'], 'Watermelon'],
    [['Karbuja(Musk Melon)'], 'Muskmelon (Kharbuja)'],
    [['Mousambi(Sweet Lime)'], 'Mosambi (Sweet Lime)'],
    [['Chikoos(Sapota)'], 'Chikoo (Sapota)'],
    [['Custard Apple(Sharifa)', 'Seetapal'], 'Custard Apple (Sitaphal)'],
    [['Amla(Nelli Kai)'], 'Amla'],
    [['Jack Fruit(Ripe)'], 'Jackfruit'],
    [['Pear(Marasebu)'], 'Pear'],
    [['Persimon(Japani Fal)'], 'Persimmon'],
    [['Fig(Anjura/Anjeer)'], 'Fig (Anjeer)'],
    [['Kiwi Fruit'], 'Kiwi'],
    [['Passion Fruit'], 'Passion Fruit'],
    [['Tender Coconut'], 'Tender Coconut'],
  ],
  cereals: [
    'Wheat', 'Maize', 'Rice', 'Quinoa',
    [['Paddy(Dhan)(Common)', 'Paddy(Common)'], 'Paddy (Common)'],
    [['Paddy(Basmati)'], 'Paddy (Basmati)'],
    [['Broken Rice'], 'Broken Rice'],
    [['Beaten Rice'], 'Poha (Beaten Rice)'],
    [['Wheat Atta'], 'Wheat Atta'],
    [['Maida Atta'], 'Maida'],
    [['Bajra(Pearl Millet/Cumbu)'], 'Bajra (Pearl Millet)'],
    [['Jowar(Sorghum)'], 'Jowar (Sorghum)'],
    [['Ragi(Finger Millet)'], 'Ragi (Finger Millet)'],
    [['Barley(Jau)'], 'Barley (Jau)'],
    [['Foxtail Millet(Navane)'], 'Foxtail Millet'],
    [['Kodo Millet(Varagu)'], 'Kodo Millet'],
    [['Kutki'], 'Little Millet (Kutki)'],
    [['Same/Savi'], 'Barnyard Millet (Sama)'],
    [['Millets'], 'Millets (Mixed)'],
    [['Rajgir'], 'Rajgira (Amaranth Grain)'],
  ],
  pulses: [
    [['Bengal Gram(Gram)(Whole)'], 'Chana (Bengal Gram)'],
    [['Bengal Gram Dal(Chana Dal)'], 'Chana Dal'],
    [['Kabuli Chana(Chickpeas-White)'], 'Kabuli Chana'],
    [['Red gram/Arhar/Tur(whole)'], 'Tur (Arhar)'],
    [['Red gram split/Arhar dal/Tur dal'], 'Tur Dal'],
    [['Green Gram(Moong)(Whole)'], 'Moong (Green Gram)'],
    [['Green Gram Dal(Moong Dal)'], 'Moong Dal'],
    [['Black Gram(Urd Beans)(Whole)'], 'Urad (Black Gram)'],
    [['Black Gram Dal(Urd Dal)'], 'Urad Dal'],
    [['Lentil(Masur)(Whole)'], 'Masoor (Lentil)'],
    [['Masur Dal'], 'Masoor Dal'],
    [['Cowpea(Lobia/Karamani)', 'Alasande Gram'], 'Lobia (Cowpea)'],
    [['Kulthi(Horse Gram)'], 'Kulthi (Horse Gram)'],
    [['Lak(Teora)'], 'Khesari (Lathyrus)'],
    [['Mataki'], 'Matki (Moth Bean)'],
    [['Field Pea'], 'Field Pea'],
    [['Peas(Dry)'], 'Dry Peas'],
    [['White Peas'], 'White Peas'],
    [['Big Gram'], 'Big Gram'],
    [['Avare Dal'], 'Avare Dal'],
    [['Chennangi Dal'], 'Chennangi Dal'],
    [['Dal Mix'], 'Mixed Dal'],
    [['Other Pulses'], 'Other Pulses'],
  ],
  oilseeds: [
    'Soyabean', 'Groundnut', 'Mustard', 'Linseed', 'Safflower', 'Copra',
    [['Ground Nut Seed'], 'Groundnut Kernels'],
    [['Groundnut pods(raw)'], 'Groundnut Pods (Raw)'],
    [['Groundnut(Split)'], 'Groundnut (Split)'],
    [['Rayee'], 'Rai (Mustard)'],
    [['Sesamum(Sesame,Gingelly,Til)'], 'Sesame (Til)'],
    [['Castor Seed'], 'Castor Seed'],
    [['Sunflower/Sunflower Seed'], 'Sunflower Seed'],
    [['Niger Seed(Ramtil)'], 'Niger Seed (Ramtil)'],
    [['Cotton Seed'], 'Cotton Seed'],
    [['gulli'], 'Mahua Seed (Gulli)'],
  ],
  spices: [
    'Turmeric', 'Cardamom', 'Ajwan',
    [['Turmeric(raw)'], 'Raw Turmeric'],
    [['Chili Red', 'Dry Chillies'], 'Red Chilli (Dry)'],
    [['Cummin Seed(Jeera)'], 'Jeera (Cumin)'],
    [['Corriander seed'], 'Coriander Seed'],
    [['Methi Seeds'], 'Methi Seeds'],
    [['Soanf', 'Sompu'], 'Saunf (Fennel)'],
    [['Black pepper'], 'Black Pepper'],
    [['Cinamon(Dalchini)'], 'Cinnamon (Dalchini)'],
    [['Bay leaf(Tejpatta)'], 'Bay Leaf (Tejpatta)'],
    [['Ginger(Dry)'], 'Dry Ginger (Sonth)'],
    [['Tamarind Fruit'], 'Tamarind'],
    [['nigella', 'nigella seeds'], 'Kalonji (Nigella)'],
    [['poppy seeds'], 'Poppy Seeds'],
    [['Suva(Dill Seed)'], 'Dill Seed (Suva)'],
    [['Asalia'], 'Garden Cress (Asalia)'],
    [['dried mango'], 'Amchur (Dried Mango)'],
  ],
  dryfruits: [
    'Walnut',
    [['Almond(Badam)'], 'Almond'],
    [['Cashewnuts'], 'Cashew'],
    [['Dry Grapes'], 'Raisins'],
    [['Makhana(Foxnut)'], 'Makhana (Foxnut)'],
  ],
  dairy: ['Milk', 'Ghee', 'Curd', 'Paneer'],
  other: [
    'Cotton', 'Jute', 'Tobacco', 'Coconut', 'Sugar', 'Fish', 'Prawn', 'Mahua', 'Cocoa',
    [['Arecanut(Betelnut/Supari)'], 'Arecanut (Supari)'],
    [['Betal Leaves'], 'Betel Leaves'],
    [['Gur(Jaggery)'], 'Jaggery (Gur)'],
    [['Khandsari(Desi Khand)'], 'Khandsari'],
    [['Rab/Liquid Jaggery/Molasses'], 'Liquid Jaggery (Rab)'],
    [['Sabu Dan'], 'Sabudana'],
    [['Guar Seed(Cluster Beans Seed)'], 'Guar Seed'],
    [['Isabgul(Psyllium)'], 'Isabgol (Psyllium)'],
    [['Chiaseeds'], 'Chia Seeds'],
    [['Muskmelon Seeds'], 'Muskmelon Seeds'],
    [['Neem Seed'], 'Neem Seed'],
    [['Coconut Oil'], 'Coconut Oil'],
    [['Mustard Oil'], 'Mustard Oil'],
    [['Mentha Oil'], 'Mentha Oil'],
    [['Asgand', 'Ashwagandha'], 'Ashwagandha'],
    [['Absinthe'], 'Chirayta'],
    [['Mahedi'], 'Mehendi (Henna)'],
  ],
};

// Not farm produce anyone buys to eat or process, so not on a rates board:
// livestock, cut flowers (the Gazipur flower market reports "BOP" and
// "Raibel"; "Kakada" is a Tamil Nadu jasmine), fodder and wood.
const EXCLUDED = new Set([
  'Cock', 'Goat', 'Hen', 'Ox', 'Pigs',
  'Anthorium', 'Astera', 'BOP', 'Carnation', 'Chrysanthemum(Loose)', 'Jarbara', 'Jasmine', 'Kakada',
  'Lilly', 'Marigold(Calcutta)', 'Marigold(loose)', 'Orchid', 'Raibel', 'Rose(Local)', 'Rose(Loose))',
  'Tube Flower', 'Tube Rose(Double)', 'Tube Rose(Loose)', 'Tube Rose(Single)',
  'Firewood', 'Wood', 'Dry Fodder', 'Green Fodder', 'Broomstick(Flower Broom)', 'Coconut Coir',
].map((n) => n.toLowerCase()));

// The icon a commodity is shown with, keyed by id. Unicode has about forty
// food emoji, so most of the table has none: a gourd, a dal or a millet gets
// its group's icon below rather than a lookalike that names another crop.
// Near misses are allowed only where the shape really is the family (🫛 for
// any bean or pea in its pod, 🥒 for the long gourds). Emoji newer than
// Unicode 15 (2022) are left out, because older phones draw them as a box.
export const EMOJI: Record<string, string> = {
  // vegetables
  Tomato: '🍅', Onion: '🧅', Potato: '🥔', Brinjal: '🍆', Cabbage: '🥬', Cauliflower: '🥦',
  Carrot: '🥕', Garlic: '🧄', Pumpkin: '🎃', 'Sweet Pumpkin': '🎃', Beans: '🫛',
  'Green Chilli': '🌶️', 'Ginger(Green)': '🫚', 'Bhindi(Ladies Finger)': '🫛',
  'Cucumbar(Kheera)': '🥒', Capsicum: '🫑',
  'Bitter gourd': '🥒', 'Ridgeguard(Tori)': '🥒', 'Snakeguard': '🥒', 'Sponge gourd': '🥒',
  'Little gourd(Kundru)': '🥒', 'Pointed gourd(Parval)': '🥒', 'Long Melon(Kakri)': '🥒',
  'Wild Cucumber': '🥒',
  'Cluster beans': '🫛', 'French Beans(Frasbean)': '🫛', 'Indian Beans(Seam)': '🫛',
  'Surat Beans(Papadi)': '🫛', 'Bunch Beans': '🫛', 'Duster Beans': '🫛', 'Cowpea(Veg)': '🫛',
  'Green Avare(W)': '🫛', 'Chapparad Avare': '🫛', 'Field Bean(Anumulu)': '🫛', 'Green Peas': '🫛',
  'Peas Wet': '🫛', 'Pegeon Pea(Arhar Fali)': '🫛', 'Gram Raw(Chholia)': '🫛',
  'Baby Corn': '🌽', 'Sweet Corn': '🌽', Mashrooms: '🍄',
  'Sweet Potato': '🍠', 'Yam(Ratalu)': '🍠', 'Banana - Green': '🍌',
  // greens
  Spinach: '🥬', Amaranthus: '🥬', 'Leafy Vegetable': '🥬', 'Methi(Leaves)': '☘️',
  'Mint(Pudina)': '🍃', 'Onion Green': '🌱', basil: '🌿', 'Coriander(Leaves)': '🌿',
  // fruits
  Apple: '🍎', Banana: '🍌', Grapes: '🍇', Lemon: '🍋', Lime: '🍋', 'Galgal(Lemon)': '🍋',
  Pomegranate: '🍒', Orange: '🍊', Kinnow: '🍊', 'Mousambi(Sweet Lime)': '🍊', Pineapple: '🍍', Avocado: '🥑',
  Mango: '🥭', 'Water Melon': '🍉', 'Karbuja(Musk Melon)': '🍈', 'Pear(Marasebu)': '🍐',
  'Kiwi Fruit': '🥝', 'Tender Coconut': '🥥',
  // cereals
  Wheat: '🌾', Maize: '🌽', Rice: '🍚', 'Paddy(Dhan)(Common)': '🍚', 'Broken Rice': '🍚',
  'Beaten Rice': '🍚', 'Wheat Atta': '🫓',
  // oilseeds. Soyabean keeps the bean it has always shown on the board.
  Soyabean: '🫘', Groundnut: '🥜', 'Ground Nut Seed': '🥜', 'Groundnut pods(raw)': '🥜', 'Groundnut(Split)': '🥜',
  Copra: '🥥', 'Sunflower/Sunflower Seed': '🌻',
  // spices
  Turmeric: '🫚', 'Turmeric(raw)': '🫚', 'Ginger(Dry)': '🫚', 'Chili Red': '🌶️',
  'Bay leaf(Tejpatta)': '🍃', 'dried mango': '🥭',
  // dry fruits
  'Almond(Badam)': '🥜', Cashewnuts: '🥜', Walnut: '🌰', 'Dry Grapes': '🍇',
  // dairy
  Milk: '🥛', Ghee: '🧈', Curd: '🥣', Paneer: '🧀',
  // other
  Coconut: '🥥', 'Coconut Oil': '🥥', 'Mustard Oil': '🫙', Fish: '🐟', Prawn: '🦐', Cocoa: '🍫',
  'Betal Leaves': '🍃',
};

// For a commodity with no emoji of its own. Spices get a shaker, not a
// chilli, because a chilli on cardamom or jeera names the wrong crop.
const GROUP_EMOJI: Record<Group, string> = {
  vegetables: '🥬', greens: '🌿', fruits: '🍎', cereals: '🌾', pulses: '🫘',
  oilseeds: '🌻', spices: '🧂', dryfruits: '🥜', dairy: '🥛', other: '🧺',
};

/** The icon to show beside a commodity: its own where Unicode has one, else its group's. */
export function emojiFor(c: Commodity): string {
  return EMOJI[c.id] ?? GROUP_EMOJI[c.group];
}

const key = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

export const COMMODITIES: Commodity[] = (Object.entries(TABLE) as Array<[Group, Row[]]>).flatMap(
  ([group, rows]) => rows.map((row) => {
    const [names, label] = typeof row === 'string' ? [[row], row] : row;
    const list = Array.isArray(names) ? names : [names];
    return { id: list[0], names: list, label, group };
  })
);

const BY_NAME = new Map<string, Commodity>();
for (const c of COMMODITIES) for (const n of c.names) BY_NAME.set(key(n), c);

/**
 * What a feed name (or an id a client sent back) is. A name the table does
 * not know becomes its own entry under "other"; null means it is on the
 * excluded list and belongs on no rates board.
 */
export function commodityFor(name: string): Commodity | null {
  const k = key(name);
  if (EXCLUDED.has(k)) return null;
  const known = BY_NAME.get(k);
  if (known) return known;
  const clean = name.trim().replace(/\s+/g, ' ');
  const label = clean.charAt(0).toUpperCase() + clean.slice(1);
  return { id: clean, names: [clean], label, group: 'other' };
}

/** Does this feed name belong to that commodity? Exact, any case, any spacing. */
export function isNameOf(c: Commodity, name: string): boolean {
  const k = key(name);
  return c.names.some((n) => key(n) === k);
}
