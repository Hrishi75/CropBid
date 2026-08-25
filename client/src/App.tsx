import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { CartBar } from './components/consumer/CartBar';
import { AppRoutes } from './routes';
import { useSeo } from './lib/useSeo';

/**
 * App wrapping order matters:
 *
 * BrowserRouter (outermost) — provides routing context
 *   └─ AppContent
 *       └─ AuthProvider — provides user state (needs router for nothing, but
 *                         routes need auth, so auth wraps routes)
 *           └─ CartProvider — the shopper's basket. Inside auth because the
 *                             basket is stored per account, and outside the
 *                             routes because it must survive navigation
 *                             between the shelf, a product and the checkout.
 *               └─ AppRoutes — actual page rendering
 *
 * Toaster sits outside the tree — it's a portal that renders toast
 * notifications in a fixed position regardless of page structure.
 */

/**
 * The router-agnostic half of the app, shared by two entry points:
 *   - this file wraps it in BrowserRouter for the browser
 *   - entry-server.tsx wraps it in StaticRouter to prerender public pages
 *
 * Toaster and Analytics deliberately stay OUT of it. Both are browser-only side
 * effects with nothing to contribute to static markup, and keeping them on the
 * client side of the line means the prerender build never has to load them.
 *
 * useSeo() lives here because it needs router context (useLocation) and must
 * run for every route.
 */
export function AppContent() {
  useSeo();

  return (
    <AuthProvider>
      <CartProvider>
        <AppRoutes />
        {/* Sits outside the routes so it survives every consumer page, and
            renders nothing at all for anyone who isn't shopping. */}
        <CartBar />
      </CartProvider>
    </AuthProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border-light)',
          },
        }}
      />
      <Analytics />
    </BrowserRouter>
  );
}

export default App;
