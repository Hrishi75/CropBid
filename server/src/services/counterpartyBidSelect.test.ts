// =============================================================================
// COUNTERPARTY_BID_SELECT: the allowlist has to stay an allowlist
// =============================================================================
// Bid.deliveryAddress and Bid.contactPhone are the buyer's real phone number and
// real street address, snapshotted at bid time. They leaked on five endpoints at
// once (accept, reject, counter, the negotiation reads, and the requirement
// fill) for one reason: every one of them wrote `include`, and `include` returns
// every scalar on the row. Nobody chose to send the phone number. Nobody had to.
//
// So the test that matters is not "are the two bad columns absent". That is
// true of any select somebody writes today. It is "has every column on Bid been
// classified", which is the property that survives the next migration. Add a
// column to the model and this fails until someone says, in this file, whether
// the other side of the deal may see it.
//
// The schema is parsed rather than the generated client imported: this suite
// runs with no database and no `prisma generate`, and the .prisma file is the
// thing a migration actually edits.

import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { COUNTERPARTY_BID_SELECT } from './contactVisibility';

const SCHEMA = readFileSync(
  path.join(__dirname, '../../prisma/schema.prisma'),
  'utf8',
);

/** Every `model X {` in the schema, used to tell a relation from a scalar. */
function modelNames(schema: string): Set<string> {
  return new Set(
    [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1] as string),
  );
}

/** The scalar (non-relation) columns of one model, in declaration order. */
function scalarFieldsOf(schema: string, model: string): string[] {
  const models = modelNames(schema);
  const body = schema.match(
    new RegExp(`^model\\s+${model}\\s*\\{([\\s\\S]*?)^\\}`, 'm'),
  )?.[1];
  if (!body) throw new Error(`model ${model} not found in schema.prisma`);

  const fields: string[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;
    const match = trimmed.match(/^(\w+)\s+(\w+)/);
    if (!match) continue;
    const [, name, type] = match as unknown as [string, string, string];
    if (models.has(type)) continue; // a relation, not a column
    fields.push(name);
  }
  return fields;
}

// Columns deliberately kept from the other side of the deal. Each one needs a
// reason, because "we forgot" is what this file exists to make impossible.
const WITHHELD: Record<string, string> = {
  // The whole point of contactVisibility.ts: released by redactBidContact only
  // once the money is captured, never by a raw select.
  deliveryAddress: "the buyer's street address, until the deal is paid for",
  contactPhone: "the buyer's phone number, until the deal is paid for",
  // Minted by the buyer's client to make one direct purchase idempotent. Not
  // sensitive, just nobody else's business.
  idempotencyKey: 'a client-minted retry key, meaningless to the counterparty',
};

describe('COUNTERPARTY_BID_SELECT', () => {
  const columns = scalarFieldsOf(SCHEMA, 'Bid');

  it('finds the Bid model it is meant to be guarding', () => {
    // A parse that quietly returns nothing would make every assertion below
    // vacuously true, which is the one way this test could lie.
    expect(columns).toContain('bidPricePerUnit');
    expect(columns).toContain('contactPhone');
    expect(columns.length).toBeGreaterThan(10);
  });

  it('classifies every column on Bid as either shared or withheld', () => {
    const classified = new Set([
      ...Object.keys(COUNTERPARTY_BID_SELECT),
      ...Object.keys(WITHHELD),
    ]);
    const unclassified = columns.filter((c) => !classified.has(c));

    // If this fails you have added a column to Bid. Decide whether the farmer
    // may see it: add it to COUNTERPARTY_BID_SELECT, or to WITHHELD with the
    // reason. Do not delete this assertion.
    expect(unclassified).toEqual([]);
  });

  it('never selects a column that was meant to be withheld', () => {
    for (const withheld of Object.keys(WITHHELD)) {
      expect(COUNTERPARTY_BID_SELECT).not.toHaveProperty(withheld);
    }
  });

  it('only names columns that actually exist on Bid', () => {
    const stale = Object.keys(COUNTERPARTY_BID_SELECT).filter(
      (k) => !columns.includes(k),
    );
    // A renamed column would otherwise leave a dead key here and silently drop
    // the field from every negotiation response.
    expect(stale).toEqual([]);
  });

  it('still carries what the negotiation view renders', () => {
    // NegotiationChat reads price, quantity, currency and the buyer's message;
    // NegotiationList reads the price. Redaction that breaks the page gets
    // reverted, so the useful half is a test too.
    for (const needed of ['bidPricePerUnit', 'quantity', 'currency', 'message', 'status']) {
      expect(COUNTERPARTY_BID_SELECT).toHaveProperty(needed);
    }
  });
});
