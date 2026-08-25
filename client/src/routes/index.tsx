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
import { useAuth } from '../context/AuthContext';
import { ProtectedRoute } from './ProtectedRoute';

// Auth pages (public)
import { LoginPage } from '../pages/auth/LoginPage';
import { SignupPage } from '../pages/auth/SignupPage';
import { OnboardingPage } from '../pages/auth/OnboardingPage';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage';

// Dashboard pages (protected)
import { FarmerDashboard } from '../pages/farmer/FarmerDashboard';
import { MyListings } from '../pages/farmer/MyListings';
import { CreateListing } from '../pages/farmer/CreateListing';
import { IncomingBids } from '../pages/farmer/IncomingBids';
import { Deliveries } from '../pages/farmer/Deliveries';
import { DemandBoard } from '../pages/shared/DemandBoard';
import { MyOffers } from '../pages/farmer/MyOffers';
import { BuyerDashboard } from '../pages/buyer/BuyerDashboard';
import { BrowseListings } from '../pages/buyer/BrowseListings';
import { MyBids } from '../pages/buyer/MyBids';
import { MyRequirements } from '../pages/buyer/MyRequirements';
import { CreateRequirement } from '../pages/buyer/CreateRequirement';
import { RequirementDetail } from '../pages/buyer/RequirementDetail';
import { PlaceBid } from '../pages/buyer/PlaceBid';
import { AdminDashboard } from '../pages/admin/AdminDashboard';
import { AdminUsers } from '../pages/admin/AdminUsers';
import { AdminListings } from '../pages/admin/AdminListings';
import { AdminTransactions } from '../pages/admin/AdminTransactions';
import { AdminEnquiries } from '../pages/admin/AdminEnquiries';
import { AdminAnalytics } from '../pages/admin/AdminAnalytics';
import { FarmerAnalytics } from '../pages/farmer/FarmerAnalytics';
import { BuyerAnalytics } from '../pages/buyer/BuyerAnalytics';

// Consumer (retail) pages — deliberately a small set. A shopper gets a product
// page, a cart, a checkout and their orders; everything else in the app is B2B.
import { ProductDetail } from '../pages/consumer/ProductDetail';
import { Cart } from '../pages/consumer/Cart';
import { Checkout, BuyNowRedirect } from '../pages/consumer/Checkout';
import { MyOrders } from '../pages/consumer/MyOrders';
import { OrderDetail } from '../pages/consumer/OrderDetail';

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
import { HowItWorksPage } from '../pages/landing/HowItWorksPage';
import { RatesPage } from '../pages/RatesPage';
import { ForecastPage } from '../pages/ForecastPage';
import { SchemesPage } from '../pages/SchemesPage';
import { PublicDemandPage } from '../pages/PublicDemandPage';
import { EquipmentPage } from '../pages/EquipmentPage';
import { PrivacyPolicyPage } from '../pages/PrivacyPolicyPage';
import { AdminLogistics } from '../pages/admin/AdminLogistics';
import { SettingsPage } from '../pages/shared/SettingsPage';

/**
 * WHY a separate RootRedirect component?
 * The "/" route is role-dependent, so a static <Navigate> can't express it.
 * Guests AND logged-in farmers/buyers get the marketplace storefront — the
 * store is the home for everyone; the header adapts to who's looking at it.
 * Only admins are redirected away (to the ops dashboard).
 */
function RootRedirect() {
  const { user, loading } = useAuth();

  // The storefront renders straight away for everyone, including while
  // /auth/refresh is still in flight.
  //
  // A returning visitor used to get a full-page spinner here instead. That was
  // the worst flicker on the site: "/" is prerendered, so the browser had
  // ALREADY painted the whole storefront from static HTML — and the first thing
  // the bundle did on every reload was replace it with a blank page and a
  // spinner, then put it back once the session check answered. On a cold API
  // that lasted seconds.
  //
  // The spinner only ever existed so an admin wouldn't glimpse the storefront
  // before being bounced. Showing them their own home page for one round-trip
  // is a much smaller cost than blanking the page for every farmer and buyer,
  // so the redirect just waits until the check has actually answered.
  if (!loading && user?.role === 'ADMIN') return <Navigate to="/admin" replace />;

  return <LandingPage />;
}

