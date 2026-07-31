// =============================================================================
// Prerender — turn the SPA into static HTML for every public route
// =============================================================================
// Runs as the last step of `npm run build`, after both Vite passes:
//
//   1. vite build              → dist/           (browser bundle + index.html)
//   2. vite build --ssr        → dist-ssr/       (Node-loadable entry-server.js)
//   3. node scripts/prerender  → dist/<path>/index.html for each public route
//                                + dist/sitemap.xml
//
// The output is still a plain static site — no server, no serverless function,
// nothing new to run or pay for on Vercel. Each public URL just happens to be a
// real HTML file now instead of a redirect into an empty shell.
//
// FAILURE POLICY: this script throws rather than warning. A silent prerender
// failure ships a site that looks fine in a browser and is invisible to every
// crawler — the exact bug this whole pipeline exists to prevent, and one nobody
// would notice for weeks. Breaking the build is the cheaper outcome.
// =============================================================================

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, 'dist');
const ssrEntry = join(root, 'dist-ssr', 'entry-server.js');

const APP_MARKER = '<!--app-html-->';
const SEO_OPEN = '<!--seo-->';
const SEO_CLOSE = '<!--/seo-->';

/** Escape for use inside a double-quoted HTML attribute. */
const attr = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Escape for use as HTML text content. */
const text = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * `</script>` anywhere inside a JSON-LD payload would close the script tag
 * early and spill JSON into the document. Splitting the sequence keeps the JSON
 * byte-identical to a parser while making it inert to the HTML tokenizer.
 */
const jsonLdSafe = (obj) => JSON.stringify(obj, null, 2).replace(/<\//g, '<\\/');

function headFor(route, { SITE, canonicalUrl, fullTitle }) {
  const url = canonicalUrl(route.path);
  const title = fullTitle(route.title);
  const indexable = route.index !== false;

  const robots = indexable
    ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
    : 'noindex, follow';

  return [
    `<title>${text(title)}</title>`,
    `<meta name="description" content="${attr(route.description)}" />`,
    `<link rel="canonical" href="${attr(url)}" />`,
    `<meta name="robots" content="${attr(robots)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${attr(SITE.name)}" />`,
    `<meta property="og:url" content="${attr(url)}" />`,
    `<meta property="og:title" content="${attr(title)}" />`,
    `<meta property="og:description" content="${attr(route.description)}" />`,
    `<meta property="og:image" content="${attr(SITE.ogImage)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="en_IN" />`,
    `<meta property="og:locale:alternate" content="hi_IN" />`,
    `<meta property="og:locale:alternate" content="mr_IN" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:site" content="${attr(SITE.twitter)}" />`,
    `<meta name="twitter:title" content="${attr(title)}" />`,
    `<meta name="twitter:description" content="${attr(route.description)}" />`,
    `<meta name="twitter:image" content="${attr(SITE.ogImage)}" />`,
  ].join('\n    ');
}

/**
 * Page-level structured data: a breadcrumb trail (so Google can show the URL as
 * "cropbid.in › Mandi rates" instead of a bare link) plus whatever the route
 * declared — an FAQPage on /how-it-works, a Dataset on /rates.
 */
function pageJsonLd(route, { SITE, canonicalUrl, fullTitle }) {
  const graph = [];

  if (route.path !== '/') {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE.origin}/` },
        { '@type': 'ListItem', position: 2, name: route.title, item: canonicalUrl(route.path) },
      ],
    });
  }

  graph.push({
    '@type': 'WebPage',
    '@id': `${canonicalUrl(route.path)}#webpage`,
    url: canonicalUrl(route.path),
    name: fullTitle(route.title),
    description: route.description,
    isPartOf: { '@id': `${SITE.origin}/#website` },
    inLanguage: 'en-IN',
  });

  if (route.jsonLd) graph.push({ ...route.jsonLd, url: canonicalUrl(route.path) });

  return `<script type="application/ld+json">\n${jsonLdSafe({
    '@context': 'https://schema.org',
    '@graph': graph,
  })}\n</script>`;
}

function sitemap(routes, { canonicalUrl }) {
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = routes
    .map((r) =>
      [
        '  <url>',
        `    <loc>${canonicalUrl(r.path)}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
        r.changefreq ? `    <changefreq>${r.changefreq}</changefreq>` : null,
        r.priority ? `    <priority>${r.priority}</priority>` : null,
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

async function main() {
  const mod = await import(pathToFileURL(ssrEntry).href);
  const { render, ROUTES, INDEXABLE_ROUTES, SITE, canonicalUrl, fullTitle } = mod;
  const helpers = { SITE, canonicalUrl, fullTitle };

  const template = await readFile(join(distDir, 'index.html'), 'utf8');

  for (const marker of [APP_MARKER, SEO_OPEN, SEO_CLOSE]) {
    if (!template.includes(marker)) {
      throw new Error(
        `prerender: "${marker}" is missing from index.html. ` +
          `The markers are how routes get their own head tags and markup — restore it.`,
      );
    }
  }

  // Plain index arithmetic rather than a regex — the markers contain `/`, `*`
  // and `-`, and escaping them correctly is more error-prone than slicing.
  const seoStart = template.indexOf(SEO_OPEN);
  const seoEnd = template.indexOf(SEO_CLOSE) + SEO_CLOSE.length;
  const beforeSeo = template.slice(0, seoStart);
  const afterSeo = template.slice(seoEnd);

  for (const route of ROUTES) {
    const appHtml = render(route.path);

    if (!appHtml.trim()) {
      throw new Error(
        `prerender: ${route.path} rendered to an empty string. ` +
          `Most likely the page bailed out server-side — check for a browser-only ` +
          `API being touched during render rather than in an effect.`,
      );
    }

    const head = `${headFor(route, helpers)}\n    ${pageJsonLd(route, helpers)}`;
    const html = `${beforeSeo}${SEO_OPEN}\n    ${head}\n    ${SEO_CLOSE}${afterSeo}`.replace(
      APP_MARKER,
      appHtml,
    );

    const outFile =
      route.path === '/'
        ? join(distDir, 'index.html')
        : join(distDir, route.path.replace(/^\//, ''), 'index.html');

    await mkdir(dirname(outFile), { recursive: true });
    await writeFile(outFile, html, 'utf8');

    const kb = (Buffer.byteLength(appHtml) / 1024).toFixed(1);
    console.log(`  prerendered ${route.path.padEnd(16)} ${kb.padStart(7)} KB of markup`);
  }

  await writeFile(join(distDir, 'sitemap.xml'), sitemap(INDEXABLE_ROUTES, helpers), 'utf8');
  console.log(`  sitemap.xml   ${INDEXABLE_ROUTES.length} indexable URLs`);
}

main().catch((err) => {
  console.error('\nprerender failed:\n', err);
  process.exit(1);
});
