// =============================================================================
// email.service tests — dev console fallback (no SMTP configured)
// =============================================================================
// The SMTP path needs a live server, so these tests pin down the contract that
// matters everywhere else: with SMTP unconfigured, emails are printed to the
// console (never silently dropped), and the reset email carries the reset URL.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Force the unconfigured-SMTP branch regardless of the host machine's env.
const { mockConfig } = vi.hoisted(() => ({
  mockConfig: {
    nodeEnv: 'development',
    smtp: { host: '', port: 587, user: '', pass: '', from: 'CropBid <no-reply@cropbid.in>' },
  },
}));
vi.mock('../config', () => ({ config: mockConfig }));

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

// On production the console is a log file that outlives the request and is
// read by whoever runs the server. A reset link printed there is a working
// key to that account, so a production server with no SMTP fails the send
// instead, and the body must not reach any log on the way.
describe('sendEmail on production with no SMTP', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockConfig.nodeEnv = 'production';
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    mockConfig.nodeEnv = 'development';
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('throws rather than printing, and no log line carries the link', async () => {
    const resetUrl = 'https://cropbid.in/reset-password?token=secret-token-value';
    await expect(sendPasswordResetEmail('user@example.com', 'Rajesh', resetUrl)).rejects.toThrow();

    const everything = [...logSpy.mock.calls, ...errorSpy.mock.calls].map((c) => c.join(' ')).join('\n');
    expect(everything).not.toContain('secret-token-value');
    expect(everything).not.toContain('user@example.com');
  });
});
