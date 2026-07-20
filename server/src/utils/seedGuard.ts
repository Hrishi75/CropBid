// =============================================================================
// Seed Guard — is this connection string safe to wipe?
// =============================================================================
// Seeding deletes every row in every table. The only question that matters
// before it runs is "whose database is this?", and the honest answer lives in
// DATABASE_URL — not in NODE_ENV.
//
// WHY THIS IS ITS OWN MODULE
// prisma/seed.ts calls main() at import time, so a test importing that file
// would run the seed. The decision therefore lives here, where it can be
// tested without touching a database.
// =============================================================================

// Hosts that mean "a database on this machine". The docker-compose service
// names are included because inside a container the database is reached by
// service name rather than localhost.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', 'postgres', 'db'];

/**
 * True only when `url` points at a database on this machine.
 *
 * Anything unparseable, empty, or remote returns false — the caller should
 * treat false as "refuse to wipe". Erring toward refusal is the whole point:
 * a false negative costs a developer one env var, a false positive costs
 * production data.
 */
export function isLocalDatabase(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return LOCAL_HOSTS.includes(hostname);
  } catch {
    return false;
  }
}
