// =============================================================================
// DashboardLayout — Shell wrapper for all logged-in pages
// =============================================================================
// Provides the standard app chrome: the top Navbar (bar + horizontal nav links)
// and the page content area. Navigation sits at the top of the page on desktop;
// on small screens the hamburger opens the Sidebar as a slide-in drawer, with a
// tap-to-close backdrop. Pages render as children.
// =============================================================================

import { useState, type ReactNode } from 'react';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="cb-app">
      <Sidebar mobile={mobileMenuOpen} onNavigate={() => setMobileMenuOpen(false)} />

      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            zIndex: 55,
          }}
          aria-hidden="true"
        />
      )}

      <Navbar onMenuClick={() => setMobileMenuOpen(true)} />
      <main className="cb-page">{children}</main>
    </div>
  );
}
