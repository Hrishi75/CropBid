// =============================================================================
// enquiryLimiter key tests
// =============================================================================
// An enquiry returns a shop's phone number, so the limiter is rationing what
// one ACCOUNT may collect. That only holds if the key is the account: an
// (ip + account) key hands a fresh allowance to anyone who switches from wifi
// to mobile data, and an IP-only key lets one farmer on a CGNAT address use up
// a whole town's allowance.
// =============================================================================

import type { Request } from 'express';
import { describe, it, expect } from 'vitest';

import { enquiryKey } from './rateLimiter';

function req(ip: string, userId?: string): Request {
  return { ip, user: userId ? { userId } : undefined } as unknown as Request;
}

describe('enquiryKey', () => {
  it('keys on the account, whatever network the request arrives from', () => {
    expect(enquiryKey(req('203.0.113.7', 'user-1'))).toBe(enquiryKey(req('198.51.100.20', 'user-1')));
  });

  it('gives two accounts behind one address separate allowances', () => {
    expect(enquiryKey(req('203.0.113.7', 'user-1'))).not.toBe(enquiryKey(req('203.0.113.7', 'user-2')));
  });

  it('falls back to the address when no account is attached', () => {
    expect(enquiryKey(req('203.0.113.7'))).toBe('ip:203.0.113.7');
  });

  // Without the prefixes an account whose id happened to read like an address
  // would share a bucket with every anonymous request from that address.
  it('never lets an account key collide with an address key', () => {
    expect(enquiryKey(req('198.51.100.20', '203.0.113.7'))).not.toBe(enquiryKey(req('203.0.113.7')));
  });
});
