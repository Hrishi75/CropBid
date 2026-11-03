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

import { lazy, type ComponentType } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ProtectedRoute } from './ProtectedRoute';

// Every page but the storefront is loaded when it is first opened, so a visitor
// to "/" or /faq does not download the admin panel, the dashboards and checkout.
// The storefront stays in the main bundle because it is where most visits land.
//
// There is deliberately no <Suspense> boundary around the routes. main.tsx
// mounts with createRoot over the prerendered HTML, and a fallback would be
// committed in place of that HTML, blanking the page until the chunk arrived.
// With no boundary the root waits: the prerendered page stays on screen, and on
// navigation (React Router wraps it in a transition) the old page stays until
// the new one is ready. The build's prerender waits for these too
// (prerenderToNodeStream in entry-server.tsx).
function lazyPage<M, K extends keyof M>(load: () => Promise<M>, key: K) {
  return lazy(() => load().then((m) => ({ default: m[key] as unknown as ComponentType })));
}

// Auth pages (public)
const LoginPage = lazyPage(() => import('../pages/auth/LoginPage'), 'LoginPage');
const SignupPage = lazyPage(() => import('../pages/auth/SignupPage'), 'SignupPage');
const OnboardingPage = lazyPage(() => import('../pages/auth/OnboardingPage'), 'OnboardingPage');
const ForgotPasswordPage = lazyPage(() => import('../pages/auth/ForgotPasswordPage'), 'ForgotPasswordPage');
const ResetPasswordPage = lazyPage(() => import('../pages/auth/ResetPasswordPage'), 'ResetPasswordPage');
const ChangePasswordPage = lazyPage(() => import('../pages/auth/ChangePasswordPage'), 'ChangePasswordPage');

// Partner flow — the seller/buyer door. The landing is public; the status
// page manages its own auth (it must stay reachable to PENDING partners, so
// it cannot sit behind ProtectedRoute's approval gate).
const PartnerPage = lazyPage(() => import('../pages/partner/PartnerPage'), 'PartnerPage');
const PartnerStatusPage = lazyPage(() => import('../pages/partner/PartnerStatusPage'), 'PartnerStatusPage');

// Dashboard pages (protected)
const FarmerDashboard = lazyPage(() => import('../pages/farmer/FarmerDashboard'), 'FarmerDashboard');
const MyListings = lazyPage(() => import('../pages/farmer/MyListings'), 'MyListings');
const CreateListing = lazyPage(() => import('../pages/farmer/CreateListing'), 'CreateListing');
const IncomingBids = lazyPage(() => import('../pages/farmer/IncomingBids'), 'IncomingBids');
const Deliveries = lazyPage(() => import('../pages/farmer/Deliveries'), 'Deliveries');
const DemandBoard = lazyPage(() => import('../pages/shared/DemandBoard'), 'DemandBoard');
const MyOffers = lazyPage(() => import('../pages/farmer/MyOffers'), 'MyOffers');
const CreditApply = lazyPage(() => import('../pages/buyer/CreditApply'), 'CreditApply');
const ContractsPage = lazyPage(() => import('../pages/shared/ContractsPage'), 'ContractsPage');
const BuyerDashboard = lazyPage(() => import('../pages/buyer/BuyerDashboard'), 'BuyerDashboard');
const BrowseListings = lazyPage(() => import('../pages/buyer/BrowseListings'), 'BrowseListings');
const MyBids = lazyPage(() => import('../pages/buyer/MyBids'), 'MyBids');
const MyRequirements = lazyPage(() => import('../pages/buyer/MyRequirements'), 'MyRequirements');
const CreateRequirement = lazyPage(() => import('../pages/buyer/CreateRequirement'), 'CreateRequirement');
const RequirementDetail = lazyPage(() => import('../pages/buyer/RequirementDetail'), 'RequirementDetail');
const PlaceBid = lazyPage(() => import('../pages/buyer/PlaceBid'), 'PlaceBid');
const RestockList = lazyPage(() => import('../pages/buyer/RestockList'), 'RestockList');
const AdminDashboard = lazyPage(() => import('../pages/admin/AdminDashboard'), 'AdminDashboard');
const AdminUsers = lazyPage(() => import('../pages/admin/AdminUsers'), 'AdminUsers');
const AdminPartners = lazyPage(() => import('../pages/admin/AdminPartners'), 'AdminPartners');
const AdminListings = lazyPage(() => import('../pages/admin/AdminListings'), 'AdminListings');
const AdminTransactions = lazyPage(() => import('../pages/admin/AdminTransactions'), 'AdminTransactions');
const AdminEnquiries = lazyPage(() => import('../pages/admin/AdminEnquiries'), 'AdminEnquiries');
const AdminCredit = lazyPage(() => import('../pages/admin/AdminCredit'), 'AdminCredit');
const AdminIncidents = lazyPage(() => import('../pages/admin/AdminIncidents'), 'AdminIncidents');
const AdminInputs = lazyPage(() => import('../pages/admin/AdminInputs'), 'AdminInputs');
const AdminEquipment = lazyPage(() => import('../pages/admin/AdminEquipment'), 'AdminEquipment');
const AdminAnalytics = lazyPage(() => import('../pages/admin/AdminAnalytics'), 'AdminAnalytics');
const FarmerAnalytics = lazyPage(() => import('../pages/farmer/FarmerAnalytics'), 'FarmerAnalytics');
const BuyerAnalytics = lazyPage(() => import('../pages/buyer/BuyerAnalytics'), 'BuyerAnalytics');

