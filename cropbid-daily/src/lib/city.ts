// =============================================================================
// Delivery city — remembered per device
// =============================================================================
// A shopper picks a city before they see any produce, and that choice has to
// survive an app restart or they are asked again every launch.
//
// There is no account behind it yet: Daily's shop list and shop page are both
// public, so the city is device state, not user state. When sign-in lands, a
// signed-in shopper's city should move to User.location (as the web already
// does) and this becomes the guest fallback rather than the only store.
//
// SecureStore is the wrong tool here (it is for secrets and has a size limit),
// so this uses AsyncStorage semantics via expo-secure-store's web fallback
// pattern: localStorage on web, SecureStore on native. A city is not a secret,
// but it is two words, and adding another storage dependency for two words is
// not worth it.
// =============================================================================

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const CITY_KEY = 'cropbid.daily.city';

export async function loadCity(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(CITY_KEY) ?? null;
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(CITY_KEY);
  } catch {
    return null;
  }
}

export async function saveCity(city: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(CITY_KEY, city);
    } catch {
      // storage unavailable — the pick simply won't survive this session
    }
    return;
  }
  try {
    await SecureStore.setItemAsync(CITY_KEY, city);
  } catch {
    // same: a failed write costs one extra tap next launch, nothing more
  }
}
