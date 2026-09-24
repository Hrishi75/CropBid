// =============================================================================
// Vitest — one test file at a time
// =============================================================================
// Several suites run against a REAL Postgres (the address book, the inputs and
// equipment catalogues, the admin deletes and the demo purge), and some of
// their assertions are about the whole table rather than their own rows: the
// inputs admin test checks that "what the panel counts as live is exactly what
// browse returns", which cannot hold while another file is adding products to
// the same database.
//
// Run in parallel those two files fail about two runs in five. It was a latent
// flake, found when a sixth database suite changed the interleaving enough to
// surface it in a full run: a race between the tests, not a bug in the code.
//
// The whole suite takes a few seconds either way, which is a cheap price for a
// red run always meaning something.
// =============================================================================

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