// Consumer (retail) pages — deliberately a small set. A shopper gets a product
// page, a cart, a checkout and their orders; everything else in the app is B2B.
const ProductDetail = lazyPage(() => import('../pages/consumer/ProductDetail'), 'ProductDetail');
const ShopDetail = lazyPage(() => import('../pages/consumer/ShopDetail'), 'ShopDetail');
const Cart = lazyPage(() => import('../pages/consumer/Cart'), 'Cart');
const Checkout = lazyPage(() => import('../pages/consumer/Checkout'), 'Checkout');
const BuyNowRedirect = lazyPage(() => import('../pages/consumer/Checkout'), 'BuyNowRedirect');
const MyOrders = lazyPage(() => import('../pages/consumer/MyOrders'), 'MyOrders');
const OrderDetail = lazyPage(() => import('../pages/consumer/OrderDetail'), 'OrderDetail');

// Shared pages
const ListingDetail = lazyPage(() => import('../pages/shared/ListingDetail'), 'ListingDetail');
const AgentConfigPage = lazyPage(() => import('../pages/shared/AgentConfigPage'), 'AgentConfigPage');
const NegotiationList = lazyPage(() => import('../pages/shared/NegotiationList'), 'NegotiationList');
const NegotiationChat = lazyPage(() => import('../pages/shared/NegotiationChat'), 'NegotiationChat');
const AuctionList = lazyPage(() => import('../pages/shared/AuctionList'), 'AuctionList');
const AuctionRoom = lazyPage(() => import('../pages/shared/AuctionRoom'), 'AuctionRoom');
const TransactionList = lazyPage(() => import('../pages/shared/TransactionList'), 'TransactionList');
const TransactionDetail = lazyPage(() => import('../pages/shared/TransactionDetail'), 'TransactionDetail');
const BookTransport = lazyPage(() => import('../pages/shared/BookTransport'), 'BookTransport');
const ShipmentTracking = lazyPage(() => import('../pages/shared/ShipmentTracking'), 'ShipmentTracking');
import { LandingPage } from '../pages/LandingPage';
const HowItWorksPage = lazyPage(() => import('../pages/landing/HowItWorksPage'), 'HowItWorksPage');
const RatesPage = lazyPage(() => import('../pages/RatesPage'), 'RatesPage');
const ForecastPage = lazyPage(() => import('../pages/ForecastPage'), 'ForecastPage');
const SchemesPage = lazyPage(() => import('../pages/SchemesPage'), 'SchemesPage');
const PublicDemandPage = lazyPage(() => import('../pages/PublicDemandPage'), 'PublicDemandPage');
const EquipmentPage = lazyPage(() => import('../pages/EquipmentPage'), 'EquipmentPage');
const AgriInputsPage = lazyPage(() => import('../pages/AgriInputsPage'), 'AgriInputsPage');
const FaqPage = lazyPage(() => import('../pages/FaqPage'), 'FaqPage');
const TermsPage = lazyPage(() => import('../pages/TermsPage'), 'TermsPage');
const PrivacyPolicyPage = lazyPage(() => import('../pages/PrivacyPolicyPage'), 'PrivacyPolicyPage');
const AdminLogistics = lazyPage(() => import('../pages/admin/AdminLogistics'), 'AdminLogistics');
const SettingsPage = lazyPage(() => import('../pages/shared/SettingsPage'), 'SettingsPage');

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

