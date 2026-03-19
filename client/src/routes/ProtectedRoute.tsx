import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
}

/**
 * Route guard with three responsibilities:
 * 1. Redirect unauthenticated users → /login
 * 2. Redirect users without a profile → /onboarding
 * 3. Restrict access by role (optional)
 *
 * WHY check for profile completion?
 * After signup, the user exists but hasn't filled in their
 * FarmerProfile or BuyerProfile yet. We don't want them accessing
 * the dashboard with an incomplete account.
 */
export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  // While restoring session (refresh token check), show nothing
  // This prevents a flash of the login page on hard refresh
  if (loading) {
    return (
      <div className="min-h-screen bg-surface-alt flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Not logged in → login page
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Logged in but no profile yet → onboarding
  // Admin users don't need a profile
  if (user.role !== 'ADMIN' && !user.farmerProfile && !user.buyerProfile) {
    return <Navigate to="/onboarding" replace />;
  }

  // Role check — if route specifies allowed roles and user doesn't match
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to their own dashboard instead of showing 403
    const home = user.role === 'FARMER' ? '/farmer'
      : user.role === 'BUYER' ? '/buyer'
      : '/admin';
    return <Navigate to={home} replace />;
  }

  return <>{children}</>;
}
