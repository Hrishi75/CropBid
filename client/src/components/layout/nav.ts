// =============================================================================
// Nav config — single source of truth for logged-in navigation
// =============================================================================
// Consumed by two components:
//   - Navbar's top-of-page link row (desktop): main section only; the settings
//     section lives under the avatar menu instead.
//   - Sidebar drawer (mobile): renders every section as a list.
// "Market" points at "/" — the storefront is the logged-in home, so farmers
// and buyers always have a way back to it from any app page.
// =============================================================================

import type { Role } from '../../types';

export interface NavItem {
  label: string;
  path: string;
  badge?: number;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export interface PendingCounts {
  bids?: number;
  negotiations?: number;
}

export function getNavSections(role: Role | undefined, pendingCounts?: PendingCounts): NavSection[] {
  if (role === 'ADMIN') {
    return [
      {
        title: 'Admin',
        items: [
          { label: 'Overview', path: '/admin' },
          { label: 'Users', path: '/admin/users' },
          { label: 'Partners', path: '/admin/partners' },
          { label: 'Listings', path: '/admin/listings' },
          { label: 'Transactions', path: '/admin/transactions' },
          { label: 'Equipment leads', path: '/admin/enquiries' },
          { label: 'Logistics', path: '/admin/logistics' },
          { label: 'Analytics', path: '/admin/analytics' },
        ],
      },
      {
        title: 'Settings',
        items: [
          { label: 'Account', path: '/settings' },
        ],
      },
    ];
  }

  if (role === 'FARMER') {
    return [
      {
        title: 'Menu',
        items: [
          { label: 'Market', path: '/' },
          { label: 'Overview', path: '/farmer' },
          { label: 'Listings', path: '/farmer/listings' },
          { label: 'Bids', path: '/farmer/bids', badge: pendingCounts?.bids },
          { label: 'Demand board', path: '/demand' },
          { label: 'Offers', path: '/farmer/offers' },
          { label: 'Auctions', path: '/auctions' },
          { label: 'Negotiations', path: '/negotiations', badge: pendingCounts?.negotiations },
          { label: 'Transactions', path: '/transactions' },
          { label: 'Deliveries', path: '/farmer/deliveries' },
          { label: 'Analytics', path: '/farmer/analytics' },
        ],
      },
      {
        title: 'Settings',
        items: [
          { label: 'Agent', path: '/agent' },
          { label: 'Account', path: '/settings' },
        ],
      },
    ];
  }

  // CONSUMER — the retail tier. Three items on purpose: a shopper buying a kilo
  // of tomatoes has no bids to chase, no demand to post and no lots to auction,
  // so everything the B2B menu carries would be dead weight. Shop is "/" for the
  // same reason it is for everyone else: the storefront IS the product.
  if (role === 'CONSUMER') {
    return [
      {
        title: 'Menu',
        items: [
          { label: 'Shop', path: '/' },
          { label: 'Orders', path: '/orders' },
        ],
      },
      {
        title: 'Settings',
        items: [
          { label: 'Account', path: '/settings' },
        ],
      },
    ];
  }

  // BUYER (and default before role loads)
  return [
    {
      title: 'Menu',
      items: [
        { label: 'Market', path: '/' },
        { label: 'Overview', path: '/buyer' },
        { label: 'Browse', path: '/buyer/browse' },
        { label: 'Bids', path: '/buyer/bids', badge: pendingCounts?.bids },
        // Two different things, so they get two different labels: the first is
        // this buyer's own demand, the second is everyone's.
        { label: 'My requirements', path: '/buyer/requirements' },
        { label: 'Demand board', path: '/demand' },
        { label: 'Auctions', path: '/auctions' },
        { label: 'Negotiations', path: '/negotiations', badge: pendingCounts?.negotiations },
        { label: 'Transactions', path: '/transactions' },
        { label: 'Analytics', path: '/buyer/analytics' },
      ],
    },
    {
      title: 'Settings',
      items: [
        { label: 'Agent', path: '/agent' },
        { label: 'Account', path: '/settings' },
      ],
    },
  ];
}

// Shared active-route test so the top nav and drawer highlight identically.
export function isNavItemActive(pathname: string, itemPath: string): boolean {
  return pathname === itemPath
    || (itemPath !== '/' && pathname.startsWith(itemPath + '/'));
}
