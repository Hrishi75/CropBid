// =============================================================================
// Sidebar — Mobile navigation drawer
// =============================================================================
// Slide-in drawer for small screens only; desktop navigation lives in the
// Navbar's top-of-page link row. Renders every nav section (menu + settings)
// from the shared config in components/layout/nav.ts, plus the user identity
// and sign-out at the bottom. onNavigate closes the drawer after a link tap.
// =============================================================================

import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { getNavSections, isNavItemActive, type PendingCounts } from './nav';

interface SidebarProps {
  mobile?: boolean;
  onNavigate?: () => void;
  pendingCounts?: PendingCounts;
}

export function Sidebar({ mobile, onNavigate, pendingCounts }: SidebarProps = {}) {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  const sections = getNavSections(user?.role, pendingCounts);

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
          <div className="cb-sidebar-section-title">{t(section.title)}</div>
          {section.items.map((item) => {
            const isActive = isNavItemActive(location.pathname, item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onNavigate}
                aria-current={isActive ? 'page' : undefined}
                className={`cb-sidebar-link ${isActive ? 'active' : ''}`}
              >
                <span>{t(item.label)}</span>
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
          {t('Sign out')}
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
