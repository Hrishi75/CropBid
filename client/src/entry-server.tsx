// =============================================================================
// Server Entry — used only by scripts/prerender.mjs at build time
// =============================================================================
// Renders a public route to an HTML string so the deployed site ships real
// markup instead of an empty <div id="root">. This is the difference between
// a crawler seeing the page and seeing nothing:
//
//   - Googlebot CAN run JavaScript, but does it on a second pass that can lag
//     the first crawl by days or weeks. Static markup gets indexed immediately.
//   - The AI crawlers (GPTBot, PerplexityBot, ClaudeBot, CCBot) mostly DON'T run
//     JavaScript at all. Without this, they see a blank page — the site can
//     never be cited in an AI answer.
//
// WHAT GETS RENDERED: the component tree only, with no data fetching. Every
// page loads its data in useEffect, and effects don't run during
// renderToString — so a prerendered page carries its headings, hero copy, nav,
// footer and structured data, but its live data (rates, listings) arrives when
// React takes over in the browser. That is the right trade: the durable,
// indexable content is exactly the part that renders statically, and today's
// mandi prices would be stale in a build artefact anyway.
//
// Note there is NO stylesheet import here. index.css is imported by main.tsx
// for the browser; pulling it into the SSR bundle would make Node parse 90KB of
// CSS to produce markup that references it by class name only.
// =============================================================================

import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { AppContent } from './App';
import './i18n';

export function render(url: string): string {
  return renderToString(
    <StaticRouter location={url}>
      <AppContent />
    </StaticRouter>,
  );
}

// Re-exported so the prerender script reads the route manifest through the
// compiled bundle. Node can't import the .ts source directly, and duplicating
// the list in a .mjs file is exactly the drift this avoids.
export { ROUTES, INDEXABLE_ROUTES, SITE, canonicalUrl, fullTitle } from './lib/seo';
