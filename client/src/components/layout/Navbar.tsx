// =============================================================================
// Navbar — Top-of-page header for all logged-in pages
// =============================================================================
// Two rows: the bar (mobile menu toggle, wordmark, role-aware search box,
// notification bell, avatar menu) and the primary nav — a horizontal row of
// role links that replaces the old left sidebar on desktop. On small screens
// the link row hides and the hamburger opens the slide-in drawer instead.
// The avatar menu holds the settings links (Agent/Account) and sign out.
//
// NOTE: the search box is presentational for now — typing updates local state
// but is not yet wired to a search endpoint.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { NotificationDropdown } from './NotificationDropdown';
import { getNavSections, isNavItemActive } from './nav';

interface NavbarProps {
  onMenuClick?: () => void;
}

export function Navbar({ onMenuClick }: NavbarProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [mainSection, settingsSection] = getNavSections(user?.role);

  // Close the avatar menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const initials = user?.name
    ? user.name.split(/\s+/).slice(0, 2).map((n) => n[0]).join('').toUpperCase()
    : '?';

  const searchPlaceholder = user?.role === 'FARMER'
    ? 'Search bids, buyers, lots…'
    : user?.role === 'BUYER'
      ? 'Search lots, sellers, regions…'
      : 'Search users, lots, txns…';

  return (
    <header className="cb-nav-wrap" role="banner">
      <div className="cb-nav">
        <button
          type="button"
          onClick={onMenuClick}
          className="cb-mobile-nav-toggle"
          aria-label="Open menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <Link to="/" className="wordmark cb-nav-brand" aria-label="CropBid home">
          <span style={{ display: 'inline-flex', width: 22, height: 22 }}>
            <ArcMark size={22} />
          </span>
          <span className="wordmark-text">CropBid</span>
        </Link>

        <div className="cb-nav-search">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ color: 'var(--cb-ink-3)' }}>
            <circle cx="6" cy="6" r="4.5" />
            <path d="M9.5 9.5L12 12" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search"
          />
        </div>

        <div className="cb-nav-actions">
          {user && (
            <>
              <NotificationDropdown />
              <div ref={menuRef} style={{ position: 'relative' }}>
                <button
                  className="cb-nav-avatar"
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-label={user.name}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                >
                  {initials}
                </button>
                {menuOpen && (
                  <div className="cb-card cb-nav-menu" role="menu">
                    <div className="cb-nav-menu-id">
                      <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--cb-ink)' }}>{user.name}</span>
                      <span className="cb-tiny" style={{ textTransform: 'lowercase' }}>{user.role.toLowerCase()}</span>
                    </div>
                    {settingsSection?.items.map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        role="menuitem"
                        className="cb-nav-menu-link"
                        onClick={() => setMenuOpen(false)}
                      >
                        {item.label}
                      </Link>
                    ))}
                    <button
                      type="button"
                      role="menuitem"
                      className="cb-nav-menu-link"
                      onClick={() => { setMenuOpen(false); logout(); }}
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <nav className="cb-topnav" aria-label="Primary">
        {mainSection.items.map((item) => {
          const isActive = isNavItemActive(location.pathname, item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={isActive ? 'page' : undefined}
              className={`cb-topnav-link ${isActive ? 'active' : ''}`}
            >
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="cb-count">{item.badge}</span>
              )}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

// Local copy of the logo arc (a fixed-color variant of ui/Brand's ArcMark).
// Kept inline so the navbar wordmark has no cross-component dependency.
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
