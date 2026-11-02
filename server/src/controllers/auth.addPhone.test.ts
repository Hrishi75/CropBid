import { describe, expect, it } from 'vitest';
import { addPhoneSchema } from './auth.controller';

// What the phone box after Google sign-in accepts, and the form it is stored
// in: the ten digits, which is what a person types at the sign-in box.
describe('addPhoneSchema', () => {
  const parse = (phone: string) => addPhoneSchema.safeParse({ phone });

  it.each([
    ['9876543210', '9876543210'],
    ['98765 43210', '9876543210'],
    ['+91 98765 43210', '9876543210'],
    ['+919876543210', '9876543210'],
    ['919876543210', '9876543210'],
    ['09876543210', '9876543210'],
    ['(987) 654-3210', '9876543210'],
  ])('takes %s as %s', (input, stored) => {
    const r = parse(input);
    expect(r.success && r.data.phone).toBe(stored);
  });

  it.each(['12345', '5876543210', '98765432101', '+1 415 555 0100', 'abc', ''])('refuses %s', (input) => {
    expect(parse(input).success).toBe(false);
  });
});
