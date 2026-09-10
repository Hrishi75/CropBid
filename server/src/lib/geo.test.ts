import { describe, expect, it } from 'vitest';
import { boundingBox, distanceKm, roundKm } from './geo';

// The case this whole feature exists for: a Nagpur shop in Narendra Nagar
// cannot serve Hingna, and a city filter alone would say it could.
const NARENDRA_NAGAR = { latitude: 21.1155, longitude: 79.073 };
const HINGNA = { latitude: 21.094, longitude: 78.937 };
const DHARAMPETH = { latitude: 21.137, longitude: 79.059 };

describe('distanceKm', () => {
  it('is zero for the same point', () => {
    expect(distanceKm(NARENDRA_NAGAR, NARENDRA_NAGAR)).toBe(0);
  });

  it('puts Hingna well outside a shop radius from Narendra Nagar', () => {
    const km = distanceKm(NARENDRA_NAGAR, HINGNA);
    expect(km).toBeGreaterThan(13);
    expect(km).toBeLessThan(16);
    // The point of the feature: a 5 km shop must not reach it.
    expect(km).toBeGreaterThan(5);
  });

  it('keeps a genuinely nearby shop inside its radius', () => {
    expect(distanceKm(NARENDRA_NAGAR, DHARAMPETH)).toBeLessThan(6);
  });

  it('is symmetric', () => {
    expect(distanceKm(HINGNA, DHARAMPETH)).toBeCloseTo(distanceKm(DHARAMPETH, HINGNA), 9);
  });

  it('matches a known separation, one degree of latitude', () => {
    // Meridian degrees are ~111.2 km anywhere on the globe.
    const km = distanceKm({ latitude: 21, longitude: 79 }, { latitude: 22, longitude: 79 });
    expect(km).toBeGreaterThan(110);
    expect(km).toBeLessThan(112);
  });

  it('accounts for longitude degrees narrowing away from the equator', () => {
    const atEquator = distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
    const atNagpur = distanceKm({ latitude: 21, longitude: 79 }, { latitude: 21, longitude: 80 });
    expect(atNagpur).toBeLessThan(atEquator);
  });
});

describe('boundingBox', () => {
  it('contains every point the exact check would accept', () => {
    // The box is the indexable prefilter, so it must be a SUPERSET of the
    // circle. A box that clipped the circle would silently drop shops that are
    // genuinely in range, which is the one failure that cannot be noticed.
    const radius = 5;
    const box = boundingBox(NARENDRA_NAGAR, radius);

    for (let bearing = 0; bearing < 360; bearing += 15) {
      const rad = (bearing * Math.PI) / 180;
      // A point just inside the radius, in every direction.
      const latOffset = ((radius - 0.01) / 111.32) * Math.cos(rad);
      const lngOffset =
        ((radius - 0.01) / (111.32 * Math.cos((NARENDRA_NAGAR.latitude * Math.PI) / 180))) *
        Math.sin(rad);
      const point = {
        latitude: NARENDRA_NAGAR.latitude + latOffset,
        longitude: NARENDRA_NAGAR.longitude + lngOffset,
      };

      expect(distanceKm(NARENDRA_NAGAR, point)).toBeLessThanOrEqual(radius);
      expect(point.latitude).toBeGreaterThanOrEqual(box.minLat);
      expect(point.latitude).toBeLessThanOrEqual(box.maxLat);
      expect(point.longitude).toBeGreaterThanOrEqual(box.minLng);
      expect(point.longitude).toBeLessThanOrEqual(box.maxLng);
    }
  });

  it('widens in longitude as latitude rises', () => {
    const near = boundingBox({ latitude: 8, longitude: 77 }, 5);   // Kanyakumari
    const far = boundingBox({ latitude: 34, longitude: 77 }, 5);   // Leh
    expect(far.maxLng - far.minLng).toBeGreaterThan(near.maxLng - near.minLng);
  });

  it('does not blow up near the poles', () => {
    const box = boundingBox({ latitude: 89.999, longitude: 0 }, 5);
    expect(Number.isFinite(box.minLng)).toBe(true);
    expect(Number.isFinite(box.maxLng)).toBe(true);
  });
});

describe('roundKm', () => {
  it('gives one decimal place, the way a shopper reads it', () => {
    expect(roundKm(2.7519)).toBe(2.8);
    expect(roundKm(14.298)).toBe(14.3);
    expect(roundKm(0)).toBe(0);
  });
});
