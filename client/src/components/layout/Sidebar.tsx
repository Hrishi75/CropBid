import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, Package, ShoppingCart, Bot, HandshakeIcon,
  BarChart3, Users, Receipt, Gavel
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

export function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();

  const farmerNav: NavItem[] = [
    { label: 'Dashboard', path: '/farmer', icon: <LayoutDashboard size={20} /> },
    { label: 'My Listings', path: '/farmer/listings', icon: <Package size={20} /> },
    { label: 'Incoming Bids', path: '/farmer/bids', icon: <ShoppingCart size={20} /> },
    { label: 'AI Agent', path: '/agent', icon: <Bot size={20} /> },
    { label: 'Negotiations', path: '/negotiations', icon: <HandshakeIcon size={20} /> },
    { label: 'Live Auctions', path: '/auctions', icon: <Gavel size={20} /> },
    { label: 'Transactions', path: '/transactions', icon: <Receipt size={20} /> },
    { label: 'Analytics', path: '/farmer/analytics', icon: <BarChart3 size={20} /> },
  ];

  const buyerNav: NavItem[] = [
    { label: 'Dashboard', path: '/buyer', icon: <LayoutDashboard size={20} /> },
    { label: 'Browse Listings', path: '/buyer/browse', icon: <Package size={20} /> },
    { label: 'My Bids', path: '/buyer/bids', icon: <ShoppingCart size={20} /> },
    { label: 'AI Agent', path: '/agent', icon: <Bot size={20} /> },
    { label: 'Negotiations', path: '/negotiations', icon: <HandshakeIcon size={20} /> },
    { label: 'Live Auctions', path: '/auctions', icon: <Gavel size={20} /> },
    { label: 'Transactions', path: '/transactions', icon: <Receipt size={20} /> },
    { label: 'Analytics', path: '/buyer/analytics', icon: <BarChart3 size={20} /> },
  ];

  const adminNav: NavItem[] = [
    { label: 'Dashboard', path: '/admin', icon: <LayoutDashboard size={20} /> },
    { label: 'Users', path: '/admin/users', icon: <Users size={20} /> },
    { label: 'Listings', path: '/admin/listings', icon: <Package size={20} /> },
    { label: 'Transactions', path: '/admin/transactions', icon: <Receipt size={20} /> },
    { label: 'Analytics', path: '/admin/analytics', icon: <BarChart3 size={20} /> },
  ];

  const navItems = user?.role === 'ADMIN' ? adminNav
    : user?.role === 'FARMER' ? farmerNav
    : buyerNav;

  return (
    <aside className="w-64 bg-surface border-r border-border-light min-h-[calc(100vh-4rem)] hidden lg:block">
      <nav className="p-4 space-y-1">
        {/* Trust score badge */}
        {user && user.role !== 'ADMIN' && (
          <div className="mb-4 p-3 rounded-lg bg-surface-alt">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-text-secondary">Trust Score</span>
              <span className="text-sm font-bold text-primary">
                {Math.round(user.trustScore)}/100
              </span>
            </div>
            <div className="w-full bg-border rounded-full h-2">
              <div
                className="bg-accent rounded-full h-2 transition-all"
                style={{ width: `${user.trustScore}%` }}
              />
            </div>
          </div>
        )}

        {/* Navigation items */}
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
                ${isActive
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text'
                }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
