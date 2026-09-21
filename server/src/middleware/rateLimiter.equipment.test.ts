// =============================================================================
// /equipment enquiries are rationed, and on their own allowance
// =============================================================================
// Every enquiry returns a dealer's phone number, and /equipment had no limit
// at all: one signed-in account could enquire on every machine in turn and
// leave with the whole dealer list (CLAUDE.md section 10). What has to hold:
//
//   1. The route actually mounts a limiter, after authenticate. The bug being
//      fixed was a route with none, so a test of the limiter on its own would
//      pass on the broken code.
//   2. Twenty a day, then refused.
//   3. Its allowance is separate from /inputs. Sharing one store would make it
//      a single budget across both catalogues, so a farmer who priced twenty
//      seed packets could not then ask about hiring a tractor.
// =============================================================================

import express, { type RequestHandler } from 'express';
import type { AddressInfo } from 'net';
import { describe, it, expect, afterEach } from 'vitest';

import { enquiryLimiter, equipmentEnquiryLimiter } from './rateLimiter';
import { authenticate } from './auth';
import equipmentRoutes from '../routes/equipment.routes';

// A server with nothing on it but the limiter under test, signed in as `userId`
// the way authenticate would leave the request. Real HTTP, so the limiter runs
// exactly as it does in the app rather than against a hand-built response.
async function serve(limiter: RequestHandler, userId: string) {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).user = { userId, role: 'FARMER' };
    next();
  });
  app.post('/enquiry', limiter, (_req, res) => {
    res.status(201).json({ ok: true });
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    post: () => fetch(`http://127.0.0.1:${port}/enquiry`, { method: 'POST' }).then((r) => r.status),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const open: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => s.close()));
});

describe('the equipment enquiry route', () => {
  // Reads the route's own middleware chain. If somebody drops the limiter from
  // the route, this is the test that notices.
  it('is rationed, and the limiter runs after the account is known', () => {
    const layer = (equipmentRoutes as any).stack.find(
      (l: any) => l.route?.path === '/:id/enquiry' && l.route?.methods?.post,
    );
    expect(layer).toBeDefined();

    const chain = layer.route.stack.map((s: any) => s.handle);
    const auth = chain.indexOf(authenticate);
    const limit = chain.indexOf(equipmentEnquiryLimiter);

    expect(auth).toBeGreaterThanOrEqual(0);
    expect(limit).toBeGreaterThan(auth);
  });
});

describe('the equipment enquiry allowance', () => {
  it('lets twenty through in a day and refuses the next', async () => {
    const s = await serve(equipmentEnquiryLimiter, 'eq-limit-a');
    open.push(s);

    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) statuses.push(await s.post());

    expect(statuses.slice(0, 20).every((code) => code === 201)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it('is kept separately from the seed and fertiliser allowance', async () => {
    const inputs = await serve(enquiryLimiter, 'eq-limit-b');
    const machines = await serve(equipmentEnquiryLimiter, 'eq-limit-b');
    open.push(inputs, machines);

    // Spend the whole /inputs allowance...
    for (let i = 0; i < 20; i += 1) await inputs.post();
    expect(await inputs.post()).toBe(429);

    // ...and the same account can still ask about a tractor.
    expect(await machines.post()).toBe(201);
  });
});
