// =============================================================================
// Distance, for deciding whether a shop can actually reach a shopper
// =============================================================================
// A city is far too coarse to promise same-day delivery on. Nagpur is roughly
// 220 km2, so a shop in Narendra Nagar cannot serve Hingna 14 km west however
// enthusiastically it says yes. The Quick lane therefore filters on real
// kilometres, and this is the arithmetic behind it.
//
// PLAIN TRIGONOMETRY, NOT POSTGIS. At a few hundred shops the extension buys
// nothing that this file does not already do, and costs an extension to install
// and keep working on every environment. Revisit it when there are polygons to
// intersect or hundreds of thousands of rows, neither of which is near.
// =============================================================================

const EARTH_RADIUS_KM = 6371;

/** One degree of latitude is ~111 km everywhere; longitude shrinks toward the poles. */
const KM_PER_DEG_LAT = 111.32;

export interface Point {
  latitude: number;
  longitude: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in kilometres.
 *
 * Haversine rather than the cheaper equirectangular approximation: the delivery
 * radius is the difference between promising a shopper same-day and not, so it
 * is worth being right rather than close.
 */
export function distanceKm(a: Point, b: Point): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * A lat/lng box that certainly contains everything within `km` of `centre`.
 *
 * The box is the INDEXABLE part of the search. Haversine cannot use an index,
 * so the query narrows on these ranges first and computes exact distance only
 * on what survives. The box is deliberately generous: it is a superset of the
 * circle, never a subset, so it can only ever hand the exact check too much
 * rather than quietly dropping a shop that was in range.
 *
 * Longitude degrees shrink with latitude, hence the cos() term. It is clamped
 * because near the poles cos() approaches zero and the width would explode;
 * India is nowhere near that, but an unclamped divide is a division by almost
 * zero waiting for a bad input.
 */
export function boundingBox(centre: Point, km: number) {
  const latDelta = km / KM_PER_DEG_LAT;
  const cosLat = Math.max(Math.cos(toRad(centre.latitude)), 0.01);
  const lngDelta = km / (KM_PER_DEG_LAT * cosLat);

  return {
    minLat: centre.latitude - latDelta,
    maxLat: centre.latitude + latDelta,
    minLng: centre.longitude - lngDelta,
    maxLng: centre.longitude + lngDelta,
  };
}

/** Rounded the way a shopper reads it: "1.2 km", not "1.23456 km". */
export function roundKm(km: number): number {
  return Math.round(km * 10) / 10;
}
