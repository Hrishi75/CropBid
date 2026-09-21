// =============================================================================
// The deploy build: transpile, do not type-check
// =============================================================================
// WHY THIS EXISTS. `npm run build` is `tsc`, which type-checks the whole
// program and peaks around 750 MB. The production host is a 1 GB Lightsail
// box, where V8 caps the old space near 460 MB, so tsc dies there with "heap
// out of memory" and the deploy stops half way: migrations have already run,
// the build fails, and the old process keeps serving a database it no longer
// matches. That is exactly what happened on 2026-09-20.
//
// Types are still checked on every change, in CI, on a runner with the memory
// for it (.github/workflows/ci.yml runs `npm run build`, which is tsc, and a
// type error fails the PR). Nothing reaches main unchecked, so the box only
// needs JavaScript out the other end, and esbuild does that in about 130 MB.
//
// FILE FOR FILE, NOT BUNDLED. The output keeps src/'s shape under dist/, so
// every relative import still resolves, the generated Prisma client sits where
// it expects to, and `node dist/index.js` is unchanged. Bundling would be
// smaller and would also need special handling for Prisma's engine and for
// anything loaded dynamically: no reason to take that on here.
//
// Tests are left out on purpose: they are not shipped, and vitest's imports
// would pull devDependencies into the output. The same goes for `*.fake.ts`,
// stand-ins that exist only for tests to import (mandiFeed.fake.ts).
// =============================================================================

const { readdirSync, statSync } = require('fs');
const { join } = require('path');
const esbuild = require('esbuild');

function typescriptFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return typescriptFiles(path);
    const testOnly = path.endsWith('.test.ts') || path.endsWith('.fake.ts');
    return path.endsWith('.ts') && !testOnly ? [path] : [];
  });
}

const entryPoints = typescriptFiles('src');

esbuild.build({
  entryPoints,
  outdir: 'dist',
  outbase: 'src',
  platform: 'node',
  // Matches the "target" in tsconfig.json: the box runs a current Node, so
  // there is nothing to down-level.
  target: 'node20',
  format: 'cjs',
  // Stack traces from production point at the TypeScript line that threw.
  sourcemap: true,
  logLevel: 'info',
}).then(() => {
  console.log(`Built ${entryPoints.length} files to dist/`);
}).catch(() => process.exit(1));
