// =============================================================================
// Sidebar — Role-aware primary navigation
// =============================================================================
// Builds the nav menu from the logged-in user's role (farmer / buyer / admin),
// highlights the active route, shows optional pending-count badges, and holds
// the user identity + sign-out at the bottom. On mobile it slides in via the
// `mobile` prop; onNavigate closes it after a link tap.
// =============================================================================

import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface NavItem {
  label: string;
  path: string;
  badge?: number;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface SidebarProps {
  mobile?: boolean;
  onNavigate?: () => void;
  pendingCounts?: { bids?: number; negotiations?: number };
}

export function Sidebar({ mobile, onNavigate, pendingCounts }: SidebarProps = {}) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const farmerSections: NavSection[] = [
    {
      title: 'Dashboard',
      items: [
        { label: 'Overview', path: '/farmer' },
        { label: 'Listings', path: '/farmer/listings' },
        { label: 'Bids', path: '/farmer/bids', badge: pendingCounts?.bids },
        { label: 'Auctions', path: '/auctions' },
        { label: 'Negotiations', path: '/negotiations', badge: pendingCounts?.negotiations },
        { label: 'Transactions', path: '/transactions' },
        { label: 'Analytics', path: '/farmer/analytics' },
      ],
    },
    {
      title: 'Settings',
      items: [
        { label: 'Agent', path: '/agent' },
      ],
    },
  ];

  const buyerSections: NavSection[] = [
    {
      title: 'Dashboard',
      items: [
        { label: 'Overview', path: '/buyer' },
        { label: 'Browse', path: '/buyer/browse' },
        { label: 'Bids', path: '/buyer/bids', badge: pendingCounts?.bids },
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
      ],
    },
  ];

  const adminSections: NavSection[] = [
    {
      title: 'Admin',
      items: [
        { label: 'Overview', path: '/admin' },
        { label: 'Users', path: '/admin/users' },
        { label: 'Listings', path: '/admin/listings' },
        { label: 'Transactions', path: '/admin/transactions' },
        { label: 'Logistics', path: '/admin/logistics' },
        { label: 'Analytics', path: '/admin/analytics' },
      ],
    },
  ];

  const sections = user?.role === 'ADMIN' ? adminSections
    : user?.role === 'FARMER' ? farmerSections
    : buyerSections;

  return (
    <aside
      className={`cb-sidebar ${mobile ? 'open' : ''}`}
      role="navigation"
      aria-label="Sidebar"
    >
      <Link to="/" className="wordmark" style={{ padding: '4px 10px 8px' }} onClick={onNavigate}>
        <span style={{ display: 'inline-flex', width: 22, height: 22 }}>
          <ArcMark size={22} />
        </span>
        <span className="wordmark-text">CropBid</span>
      </Link>

      {sections.map((section) => (
        <div key={section.title} className="cb-sidebar-section">
          <div className="cb-sidebar-section-title">{section.title}</div>
          {section.items.map((item) => {
            const isActive = location.pathname === item.path
              || (item.path !== '/' && location.pathname.startsWith(item.path + '/'));
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onNavigate}
                aria-current={isActive ? 'page' : undefined}
                className={`cb-sidebar-link ${isActive ? 'active' : ''}`}
              >
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="cb-count">{item.badge}</span>
                )}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="cb-sidebar-footer">
        {user && (
          <div style={{ padding: '8px 10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--cb-ink)' }}>{user.name}</span>
            <span className="cb-tiny" style={{ textTransform: 'lowercase' }}>{user.role.toLowerCase()}</span>
          </div>
        )}
        <button
          type="button"
          onClick={logout}
          className="cb-sidebar-link"
          style={{ width: '100%', background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

// Local copy of the logo arc (a fixed-color variant of ui/Brand's ArcMark).
// Kept inline so the sidebar wordmark has no cross-component dependency.
function ArcMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path d="M5 30C5 17 10 8 20 8s15 9 15 22" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="5" cy="30" r="3.6" fill="currentColor" />
      <circle cx="35" cy="30" r="3.6" fill="currentColor" />
      <circle cx="20" cy="8" r="2.6" fill="#c8602b" />
    </svg>
  );
}
