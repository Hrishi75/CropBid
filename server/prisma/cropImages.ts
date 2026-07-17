// =============================================================================
// Stock crop photos — real, curated images for listings without photos
// =============================================================================
// One photo per catalogue crop, hosted on the project Cloudinary under
// cropbid/stock/ (sourced from Wikimedia Commons, pre-sized 1200px WebP).
// Two jobs:
//   1. Display fallback: any listing with an empty images[] shows the stock
//      photo of its crop instead of an emoji placeholder.
//   2. Listing form: farmers who don't have photos can pick the standard
//      photo (which simply means "upload nothing" — every surface falls back).
// Keys are lowercase crop names as used in the crop catalogue (crops.ts).
// The same map exists in mobile/src/utils/cropImages.ts and
// server/prisma/cropImages.ts — keep the three in sync.
// =============================================================================

const CDN = 'https://res.cloudinary.com/dw6dolfid/image/upload/cropbid/stock';

export const CROP_STOCK_IMAGES: Record<string, string> = {
  almond: `${CDN}/almond.webp`,
  bajra: `${CDN}/bajra.webp`,
  banana: `${CDN}/banana.webp`,
  barley: `${CDN}/barley.webp`,
  cardamom: `${CDN}/cardamom.webp`,
  castor: `${CDN}/castor.webp`,
  'chana dal': `${CDN}/chana-dal.webp`,
  chili: `${CDN}/chili.webp`,
  coconut: `${CDN}/coconut.webp`,
  coffee: `${CDN}/coffee.webp`,
  corn: `${CDN}/corn.webp`,
  cotton: `${CDN}/cotton.webp`,
  grapes: `${CDN}/grapes.webp`,
  groundnut: `${CDN}/groundnut.webp`,
  mustard: `${CDN}/mustard.webp`,
  onion: `${CDN}/onion.webp`,
  pepper: `${CDN}/pepper.webp`,
  pomegranate: `${CDN}/pomegranate.webp`,
  potato: `${CDN}/potato.webp`,
  ragi: `${CDN}/ragi.webp`,
  rice: `${CDN}/rice.webp`,
  soybean: `${CDN}/soybean.webp`,
  sugarcane: `${CDN}/sugarcane.webp`,
  tea: `${CDN}/tea.webp`,
  tomato: `${CDN}/tomato.webp`,
  turmeric: `${CDN}/turmeric.webp`,
  wheat: `${CDN}/wheat.webp`,
};

// Common alternate names farmers might type or legacy data might hold.
const ALIASES: Record<string, string> = {
  maize: 'corn',
  paddy: 'rice',
  basmati: 'rice',
  'pearl millet': 'bajra',
  'finger millet': 'ragi',
  'black pepper': 'pepper',
  chilli: 'chili',
  'red chilli': 'chili',
  peanut: 'groundnut',
  peanuts: 'groundnut',
  chana: 'chana dal',
  chickpea: 'chana dal',
};

/** Stock photo URL for a crop, or null if we don't have one (caller keeps its
 *  existing placeholder in that case). */
export function cropImageFor(cropName?: string | null): string | null {
  if (!cropName) return null;
  const key = cropName.trim().toLowerCase();
  return CROP_STOCK_IMAGES[key] ?? CROP_STOCK_IMAGES[ALIASES[key]] ?? null;
}

/** First real image of a listing, falling back to the crop's stock photo. */
export function listingImage(listing: { images?: string[]; cropName?: string }): string | null {
  if (listing.images && listing.images.length > 0) return listing.images[0];
  return cropImageFor(listing.cropName);
}
