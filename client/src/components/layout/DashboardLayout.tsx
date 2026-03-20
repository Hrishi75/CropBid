import { useState, type ReactNode } from 'react';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { Menu, X } from 'lucide-react';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface-alt">
      <Navbar />
      <div className="flex">
        {/* Desktop sidebar — hidden on mobile */}
        <Sidebar />

        {/* Mobile menu button — shown only on small screens */}
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="lg:hidden fixed bottom-4 right-4 z-40 w-12 h-12 bg-primary text-white rounded-full shadow-lg flex items-center justify-center"
        >
          <Menu className="w-6 h-6" />
        </button>

        {/* Mobile sidebar overlay */}
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Slide-in sidebar */}
            <div className="fixed inset-y-0 left-0 z-50 w-64 bg-surface shadow-xl lg:hidden animate-slideIn">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <span className="font-bold text-primary">Menu</span>
                <button onClick={() => setMobileMenuOpen(false)}>
                  <X className="w-5 h-5 text-text-muted" />
                </button>
              </div>
              <Sidebar mobile onNavigate={() => setMobileMenuOpen(false)} />
            </div>
          </>
        )}

        <main className="flex-1 p-4 md:p-6 max-w-7xl">
          {children}
        </main>
      </div>
    </div>
  );
}
