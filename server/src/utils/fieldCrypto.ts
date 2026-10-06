// =============================================================================
// Encrypting a column at rest
// =============================================================================
// For the few values whose theft does real harm on its own: a seller's bank
// account number, UPI id and the name on the account (services/payoutDetails).
// Masking in API responses protects them on screen; this protects them in a
// database dump or a leaked backup, which the DPDP Rules name as the kind of
// safeguard expected. The key never touches the database.
//
// AES-256-GCM, a fresh random IV per value, stored as
//   enc:v1:<base64 of iv(12) | tag(16) | ciphertext>
// The prefix is how a reader tells ciphertext from a value written before
// encryption was switched on, so both can sit in one column while the boot
// sweep catches up, and `v1` leaves room to rotate the key later.
//
// With no key configured, sealing is a no-op and the value is stored as is.
// That is deliberate: a deploy that forgot the key keeps working exactly as
// before rather than refusing to save anyone's bank details. Opening a sealed
// value with no key, though, throws: there is no honest answer to give.
// =============================================================================

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { config } from '../config';

const PREFIX = 'enc:v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function keyFrom(raw: string): Buffer | null {
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  // A key of the wrong length is a typo in the .env, and the failure it would
  // otherwise cause is "every bank account unreadable" some days later.
  if (key.length !== 32) {
    throw new Error('PAYOUT_ENCRYPTION_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32)');
  }
  return key;
}

// Read lazily rather than at import, so a test can set the key per case.
function currentKey(): Buffer | null {
  return keyFrom(config.payoutEncryptionKey);
}

export function isEncryptionConfigured(): boolean {
  return currentKey() !== null;
}

export function isSealed(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/** Encrypt for storage. Null stays null; already-sealed values are left alone. */
export function seal(value: string | null): string | null {
  if (value === null || isSealed(value)) return value;
  const key = currentKey();
  if (!key) return value;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

/** Decrypt a stored value. A value written before encryption comes back as is. */
export function open(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (!isSealed(value)) return value;
  const key = currentKey();
  if (!key) throw new Error('A payout detail is encrypted but PAYOUT_ENCRYPTION_KEY is not set');
  const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
}

/** Fail at boot, not on the first payout read, if the key is malformed. */
export function assertEncryptionKeyValid(): void {
  currentKey();
}
