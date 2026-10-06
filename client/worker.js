// Runs only when no file in dist/ matches the request, so serving the site's
// real files never invokes it (and never counts against the Workers free
// request allowance). Cloudflare answers a browser navigation to an unknown
// path with the app shell before getting here (not_found_handling in
// wrangler.jsonc); this handles everything else that missed:
//
//   - /assets/* and /api/*: a plain 404. A missing script must fail as missing,
//     not come back as the homepage with a 200, which is what vercel.json's
//     rewrite exclusions guaranteed. The API lives on api.cropbid.in, never here.
//   - anything else (a crawler or a fetch without Sec-Fetch-Mode: navigate,
//     e.g. /orders): the app shell, the same answer a browser gets.

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/assets/') || pathname.startsWith('/api/')) {
      return new Response('Not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    return env.ASSETS.fetch(new Request(new URL('/', request.url), request));
  },
};