/**
 * /crop-demand is the anonymised, crawlable version of the demand board. A
 * signed-in farmer or buyer has access to the real one, so they get bounced —
 * nobody should be working off redacted data they're entitled to see in full.
 *
 * Renders the public page while the session check is in flight, so a cold
 * backend never blocks a page whose whole job is being fast for a stranger.
 * Admins have no demand board of their own, so they stay on the public view.
 */
function PublicDemandRoute() {
  const { user, loading } = useAuth();

  if (!loading && (user?.role === 'FARMER' || user?.role === 'BUYER')) {
    return <Navigate to="/demand" replace />;
  }
  return <PublicDemandPage />;
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Root — smart redirect based on role */}
      <Route path="/" element={<RootRedirect />} />

      {/* Public marketing routes */}
      <Route path="/how-it-works" element={<HowItWorksPage />} />
      <Route path="/rates" element={<RatesPage />} />
      <Route path="/forecast" element={<ForecastPage />} />
      <Route path="/schemes" element={<SchemesPage />} />
      {/* Public shop window for open demand — an acquisition surface, and the
          reason it is prerendered. A signed-in farmer or buyer has access to
          the real board, so send them there rather than let them work off the
          anonymised copy. */}
      <Route path="/crop-demand" element={<PublicDemandRoute />} />
      {/* Machinery is lead-gen, not checkout — browsing stays public so it
          works as a farmer acquisition surface; only enquiring needs a login. */}
      <Route path="/equipment" element={<EquipmentPage />} />
      {/* Linked from the footer, and the URL given to Google Play's Data Safety
          form — it must stay publicly reachable without a login. */}
      <Route path="/privacy" element={<PrivacyPolicyPage />} />

      {/* Public auth routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

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
      {/* Shared demand board. Farmers act on it, buyers read it — so it lives
          at a role-neutral path rather than under /farmer. The old
          /farmer/requirements URL still resolves, for links already in the
          wild and for anyone's bookmarks. */}
      <Route
        path="/demand"
        element={
          <ProtectedRoute allowedRoles={['FARMER', 'BUYER']}>
            <DemandBoard />
          </ProtectedRoute>
        }
      />
      <Route path="/farmer/requirements" element={<Navigate to="/demand" replace />} />
      <Route
        path="/farmer/offers"
        element={
          <ProtectedRoute allowedRoles={['FARMER']}>
            <MyOffers />
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
      <Route
        path="/farmer/deliveries"
        element={
          <ProtectedRoute allowedRoles={['FARMER']}>
            <Deliveries />
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

      {/* Requirements — /new and /:id/edit declared before /:id, matching how
          the farmer's listing routes are ordered. */}
      <Route
        path="/buyer/requirements/new"
        element={
          <ProtectedRoute allowedRoles={['BUYER']}>
            <CreateRequirement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/buyer/requirements/:id/edit"
        element={
          <ProtectedRoute allowedRoles={['BUYER']}>
            <CreateRequirement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/buyer/requirements/:id"
        element={
          <ProtectedRoute allowedRoles={['BUYER']}>
            <RequirementDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/buyer/requirements"
        element={
          <ProtectedRoute allowedRoles={['BUYER']}>
            <MyRequirements />
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

      {/* Consumer (retail) routes. The storefront itself is "/" — the same
          LandingPage everyone lands on — so there is no /shop index here, only
          the pages that hang off it. */}
      <Route
        path="/shop/:id"
        element={
          <ProtectedRoute allowedRoles={['CONSUMER']}>
            <ProductDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/cart"
        element={
          <ProtectedRoute allowedRoles={['CONSUMER']}>
            <Cart />
          </ProtectedRoute>
        }
      />
      <Route
        path="/checkout"
        element={
          <ProtectedRoute allowedRoles={['CONSUMER']}>
            <Checkout />
          </ProtectedRoute>
        }
      />
      {/* Legacy one-lot checkout. The shop now buys through the cart, but this
          URL is bookmarked and pasted, so it drops the lot into the basket and
          hands over to the real checkout rather than 404ing. */}
      <Route
        path="/checkout/:listingId"
        element={
          <ProtectedRoute allowedRoles={['CONSUMER']}>
            <BuyNowRedirect />
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders"
        element={
          <ProtectedRoute allowedRoles={['CONSUMER']}>
            <MyOrders />
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders/:id"
        element={
          <ProtectedRoute allowedRoles={['CONSUMER']}>
            <OrderDetail />
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
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
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
        path="/admin/enquiries"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminEnquiries />
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
