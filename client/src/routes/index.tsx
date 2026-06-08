// =============================================================================
// Route Map — Single Source of Truth for Client URLs
// =============================================================================
// Declares every page in the app and which role(s) may see it. The structure:
//   - "/"                 → RootRedirect (sends each role to its dashboard)
//   - public auth routes  → /login, /signup, /onboarding
//   - role-gated routes   → wrapped in <ProtectedRoute allowedRoles={[...]}>
//   - catch-all "*"       → bounces unknown URLs back to "/"
//
// ProtectedRoute enforces auth + role + onboarding before rendering a page, so
// the lists below are the only place route-to-role mapping is defined.
// =============================================================================

import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, SESSION_HINT_KEY } from '../context/AuthContext';
import { ProtectedRoute } from './ProtectedRoute';

// Auth pages (public)
import { LoginPage } from '../pages/auth/LoginPage';
import { SignupPage } from '../pages/auth/SignupPage';
import { OnboardingPage } from '../pages/auth/OnboardingPage';

// Dashboard pages (protected)
import { FarmerDashboard } from '../pages/farmer/FarmerDashboard';
import { MyListings } from '../pages/farmer/MyListings';
import { CreateListing } from '../pages/farmer/CreateListing';
import { IncomingBids } from '../pages/farmer/IncomingBids';
import { BuyerDashboard } from '../pages/buyer/BuyerDashboard';
import { BrowseListings } from '../pages/buyer/BrowseListings';
import { MyBids } from '../pages/buyer/MyBids';
import { PlaceBid } from '../pages/buyer/PlaceBid';
import { AdminDashboard } from '../pages/admin/AdminDashboard';
import { AdminUsers } from '../pages/admin/AdminUsers';
import { AdminListings } from '../pages/admin/AdminListings';
import { AdminTransactions } from '../pages/admin/AdminTransactions';
import { AdminAnalytics } from '../pages/admin/AdminAnalytics';
import { FarmerAnalytics } from '../pages/farmer/FarmerAnalytics';
import { BuyerAnalytics } from '../pages/buyer/BuyerAnalytics';

// Shared pages
import { ListingDetail } from '../pages/shared/ListingDetail';
import { AgentConfigPage } from '../pages/shared/AgentConfigPage';
import { NegotiationList } from '../pages/shared/NegotiationList';
import { NegotiationChat } from '../pages/shared/NegotiationChat';
import { AuctionList } from '../pages/shared/AuctionList';
import { AuctionRoom } from '../pages/shared/AuctionRoom';
import { TransactionList } from '../pages/shared/TransactionList';
import { TransactionDetail } from '../pages/shared/TransactionDetail';
import { BookTransport } from '../pages/shared/BookTransport';
import { ShipmentTracking } from '../pages/shared/ShipmentTracking';
import { LandingPage } from '../pages/LandingPage';
import { AdminLogistics } from '../pages/admin/AdminLogistics';

/**
 * WHY a separate RootRedirect component?
 * The "/" route needs to send users to different dashboards based on
 * their role. We can't do this with a static <Navigate> because the
 * destination depends on runtime state (the logged-in user's role).
 */
function RootRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    // While the /auth/refresh check is in flight (slow when the API is cold):
    //   - returning visitor (has a session hint) → spinner, then redirect to dashboard
    //   - anonymous visitor (no hint) → render the static landing immediately,
    //     so a cold backend never blocks the public homepage.
    const hadSession = (() => {
      try { return localStorage.getItem(SESSION_HINT_KEY) === '1'; } catch { return false; }
    })();

    if (!hadSession) return <LandingPage />;

    return (
      <div className="min-h-screen bg-surface-alt flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return <LandingPage />;

  switch (user.role) {
    case 'FARMER': return <Navigate to="/farmer" replace />;
    case 'BUYER':  return <Navigate to="/buyer" replace />;
    case 'ADMIN':  return <Navigate to="/admin" replace />;
    default:       return <Navigate to="/login" replace />;
  }
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Root — smart redirect based on role */}
      <Route path="/" element={<RootRedirect />} />

      {/* Public auth routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />

      {/* Farmer routes */}
      <Route
        path="/farmer"
        element={
          <ProtectedRoute allowedRoles={['FARMER']}>
            <FarmerDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/farmer/listings"
        element={
          <ProtectedRoute allowedRoles={['FARMER']}>
            <MyListings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/farmer/listings/new"
        element={
          <ProtectedRoute allowedRoles={['FARMER']}>
            <CreateListing />
          </ProtectedRoute>
        }
      />

      <Route
        path="/farmer/listings/:id/edit"
        element={
          <ProtectedRoute allowedRoles={['FARMER']}>
            <CreateListing />
          </ProtectedRoute>
        }
      />

      <Route
        path="/farmer/bids"
        element={
          <ProtectedRoute allowedRoles={['FARMER']}>
            <IncomingBids />
          </ProtectedRoute>
        }
      />
      <Route
        path="/farmer/analytics"
        element={
          <ProtectedRoute allowedRoles={['FARMER']}>
            <FarmerAnalytics />
          </ProtectedRoute>
        }
      />

      {/* Buyer routes */}
      <Route
        path="/buyer"
        element={
          <ProtectedRoute allowedRoles={['BUYER']}>
            <BuyerDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/buyer/browse"
        element={
          <ProtectedRoute allowedRoles={['BUYER']}>
            <BrowseListings />
          </ProtectedRoute>
        }
      />

      <Route
        path="/buyer/bids"
        element={
          <ProtectedRoute allowedRoles={['BUYER']}>
            <MyBids />
          </ProtectedRoute>
        }
      />
      <Route
        path="/buyer/analytics"
        element={
          <ProtectedRoute allowedRoles={['BUYER']}>
            <BuyerAnalytics />
          </ProtectedRoute>
        }
      />

      {/* Shared routes */}
      <Route
        path="/listings/:id"
        element={
          <ProtectedRoute>
            <ListingDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/agent"
        element={
          <ProtectedRoute allowedRoles={['FARMER', 'BUYER']}>
            <AgentConfigPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/negotiations"
        element={
          <ProtectedRoute allowedRoles={['FARMER', 'BUYER']}>
            <NegotiationList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/negotiations/:id"
        element={
          <ProtectedRoute allowedRoles={['FARMER', 'BUYER']}>
            <NegotiationChat />
          </ProtectedRoute>
        }
      />

      <Route
        path="/listings/:id/bid"
        element={
          <ProtectedRoute allowedRoles={['BUYER']}>
            <PlaceBid />
          </ProtectedRoute>
        }
      />
      <Route
        path="/auctions"
        element={
          <ProtectedRoute allowedRoles={['FARMER', 'BUYER']}>
            <AuctionList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/auctions/:listingId"
        element={
          <ProtectedRoute allowedRoles={['FARMER', 'BUYER']}>
            <AuctionRoom />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transactions"
        element={
          <ProtectedRoute>
            <TransactionList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transactions/:id"
        element={
          <ProtectedRoute>
            <TransactionDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/logistics/book/:transactionId"
        element={
          <ProtectedRoute allowedRoles={['FARMER', 'BUYER']}>
            <BookTransport />
          </ProtectedRoute>
        }
      />
      <Route
        path="/logistics/shipment/transaction/:transactionId"
        element={
          <ProtectedRoute allowedRoles={['FARMER', 'BUYER']}>
            <ShipmentTracking />
          </ProtectedRoute>
        }
      />

      {/* Admin routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminUsers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/listings"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminListings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/transactions"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminTransactions />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/analytics"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminAnalytics />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/logistics"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminLogistics />
          </ProtectedRoute>
        }
      />

      {/* Catch-all — redirect to root (which then redirects by role) */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
