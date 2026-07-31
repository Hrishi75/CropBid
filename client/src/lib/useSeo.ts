// =============================================================================
// useSeo — keeps <head> in step with client-side navigation
// =============================================================================
// The prerenderer bakes correct head tags into every public page, so the FIRST
// document a visitor (or a crawler) loads is already right. But a SPA route
// change never reloads the document, so those baked-in tags would then describe
// the previous page — a visitor who lands on /rates and clicks through to
// /schemes would still have "Today's Mandi Rates" in the tab, and Googlebot's
// render pass would see the same staleness.
//
// This hook re-applies the manifest entry for the current path on every
// navigation. Mounted once, in App — no per-page wiring.
//
// WHY NOT React 19's built-in <title>/<meta> hoisting: it would emit those tags
// inline inside #root during renderToString, which is where the prerenderer
// splices markup into the body. The tags would end up in <body>, not <head>.
// An effect sidesteps that entirely — effects don't run during server render.
// =============================================================================

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SITE, canonicalUrl, fullTitle, routeMeta } from './seo';

/** Create-or-update a <meta> tag, keyed by name= or property=. */
function setMeta(attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}

export function useSeo() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = routeMeta(pathname);

    // Signed-in surfaces aren't in the manifest and are disallowed in
    // robots.txt. They still deserve a truthful tab title rather than whatever
    // the last public page left behind.
    const title = meta ? fullTitle(meta.title) : SITE.name;
    const description = meta?.description ?? '';
    const url = meta ? canonicalUrl(meta.path) : `${SITE.origin}${pathname}`;

    document.title = title;
    setMeta('property', 'og:title', title);
    setMeta('name', 'twitter:title', title);
    setMeta('property', 'og:url', url);
    setCanonical(url);

    if (description) {
      setMeta('name', 'description', description);
      setMeta('property', 'og:description', description);
      setMeta('name', 'twitter:description', description);
    }

    // Only public pages should advertise as indexable. Everything else gets an
    // explicit noindex — belt and braces alongside the robots.txt Disallow,
    // which stops crawling but not indexing of a URL discovered elsewhere.
    setMeta(
      'name',
      'robots',
      meta && meta.index !== false
        ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
        : 'noindex, follow',
    );
  }, [pathname]);
}
