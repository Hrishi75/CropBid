import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Analytics } from '@vercel/analytics/react';
import { AuthProvider } from './context/AuthContext';
import { AppRoutes } from './routes';

/**
 * App wrapping order matters:
 *
 * BrowserRouter (outermost) — provides routing context
 *   └─ AuthProvider — provides user state (needs router for nothing, but
 *                     routes need auth, so auth wraps routes)
 *       └─ AppRoutes — actual page rendering
 *
 * Toaster sits outside the tree — it's a portal that renders toast
 * notifications in a fixed position regardless of page structure.
 */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
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
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
