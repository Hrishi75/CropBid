// =============================================================================
// ProtectedRoute — Auth/Role/Onboarding Gate
// =============================================================================
// Wraps any page that must not be shown to the wrong user. Used throughout
// routes/index.tsx. See the JSDoc on the component below for the exact rules.
// =============================================================================

import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isPendingPartner } from '../utils/partner';
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
  // Admins don't need a profile, and neither do consumers: a household has no
  // farm and no company, so there is no FarmerProfile or BuyerProfile to fill
  // in. Without this exemption a shopper would bounce off /onboarding forever,
  // since that page only knows how to build the other two.
  if (user.role !== 'ADMIN' && user.role !== 'CONSUMER' && !user.farmerProfile && !user.buyerProfile) {
    return <Navigate to="/onboarding" replace />;
  }

  // Profile exists but the application isn't approved → the status page is
  // the only "dashboard" this account gets. The server enforces the same rule
  // (requireApprovedPartner), so this is navigation, not security.
  if (isPendingPartner(user)) {
    return <Navigate to="/partner/status" replace />;
  }

  // Role check — if route specifies allowed roles and user doesn't match
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to their own dashboard instead of showing 403.
    // A consumer's home is the storefront — they have no dashboard by design.
    const home = user.role === 'FARMER' ? '/farmer'
      : user.role === 'BUYER' ? '/buyer'
      : user.role === 'CONSUMER' ? '/'
      : '/admin';
    return <Navigate to={home} replace />;
  }

  return <>{children}</>;
}