// A session whose password support reset can go to one place. The server is
// what enforces that (the authenticate middleware refuses everything else);
// this is so the user meets a screen that explains it instead of a page that
// fails to load. It sits above every route rather than inside ProtectedRoute
// because the storefront and the marketing pages are not protected, and a
// shopper is exactly who this happens to.
function PasswordChangeGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();

  if (!loading && user?.mustChangePassword && pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return <>{children}</>;
}

export function AppRoutes() {
  return (
    <PasswordChangeGate>
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
      <Route path="/inputs" element={<AgriInputsPage />} />
      {/* Linked from the footer, and the URL given to Google Play's Data Safety
          form — it must stay publicly reachable without a login. */}
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />

      {/* Public auth routes */}
      <Route path="/login" element={<LoginPage />} />
      {/* Not public, but not behind ProtectedRoute either: it is where a
          reset account lands whatever its role, and the gate above is what
          sends it here. */}
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/partner" element={<PartnerPage />} />
      <Route path="/partner/status" element={<PartnerStatusPage />} />
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
        path="/contracts"
        element={
          <ProtectedRoute allowedRoles={['BUYER', 'FARMER']}>
            <ContractsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/buyer/credit"
        element={
          <ProtectedRoute allowedRoles={['BUYER']}>
            <CreditApply />
          </ProtectedRoute>
        }
      />
      <Route
        path="/buyer/requirements/new"
        element={
          <ProtectedRoute allowedRoles={['BUYER']}>
            <CreateRequirement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/buyer/requirements/list"
        element={
          <ProtectedRoute allowedRoles={['BUYER']}>
            <RestockList />
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
          the pages that hang off it.

          "/store/:id" is one SELLER's whole counter; "/shop/:id" is one LOT.
          Different words on purpose: a path pair differing by a single letter
          is the kind of thing that gets mixed up at 2am.

          The shop page is deliberately PUBLIC, unlike the lot page. It is the
          window a stranger looks through, and ShelfCard already sends a guest
          who tries to add something to signup — so the gate is the cart, not
          the window. */}
      <Route path="/store/:id" element={<ShopDetail />} />
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
      {/*
        Booking is ops, not self-service. CropBid picks the carrier itself, so
        this page moved out of the farmer/buyer routes and into admin. The
        server agrees: /logistics/book, /quote and /partners/:transactionId are
        all requireRole('ADMIN') now, so a stale bookmark gets a 403 rather
        than a broken form.

        The reason for owning the booking is the quality check at pickup, which
        is intent rather than code: see CLAUDE.md §2b.
      */}
      <Route
        path="/admin/logistics/book/:transactionId"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <BookTransport />
          </ProtectedRoute>
        }
      />
      <Route
        path="/logistics/shipment/transaction/:transactionId"
        element={
          <ProtectedRoute allowedRoles={['FARMER', 'BUYER', 'ADMIN']}>
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
        path="/admin/partners"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminPartners />
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
        path="/admin/credit"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminCredit />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/incidents"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminIncidents />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/inputs"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminInputs />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/equipment"
        element={
          <ProtectedRoute allowedRoles={['ADMIN']}>
            <AdminEquipment />
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
    </PasswordChangeGate>
  );
}
