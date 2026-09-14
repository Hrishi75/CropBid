// =============================================================================
// Address book — exactly one default, always
// =============================================================================
// The interesting property is not CRUD, it is the invariant: a shopper has
// exactly one default address at every committed moment. It cannot be a partial
// unique index, because setting a new default UPDATEs the old row rather than
// deleting it and the constraint would fire mid-transaction on a state one
// statement away from being correct. So it is held in the service, and these
// are the ways it could slip:
//
//   1. The first address must be default whatever the request said, or checkout
//      opens on nothing when the shopper has exactly one saved.
//   2. Promoting a second must demote the first, not add a second default.
//   3. Deleting the default must promote another, not leave the book with none.
//   4. Deleting a non-default must leave the default alone.
//   5. None of it may reach another account's rows.
//
// Runs against a real Postgres, because every one of these is about what the
// database actually holds after a transaction commits. A mocked client would
// only be testing that this file calls the functions this file calls.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../lib/prisma';
import {
  createAddress, deleteAddress, listAddresses, setDefaultAddress, updateAddress,
} from './address.service';

const USER = 'addr-user-1';
const OTHER = 'addr-user-2';

const input = (label: string, extra: Record<string, unknown> = {}) => ({
  label, line: `${label} street, Pune`, city: 'Pune', ...extra,
});

async function seedUser(id: string) {
  await prisma.user.create({
    data: { id, name: id, email: `${id}@test.local`, password: 'x', role: 'CONSUMER', location: 'Pune' },
  });
}

beforeEach(async () => {
  await prisma.address.deleteMany({ where: { userId: { in: [USER, OTHER] } } });
  await prisma.user.deleteMany({ where: { id: { in: [USER, OTHER] } } });
  await seedUser(USER);
  await seedUser(OTHER);
});

afterAll(async () => {
  await prisma.address.deleteMany({ where: { userId: { in: [USER, OTHER] } } });
  await prisma.user.deleteMany({ where: { id: { in: [USER, OTHER] } } });
  await prisma.$disconnect();
});

/** How many of this user's addresses claim to be the default. Must always be 1. */
const defaults = (userId: string) =>
  prisma.address.count({ where: { userId, isDefault: true } });

describe('the first address', () => {
  it('is the default even when the request did not ask', async () => {
    const a = await createAddress(USER, input('Home'));
    expect(a.isDefault).toBe(true);
  });

  it('is the default even when the request explicitly said false', async () => {
    // Otherwise a shopper with exactly one saved address has to go and pick it.
    const a = await createAddress(USER, { ...input('Home'), isDefault: false });
    expect(a.isDefault).toBe(true);
  });
});

describe('adding more', () => {
  it('leaves the first as default when the new one does not ask', async () => {
    const home = await createAddress(USER, input('Home'));
    const work = await createAddress(USER, input('Work'));

    expect(work.isDefault).toBe(false);
    expect((await prisma.address.findUniqueOrThrow({ where: { id: home.id } })).isDefault).toBe(true);
    expect(await defaults(USER)).toBe(1);
  });

  it('demotes the old default when the new one asks for it', async () => {
    const home = await createAddress(USER, input('Home'));
    const work = await createAddress(USER, { ...input('Work'), isDefault: true });

    expect(work.isDefault).toBe(true);
    expect((await prisma.address.findUniqueOrThrow({ where: { id: home.id } })).isDefault).toBe(false);
    expect(await defaults(USER)).toBe(1);
  });
});

describe('promoting', () => {
  it('moves the default rather than adding one', async () => {
    const home = await createAddress(USER, input('Home'));
    const work = await createAddress(USER, input('Work'));

    await setDefaultAddress(USER, work.id);

    expect(await defaults(USER)).toBe(1);
    expect((await prisma.address.findUniqueOrThrow({ where: { id: work.id } })).isDefault).toBe(true);
    expect((await prisma.address.findUniqueOrThrow({ where: { id: home.id } })).isDefault).toBe(false);
  });

  it('is idempotent on the address that already holds it', async () => {
    const home = await createAddress(USER, input('Home'));
    await setDefaultAddress(USER, home.id);
    expect(await defaults(USER)).toBe(1);
  });

  it('via update carries the same guarantee', async () => {
    const home = await createAddress(USER, input('Home'));
    const work = await createAddress(USER, input('Work'));

    await updateAddress(USER, work.id, { ...input('Work'), isDefault: true });

    expect(await defaults(USER)).toBe(1);
    expect((await prisma.address.findUniqueOrThrow({ where: { id: home.id } })).isDefault).toBe(false);
  });
});

describe('deleting', () => {
  it('promotes another when the default goes', async () => {
    const home = await createAddress(USER, input('Home'));
    await createAddress(USER, input('Work'));

    await deleteAddress(USER, home.id);

    // Leaving no default would open checkout on nothing despite a saved book.
    expect(await defaults(USER)).toBe(1);
  });

  it('leaves the default alone when a different one goes', async () => {
    const home = await createAddress(USER, input('Home'));
    const work = await createAddress(USER, input('Work'));

    await deleteAddress(USER, work.id);

    expect((await prisma.address.findUniqueOrThrow({ where: { id: home.id } })).isDefault).toBe(true);
    expect(await defaults(USER)).toBe(1);
  });

  it('empties cleanly when the last one goes', async () => {
    const home = await createAddress(USER, input('Home'));
    await deleteAddress(USER, home.id);
    expect(await listAddresses(USER)).toEqual([]);
  });
});

describe("another account's addresses", () => {
  // The id is the only thing a client supplies, so ownership cannot be assumed
  // from it. Every one of these would be a cross-account write if the service
  // matched on id alone.
  it('cannot be read', async () => {
    await createAddress(OTHER, input('Theirs'));
    expect(await listAddresses(USER)).toEqual([]);
  });

  it('cannot be edited', async () => {
    const theirs = await createAddress(OTHER, input('Theirs'));
    await expect(updateAddress(USER, theirs.id, input('Mine'))).rejects.toMatchObject({ statusCode: 404 });
    expect((await prisma.address.findUniqueOrThrow({ where: { id: theirs.id } })).label).toBe('Theirs');
  });

  it('cannot be deleted', async () => {
    const theirs = await createAddress(OTHER, input('Theirs'));
    await expect(deleteAddress(USER, theirs.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(await prisma.address.count({ where: { id: theirs.id } })).toBe(1);
  });

  it('cannot be promoted', async () => {
    const theirs = await createAddress(OTHER, input('Theirs'));
    await expect(setDefaultAddress(USER, theirs.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('validation', () => {
  it('refuses a blank label', async () => {
    await expect(createAddress(USER, input('   '))).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses a blank line', async () => {
    await expect(createAddress(USER, { label: 'Home', line: '  ', city: 'Pune' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('trims what it stores', async () => {
    const a = await createAddress(USER, { label: '  Home  ', line: '  12 MG Road  ', city: 'Pune' });
    expect(a.label).toBe('Home');
    expect(a.line).toBe('12 MG Road');
  });
});
