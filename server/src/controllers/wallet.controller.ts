// =============================================================================
// Wallet Controller — HTTP layer for prepaid credits
// =============================================================================
// Every route here is the caller's OWN wallet. There is no userId in any path
// or body: it comes from the session, so there is no request shape that can
// read or move somebody else's credits.
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as walletService from '../services/wallet.service';

// GET /api/wallet — balance and currency, creating the wallet on first read
export async function getWallet(req: Request, res: Response, next: NextFunction) {
  try {
    const wallet = await walletService.getWallet(req.user!.userId);
    res.json({
      balance: wallet.balance,
      currency: wallet.currency,
      // The app disables the "pay with credits" affordance off this rather than
      // hardcoding it, so the day checkout learns to spend credits the flag
      // flips in one place. See wallet.service `spend`.
      canSpend: false,
      limits: { min: walletService.MIN_TOPUP, max: walletService.MAX_TOPUP },
    });
  } catch (error) {
    next(error);
  }
}

// POST /api/wallet/topup/order — start a top-up
const topupSchema = z.object({
  // Coerced because a phone sends the amount from a text field. Positive and
  // finite here; the service owns the real floor and ceiling so the rule lives
  // in one place rather than being restated in a schema that can drift.
  amount: z.coerce.number().positive('Enter an amount'),
});

export async function createTopupOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = topupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const order = await walletService.createTopupOrder(req.user!.userId, parsed.data.amount);
    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
}

// POST /api/wallet/topup/verify — confirm the Checkout handshake, credit the wallet
//
// Note what is NOT in this schema: an amount. The credited value is read from
// Razorpay in the service, because a client that could state what it had paid
// could mint credits for free.
const verifySchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export async function verifyTopup(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }
    const { wallet, entry } = await walletService.verifyTopup(
      req.user!.userId,
      parsed.data.razorpayOrderId,
      parsed.data.razorpayPaymentId,
      parsed.data.razorpaySignature,
    );
    res.json({ balance: wallet.balance, currency: wallet.currency, entry });
  } catch (error) {
    next(error);
  }
}

// GET /api/wallet/entries — the statement, newest first
export async function listEntries(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = Number(req.query.limit);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    res.json(await walletService.listEntries(
      req.user!.userId,
      Number.isFinite(limit) ? limit : 25,
      cursor,
    ));
  } catch (error) {
    next(error);
  }
}
