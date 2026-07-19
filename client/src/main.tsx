// =============================================================================
// Client Entry Point
// =============================================================================
// This is the very first file the browser runs. Vite injects it via index.html.
// It mounts the React tree into the <div id="root"> element and wires in the
// global stylesheet.
//
// StrictMode is a dev-only wrapper that double-invokes effects/renders to surface
// unsafe side effects early. It has no effect in production builds.
// =============================================================================

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.tsx'

// document.getElementById('root') can theoretically be null; the "!" asserts it
// exists because index.html always ships the #root container.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
