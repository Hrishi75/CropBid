// =============================================================================
// Bill pages: where the foot of the screen belongs to the pay button
// =============================================================================
// The cart and checkout end in a pay button at the bottom of a phone screen.
// Anything fixed to the bottom of the screen (the basket bar, the WhatsApp
// button) stays off these pages, and they read this one list so a new pay
// page is added once rather than to each of them.
// =============================================================================

export function isBillPage(pathname: string): boolean {
  return pathname === '/cart' || pathname.startsWith('/checkout');
}
