// =============================================================================
// Address book — where a shopper has things delivered
// =============================================================================
// Every function here is scoped to one user, and the userId always comes from
// the session rather than the request body. There is no shape of request that
// reads or edits somebody else's addresses.
//
// EXACTLY ONE DEFAULT, and it is this file's job rather than the database's.
// A partial unique index (`WHERE isDefault`) cannot express it, because setting
// a new default UPDATEs the old row rather than deleting it: the constraint
// fires mid-transaction on a state that is about to be corrected one statement
// later. So the invariant is held by doing both writes inside one transaction,
// clear-then-set, and never one without the other.
// =============================================================================

import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import type { Prisma } from '../generated/prisma/client';

/** Longest an address line may be. Generous: Indian addresses run long. */
const MAX_LINE = 500;
const MAX_LABEL = 40;

export interface AddressInput {
  label: string;
  line: string;
  city: string;
  phone?: string | null;
  landmark?: string | null;
  isDefault?: boolean;
}

/** Default first, then newest. The order the picker shows them in. */
export async function listAddresses(userId: string) {
  return prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
}

function clean(input: AddressInput) {
  const label = input.label?.trim();
  const line = input.line?.trim();
  const city = input.city?.trim();

  if (!label) throw new ApiError(400, 'Give this address a name, like Home or Office');
  if (!line) throw new ApiError(400, 'Enter the address');
  if (!city) throw new ApiError(400, 'Pick the city this address is in');

  return {
    label: label.slice(0, MAX_LABEL),
    line: line.slice(0, MAX_LINE),
    city,
    phone: input.phone?.trim() || null,
    landmark: input.landmark?.trim()?.slice(0, MAX_LINE) || null,
  };
}

/**
 * Make one address the default, clearing whichever held it.
 *
 * Always called inside a transaction with whatever created or updated the row,
 * so there is never a committed moment with two defaults or none.
 */
async function makeDefault(tx: Prisma.TransactionClient, userId: string, addressId: string) {
  await tx.address.updateMany({
    where: { userId, isDefault: true, NOT: { id: addressId } },
    data: { isDefault: false },
  });
  await tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
}

export async function createAddress(userId: string, input: AddressInput) {
  const data = clean(input);

  return prisma.$transaction(async (tx) => {
    // THE FIRST ADDRESS IS ALWAYS THE DEFAULT, whatever the request said. An
    // address book whose only entry is not the default gives checkout nothing
    // to start on, and the shopper has to go and pick the one thing there is.
    const existing = await tx.address.count({ where: { userId } });
    const shouldDefault = existing === 0 || input.isDefault === true;

    const address = await tx.address.create({
      data: { ...data, userId, isDefault: false },
    });

    if (shouldDefault) await makeDefault(tx, userId, address.id);

    return tx.address.findUniqueOrThrow({ where: { id: address.id } });
  });
}

export async function updateAddress(userId: string, addressId: string, input: AddressInput) {
  const data = clean(input);

  return prisma.$transaction(async (tx) => {
    // Ownership checked inside the transaction and by userId, not just by id.
    // `update` on an id alone would happily edit a row belonging to somebody
    // else, and the id is the only thing a client supplies.
    const owned = await tx.address.findFirst({ where: { id: addressId, userId } });
    if (!owned) throw new ApiError(404, 'Address not found');

    await tx.address.update({ where: { id: addressId }, data });

    if (input.isDefault === true) await makeDefault(tx, userId, addressId);

    return tx.address.findUniqueOrThrow({ where: { id: addressId } });
  });
}

export async function setDefaultAddress(userId: string, addressId: string) {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.address.findFirst({ where: { id: addressId, userId } });
    if (!owned) throw new ApiError(404, 'Address not found');
    await makeDefault(tx, userId, addressId);
    return tx.address.findUniqueOrThrow({ where: { id: addressId } });
  });
}

export async function deleteAddress(userId: string, addressId: string) {
  await prisma.$transaction(async (tx) => {
    const owned = await tx.address.findFirst({ where: { id: addressId, userId } });
    if (!owned) throw new ApiError(404, 'Address not found');

    await tx.address.delete({ where: { id: addressId } });

    // DELETING THE DEFAULT PROMOTES ANOTHER. Leaving the book with no default
    // is a state nothing else in the app expects: checkout would open with
    // nothing selected even though the shopper has three addresses saved.
    if (owned.isDefault) {
      const next = await tx.address.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      if (next) await makeDefault(tx, userId, next.id);
    }
  });
}
