// =============================================================================
// Where the shopper is
// =============================================================================
// The Quick lane is filtered by real kilometres, because a city is far too
// coarse to promise same-day delivery on: a shop in Narendra Nagar cannot serve
// Hingna, 14 km west. That filter needs a position.
//
// LOCATION IS AN ACCELERATOR, NEVER A GATE. Permission gets denied, GPS fails
// indoors, and a shopper ordering for their parents' house is not standing at
// the delivery address anyway. So every path here degrades to "we do not know",
// and the storefront falls back to the whole city and says so. An app that
// refuses to show a shelf until you hand over your location is one people
// delete.
//
// The position is remembered, so the permission prompt is a once-per-install
// event rather than a launch ritual. It is a coarse convenience, not a live
// track: nothing here watches the shopper as they move.
// =============================================================================

import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';

export interface Position {
  latitude: number;
  longitude: number;
  /** When it was taken, so a stale one can be refreshed rather than trusted. */
  at: number;
}

const KEY = 'cropbid.daily.position';

/**
 * How long a remembered position is still worth using.
 *
 * A day: someone who shopped from home yesterday is almost certainly there
 * again, and re-prompting every launch is the thing that makes people deny the
 * permission for good. Refreshed silently in the background when older.
 */
export const POSITION_TTL_MS = 24 * 60 * 60 * 1000;

async function read(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  }
  try { return await SecureStore.getItemAsync(key); } catch { return null; }
}

async function write(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try { globalThis.localStorage?.setItem(key, value); } catch { /* private mode */ }
    return;
  }
  try { await SecureStore.setItemAsync(key, value); } catch { /* locked keystore */ }
}

export async function loadPosition(): Promise<Position | null> {
  const raw = await read(KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Position;
    return Number.isFinite(p.latitude) && Number.isFinite(p.longitude) ? p : null;
  } catch {
    return null;
  }
}

export async function savePosition(p: Position): Promise<void> {
  await write(KEY, JSON.stringify(p));
}

export function isStale(p: Position): boolean {
  return Date.now() - p.at > POSITION_TTL_MS;
}

export type PositionResult =
  | { ok: true; position: Position }
  | { ok: false; reason: 'denied' | 'unavailable' };

/**
 * Ask the OS where we are.
 *
 * `Balanced` accuracy, not `Highest`: the answer feeds a 5 km radius check, so
 * a hundred metres either way changes nothing, and the high-accuracy modes cost
 * a noticeably longer fix and more battery for precision nobody uses.
 *
 * Never throws. Every failure is a reason the caller can show.
 */
export async function requestPosition(): Promise<PositionResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { ok: false, reason: 'denied' };

    const fix = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const position: Position = {
      latitude: fix.coords.latitude,
      longitude: fix.coords.longitude,
      at: Date.now(),
    };
    await savePosition(position);
    return { ok: true, position };
  } catch {
    // No fix: indoors, airplane mode, a browser that refused, a simulator with
    // no location set. All the same to the shopper, and all recoverable by
    // browsing the whole city.
    return { ok: false, reason: 'unavailable' };
  }
}
