// =============================================================================
// Device preferences
// =============================================================================
// ON THIS DEVICE ONLY, and the screens that read them say so. There is no
// preference model on the server and no push infrastructure at all: no device
// token is registered anywhere, and what the server sends by email or WhatsApp
// is decided by the server without asking. So a toggle here can only change
// what THIS INSTALL does with what it already receives.
//
// That is a real limit, not a shortcut, and the alternative is worse: a switch
// labelled "email alerts" that quietly changes nothing is a lie the user cannot
// detect. Making these preferences real needs a model on User and the notifiers
// reading it, which is its own piece of work.
// =============================================================================

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export interface Prefs {
  /** Show the in-app activity badge and alerts for order updates. */
  orderUpdates: boolean;
  /** Show alerts about price moves on crops the shopper has bought. */
  priceAlerts: boolean;
  /** Show the occasional offer or new-shop announcement. */
  offers: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  // On by default: an order update is the one thing somebody actively wants.
  orderUpdates: true,
  priceAlerts: false,
  // OFF by default. Opting somebody into marketing and making them find the
  // switch is the pattern this product should not have.
  offers: false,
};

const KEY = 'cropbid.prefs';

async function read(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try { return globalThis.localStorage?.getItem(KEY) ?? null; } catch { return null; }
  }
  try { return await SecureStore.getItemAsync(KEY); } catch { return null; }
}

async function write(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try { globalThis.localStorage?.setItem(KEY, value); } catch { /* private mode */ }
    return;
  }
  try { await SecureStore.setItemAsync(KEY, value); } catch { /* locked keystore */ }
}

export async function loadPrefs(): Promise<Prefs> {
  const raw = await read();
  if (!raw) return DEFAULT_PREFS;
  try {
    // Spread over the defaults rather than trusting the stored shape: a build
    // that adds a preference must not read `undefined` for it out of a blob
    // written by the previous version.
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  await write(JSON.stringify(prefs));
}
