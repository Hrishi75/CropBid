// =============================================================================
// Embedded mode — this page is inside the phone app, not in a browser
// =============================================================================
// The app shows /terms, /privacy and /faq by loading these very pages: a plain
// iframe on web, a WebView on native (mobile/src/screens/profile/PolicyScreen).
// That keeps one copy of each legal document rather than two that drift, which
// CLAUDE.md §5 cares about a great deal.
//
// What it must NOT bring along is the website around the document. Inside the
// app the reader gets a cookie banner about browser storage they are not using,
// a nav bar offering "Marketplace" and "Sign in" that would navigate the frame
// away from the app, and a footer of links to more of the site. None of that is
// wrong on the web; all of it is wrong in a phone app.
//
// A QUERY PARAM, NOT A FRAME CHECK. `window.self !== window.top` would catch
// the web iframe and miss a native WebView entirely, because that renders the
// page as the top-level document. The app appends the flag itself, so both
// surfaces are covered by the same signal.
// =============================================================================

/** True when the app asked for this page, via `?app=1`. */
export function isEmbedded(): boolean {
  if (typeof window === 'undefined') return false; // prerender
  try {
    return new URLSearchParams(window.location.search).get('app') === '1';
  } catch {
    return false;
  }
}
