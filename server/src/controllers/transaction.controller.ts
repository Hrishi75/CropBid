// =============================================================================
// Transaction Controller — HTTP Layer for Transactions & Escrow
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import * as transactionService from '../services/transaction.service';
import { auditFromRequest } from '../services/audit.service';
import { alertNewOrder } from '../services/orderAlert.service';

const createTxSchema = z.object({
  bidId: z.string().min(1, 'bidId is required'),
});

// POST /api/transactions — Create transaction from accepted bid
export async function createTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createTxSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }

    const { bidId } = parsed.data;

    // Authorization: verify the requesting user is involved in this bid
    const bid = await prisma.bid.findUnique({
      where: { id: bidId },
      include: {
        listing: { include: { farmer: true } },
        // Whether this deal is already on the books. createTransaction returns
        // the existing row rather than erroring, so without this a retry of
        // this endpoint would re-alert ops for a deal already alerted, and
        // Bid.transaction is unique so it costs nothing to ask here.
        transaction: { select: { id: true } },
      },
    });

    if (!bid) {
      return res.status(404).json({ message: 'Bid not found' });
    }

    const userId = req.user!.userId;
    const isBuyer = bid.buyerId === userId;
    const isFarmer = bid.listing.farmer.userId === userId;

    if (!isBuyer && !isFarmer) {
      return res.status(403).json({ message: 'You are not authorized to create this transaction' });
    }

    const alreadyOnTheBooks = bid.transaction !== null;
    const transaction = await transactionService.createTransaction(bidId);

    // Post-commit, like every other path that closes a deal. createTransaction
    // is called with the top-level client here, so it is committed by this
    // line, and alertNewOrder re-reads before doing anything.
    //
    // This route had never fired it, so the ops email was already missing for
    // deals struck through it. That went unnoticed while the admin notification
    // lived inside createTransaction and covered this path by accident; moving
    // the notification onto alertNewOrder would have turned one silent gap into
    // two. One call closes both.
    //
    // Only on the request that actually creates the deal. createTransaction is
    // idempotent and hands back the existing row, so alerting unconditionally
    // would email ops and re-notify every admin each time somebody retried this
    // endpoint, or called it after another path had already closed the deal.
    if (!alreadyOnTheBooks) void alertNewOrder(bidId, 'BID_ACCEPTED');

    res.status(201).json(transaction);
  } catch (error) {
    next(error);
  }
}

// GET /api/transactions — List my transactions
export async function getMyTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const transactions = await transactionService.getMyTransactions(
      req.user!.userId,
      req.user!.role
    );
    res.json(transactions);
  } catch (error) {
    next(error);
  }
}

// GET /api/transactions/stats — Transaction summary stats
export async function getTransactionStats(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await transactionService.getTransactionStats(
      req.user!.userId,
      req.user!.role
    );
    res.json(stats);
  } catch (error) {
    next(error);
  }
}

// GET /api/transactions/:id — View a specific transaction
export async function getTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const transaction = await transactionService.getTransaction(
      req.params.id as string,
      req.user!.userId
    );
    res.json(transaction);
  } catch (error) {
    next(error);
  }
}

const deliveryStatusSchema = z.object({
  status: z.enum(['PENDING', 'IN_TRANSIT', 'DELIVERED', 'CONFIRMED'], {
    error: 'Invalid delivery status',
  }),
});

// PATCH /api/transactions/:id/delivery — Update delivery status
export async function updateDeliveryStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = deliveryStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid input' });
    }

    const txId = req.params.id as string;
    const before = await prisma.transaction.findUnique({
      where: { id: txId },
      select: { deliveryStatus: true, paymentStatus: true },
    });

    const transaction = await transactionService.updateDeliveryStatus(
      txId,
      req.user!.userId,
      parsed.data.status
    );

    await auditFromRequest(req, {
      action: 'transaction.delivery.update',
      entityType: 'Transaction',
      entityId: txId,
      metadata: {
        before: { deliveryStatus: before?.deliveryStatus ?? null, paymentStatus: before?.paymentStatus ?? null },
        after: { deliveryStatus: (transaction as any)?.deliveryStatus ?? null, paymentStatus: (transaction as any)?.paymentStatus ?? null },
        requested: parsed.data.status,
      },
    });

    res.json(transaction);
  } catch (error) {
    next(error);
  }
}

// POST /api/transactions/:id/refund — Refund a transaction (admin)
export async function refundTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const txId = req.params.id as string;
    const before = await prisma.transaction.findUnique({
      where: { id: txId },
      select: { paymentStatus: true, totalAmount: true, currency: true, buyerId: true, farmerId: true },
    });

    const transaction = await transactionService.refundTransaction(txId);

    await auditFromRequest(req, {
      action: 'transaction.refund',
      entityType: 'Transaction',
      entityId: txId,
      metadata: {
        before: { paymentStatus: before?.paymentStatus ?? null },
        after: { paymentStatus: (transaction as any)?.paymentStatus ?? null },
        amount: before?.totalAmount ?? null,
        currency: before?.currency ?? null,
        buyerId: before?.buyerId ?? null,
        farmerId: before?.farmerId ?? null,
      },
    });

    res.json(transaction);
  } catch (error) {
    next(error);
  }
}
