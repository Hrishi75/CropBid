// =============================================================================
// refreshHandler: who gets a long session, and who ever sees the token
// =============================================================================
// A token sent explicitly marks the phone app. A cookie-only refresh is the
// website, and must never get its token back in JSON, whatever X-Client says.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../services/auth.service', () => ({ refresh: vi.fn() }));

import * as authService from '../services/auth.service';
import { refreshHandler } from './auth.controller';

const mockRefresh = vi.mocked(authService.refresh);

function call(req: { cookies?: object; body?: object; headers?: object }) {
  const res = { cookie: vi.fn(), json: vi.fn(), status: vi.fn().mockReturnThis() };
  const run = refreshHandler(
    { cookies: {}, body: {}, headers: {}, ...req } as unknown as Request,
    res as unknown as Response,
  );
  return { res, run };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRefresh.mockResolvedValue({ user: { id: 'u' }, accessToken: 'access', refreshToken: 'rotated' } as never);
});

describe('refreshHandler', () => {
  it('uses an explicit token over a stale cookie', async () => {
    const { res, run } = call({ cookies: { refreshToken: 'stale' }, body: { refreshToken: 'stored' } });
    await run;

    expect(mockRefresh).toHaveBeenCalledWith('stored', { appSession: true });
    expect(res.json.mock.calls[0][0].refreshToken).toBe('rotated');
  });

  it('sets no cookie on an app refresh', async () => {
    const { res, run } = call({ body: { refreshToken: 'stored' } });
    await run;

    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('accepts the token from the X-Refresh-Token header as an app refresh', async () => {
    const { run } = call({ headers: { 'x-refresh-token': 'stored' } });
    await run;

    expect(mockRefresh).toHaveBeenCalledWith('stored', { appSession: true });
  });

  it('keeps a cookie refresh on the website session', async () => {
    const { res, run } = call({ cookies: { refreshToken: 'web' } });
    await run;

    expect(mockRefresh).toHaveBeenCalledWith('web', { appSession: false });
    expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'rotated', expect.anything());
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('refreshToken');
  });

  it('never returns a cookie-held token because X-Client says mobile', async () => {
    const { res, run } = call({ cookies: { refreshToken: 'web' }, headers: { 'x-client': 'mobile' } });
    await run;

    expect(mockRefresh).toHaveBeenCalledWith('web', { appSession: false });
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('refreshToken');
  });

  it('refuses a request with no token at all', async () => {
    const { res, run } = call({});
    await run;

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
