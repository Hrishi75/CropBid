import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LogOut, Moon, Sun } from 'lucide-react';
import { NotificationDropdown } from './NotificationDropdown';

export function Navbar() {
  const { user, logout } = useAuth();
  const [dark, setDark] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <nav className="bg-primary text-white shadow-lg sticky top-0 z-50" role="navigation" aria-label="Main navigation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 lg:h-24">
          {/* Logo — scales by breakpoint */}
          <Link to="/" className="flex items-center shrink-0" aria-label="CropBid Home">
            <img
              src="/CropBidlogo.png"
              alt="CropBid"
              className="h-12 sm:h-16 lg:h-20 object-contain"
            />
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Dark mode toggle */}
            <button
              onClick={() => setDark(!dark)}
              className="p-2 rounded-lg hover:bg-primary-light transition-colors"
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {user ? (
              <>
                <NotificationDropdown />

                {/* User info */}
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-sm font-bold" aria-hidden="true">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-sm font-medium leading-tight">{user.name}</p>
                    <p className="text-xs text-accent-light">{user.role}</p>
                  </div>
                </div>

                <button
                  onClick={logout}
                  className="p-2 rounded-lg hover:bg-primary-light transition-colors"
                  aria-label="Log out"
                >
                  <LogOut size={20} />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2 sm:gap-3">
                <Link
                  to="/login"
                  className="px-3 py-1.5 sm:px-4 sm:py-2 text-sm rounded-lg hover:bg-primary-light transition-colors"
                >
                  Login
                </Link>
                <Link
                  to="/signup"
                  className="px-3 py-1.5 sm:px-4 sm:py-2 text-sm bg-accent rounded-lg hover:bg-accent-dark transition-colors"
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
