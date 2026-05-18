import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { NotificationDropdown } from './NotificationDropdown';

interface NavbarProps {
  onMenuClick?: () => void;
}

export function Navbar({ onMenuClick }: NavbarProps) {
  const { user } = useAuth();
  const [search, setSearch] = useState('');

  const initials = user?.name
    ? user.name.split(/\s+/).slice(0, 2).map((n) => n[0]).join('').toUpperCase()
    : '?';

  const searchPlaceholder = user?.role === 'FARMER'
    ? 'Search bids, buyers, lots…'
    : user?.role === 'BUYER'
      ? 'Search lots, sellers, regions…'
      : 'Search users, lots, txns…';

  return (
    <header className="cb-nav" role="banner">
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
            <button className="cb-nav-avatar" type="button" aria-label={user.name}>
              {initials}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
