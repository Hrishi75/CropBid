// =============================================================================
// Seed guard tests
// =============================================================================
// Regression cover for a real incident: a developer .env pointing at hosted
// Neon while NODE_ENV was unset, which let `prisma db seed` past the old
// production check and straight into deleting live rows. The guard must key
// off the connection target, not the process environment.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { isLocalDatabase } from './seedGuard';

describe('isLocalDatabase', () => {
  it('accepts a local postgres URL', () => {
    expect(isLocalDatabase('postgresql://cropbid:cropbid_dev@localhost:5432/cropbid')).toBe(true);
    expect(isLocalDatabase('postgresql://cropbid:cropbid_dev@127.0.0.1:5432/cropbid')).toBe(true);
  });

  it('accepts the docker-compose service name inside a container', () => {
    // Inside a container the database is reached by service name, not localhost.
    expect(isLocalDatabase('postgresql://cropbid:pw@postgres:5432/cropbid', { inContainer: true })).toBe(true);
  });

  it('rejects the docker-compose service name outside a container', () => {
    // `postgres` is local only by compose convention. Off a container it may
    // resolve anywhere — including a real database — so the guard must not take
    // the name as proof of locality.
    expect(isLocalDatabase('postgresql://cropbid:pw@postgres:5432/cropbid', { inContainer: false })).toBe(false);
  });

  it('rejects `db`, which no compose service defines', () => {
    // Allowlisting it granted a generic name a pass on nothing but convention.
    expect(isLocalDatabase('postgresql://cropbid:pw@db:5432/cropbid', { inContainer: true })).toBe(false);
    expect(isLocalDatabase('postgresql://cropbid:pw@db:5432/cropbid', { inContainer: false })).toBe(false);
  });

  it('rejects hosted Neon — the case that caused the incident', () => {
    expect(
      isLocalDatabase('postgresql://user:pw@ep-little-hat-aqztqrnz-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require')
    ).toBe(false);
  });

  it('rejects any other remote host', () => {
    expect(isLocalDatabase('postgresql://user:pw@db.example.com:5432/prod')).toBe(false);
    expect(isLocalDatabase('postgresql://user:pw@10.0.0.5:5432/prod')).toBe(false);
  });

  it('rejects a hostname that merely contains a local name', () => {
    // Substring matching would wrongly accept these — the check is on the
    // parsed hostname, so it must be an exact match.
    expect(isLocalDatabase('postgresql://user:pw@localhost.evil.com:5432/prod')).toBe(false);
    expect(isLocalDatabase('postgresql://user:pw@notlocalhost:5432/prod')).toBe(false);
  });

  it('refuses when the URL is missing or unparseable', () => {
    expect(isLocalDatabase(undefined)).toBe(false);
    expect(isLocalDatabase('')).toBe(false);
    expect(isLocalDatabase('not a url')).toBe(false);
  });
});
