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

import { existsSync } from 'fs';

// Hosts that mean "a database on this machine" no matter where we are running.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];

// docker-compose service names. Inside a container the database is reached by
// service name rather than localhost, so these have to pass — but `postgres`
// and `db` are local only by convention in this repo's compose file. A DNS
// record, a Kubernetes service, or a hosts entry could point either at a real
// database, and an unconditional allowlist would then hand the seed a remote
// target to wipe. They therefore count as local only inside a container.
const DOCKER_HOSTS = ['postgres', 'db'];

// Docker writes this marker into every container it builds.
function inDockerContainer(): boolean {
  return existsSync('/.dockerenv');
}

/**
 * True only when `url` points at a database on this machine.
 *
 * Anything unparseable, empty, or remote returns false — the caller should
 * treat false as "refuse to wipe". Erring toward refusal is the whole point:
 * a false negative costs a developer one env var, a false positive costs
 * production data.
 *
 * `inContainer` exists so the container-only branch is testable off a real
 * container; leave it unset outside tests.
 */
export function isLocalDatabase(
  url: string | undefined,
  { inContainer }: { inContainer?: boolean } = {},
): boolean {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    if (LOCAL_HOSTS.includes(hostname)) return true;
    return DOCKER_HOSTS.includes(hostname) && (inContainer ?? inDockerContainer());
  } catch {
    return false;
  }
}
