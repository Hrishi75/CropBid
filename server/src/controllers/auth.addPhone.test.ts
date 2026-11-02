import { describe, expect, it } from 'vitest';
import { addPhoneSchema } from './auth.controller';
import { normalizePhone } from '../services/auth.service';

// What the phone box after Google sign-in accepts. It is stored through
// normalizePhone, like sign-up, so the stored form is checked here too.
describe('addPhoneSchema', () => {
  const parse = (phone: string) => addPhoneSchema.safeParse({ phone });

  it.each([
    ['9876543210', '9876543210'],
    ['98765 43210', '9876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['+919876543210', '+919876543210'],
    ['919876543210', '919876543210'],
    ['09876543210', '09876543210'],
    ['(987) 654-3210', '9876543210'],
  ])('takes %s, stored as %s, the same as sign-up', (input, stored) => {
    const r = parse(input);
    expect(r.success && normalizePhone(r.data.phone)).toBe(stored);
  });

  it.each(['12345', '5876543210', '98765432101', '+1 415 555 0100', 'abc', '', '+91+9876543210', '98765.43210'])('refuses %s', (input) => {
    expect(parse(input).success).toBe(false);
  });
});
