// =============================================================================
// The shopper's delivery city
// =============================================================================
// Retail never crosses cities: a 2 kg order cannot be trucked across a state,
// so every retail surface needs to know which city it is shopping in before it
// can show anything. A signed-in shopper keeps theirs on their account, which
// is the single source of truth for them. A guest has nowhere to put one but
// the browser, which is what this file is for.
//
// It lives in utils rather than beside the shelf that first needed it, for the
// same reason units.ts does: a module exporting both a component and a plain
// function breaks Fast Refresh. It is also read by two surfaces now (the
// storefront and the shop page), and a second copy of the key spelled even
// slightly differently would send a guest to a shop the storefront had just
// told them was out of range.
// =============================================================================

const GUEST_CITY_KEY = 'cb-shelf-city';

export function loadGuestCity(): string {
  if (typeof window === 'undefined') return ''; // prerender build has no storage
  try {
    return window.localStorage.getItem(GUEST_CITY_KEY) ?? '';
  } catch {
    return ''; // private mode — the picker just asks again
  }
}

export function saveGuestCity(city: string): void {
  try {
    window.localStorage.setItem(GUEST_CITY_KEY, city);
  } catch {
    // ignore storage errors (private mode, quota)
  }
}
