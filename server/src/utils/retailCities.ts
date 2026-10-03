// =============================================================================
// Retail cities: where CropBid delivers to households
// =============================================================================
// The one list. The storefront's city picker, the shop list, a shop's own page
// and the order itself all read it, so a city taken off here disappears from
// every surface at once and cannot be ordered into by any path.
//
// Stock alone used to decide this: any city with live direct-sale stock was a
// delivery city. That made the footprint whatever sellers happened to list,
// not where anybody actually delivers. Since 2026-10-03 household delivery
// runs in Nagpur only, while Pune shops still hold stock.
//
// Adding a city is adding it here, and changing the public pages that name
// the footprint in the same PR (CLAUDE.md §2).
// =============================================================================

export const RETAIL_CITIES: readonly string[] = ['Nagpur'];

/** Case- and whitespace-insensitive, matching how listing locations are compared. */
export function isRetailCity(city: string | null | undefined): boolean {
  const c = (city ?? '').trim().toLowerCase();
  return c !== '' && RETAIL_CITIES.some((r) => r.toLowerCase() === c);
}

/** A Prisma filter on `Listing.location` matching any served city. */
export function retailCityFilter() {
  return {
    OR: RETAIL_CITIES.map((city) => ({
      location: { equals: city, mode: 'insensitive' as const },
    })),
  };
}
