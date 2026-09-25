// =============================================================================
// Temporary passwords, made to be read down a phone line
// =============================================================================
// An admin resets the password for somebody who called in locked out, then
// reads the result back to them. So the alphabet leaves out every pair that
// sounds or looks the same when spoken or typed: no O or 0, no I, l or 1, no
// 5/S, no 8/B, no 2/Z. What is left still gives plenty of room, and it is the
// difference between one call and three.
//
// Grouped in fours with dashes for the same reason: "kfph-4wmx-h9qt" survives
// being read aloud in a way that a run of twelve characters does not. The
// dashes are part of the password, so the user types what they were told.
//
// Randomness comes from crypto, never Math.random, and the unbiased way: a
// modulo over 256 would make the first few letters of the alphabet likelier,
// which is a real weakening of a credential that guards an account.
// =============================================================================

import { randomInt } from 'crypto';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz34679';
const GROUPS = 3;
const GROUP_SIZE = 4;

export function generateTempPassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    let group = '';
    for (let i = 0; i < GROUP_SIZE; i++) {
      group += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}
