// =============================================================================
// email.service tests — dev console fallback (no SMTP configured)
// =============================================================================
// The SMTP path needs a live server, so these tests pin down the contract that
// matters everywhere else: with SMTP unconfigured, emails are printed to the
// console (never silently dropped), and the reset email carries the reset URL.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Force the unconfigured-SMTP branch regardless of the host machine's env.
vi.mock('../config', () => ({
  config: {
    smtp: { host: '', port: 587, user: '', pass: '', from: 'CropBid <no-reply@cropbid.in>' },
  },
}));

import { sendEmail, sendPasswordResetEmail } from './email.service';

describe('sendEmail (SMTP not configured)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('prints the email to the console instead of throwing', async () => {
    await expect(
      sendEmail({ to: 'farmer@example.com', subject: 'Hello', text: 'Body text' }),
    ).resolves.toBeUndefined();

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('farmer@example.com');
    expect(output).toContain('Hello');
    expect(output).toContain('Body text');
  });

  it('password reset email contains the reset link and recipient', async () => {
    const resetUrl = 'http://localhost:5173/reset-password?token=abc123';
    await sendPasswordResetEmail('user@example.com', 'Rajesh', resetUrl);

    const output = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('user@example.com');
    expect(output).toContain(resetUrl);
    expect(output).toContain('Rajesh');
  });
});
