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
      <div className="cb-shell">
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

        <div className="cb-main">
          <Navbar onMenuClick={() => setMobileMenuOpen(true)} />
          <main className="cb-page">{children}</main>
        </div>
      </div>
    </div>
  );
}
