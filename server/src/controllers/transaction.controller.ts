// =============================================================================
// Transaction Controller — HTTP Layer for Transactions & Escrow
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import * as transactionService from '../services/transaction.service';

// POST /api/transactions — Create transaction from accepted bid
export async function createTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const { bidId } = req.body;
    if (!bidId) {
      return res.status(400).json({ message: 'bidId is required' });
    }

    const transaction = await transactionService.createTransaction(bidId);
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

// PATCH /api/transactions/:id/delivery — Update delivery status
export async function updateDeliveryStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ message: 'status is required' });
    }

    const transaction = await transactionService.updateDeliveryStatus(
      req.params.id as string,
      req.user!.userId,
      status
    );
    res.json(transaction);
  } catch (error) {
    next(error);
  }
}

// POST /api/transactions/:id/refund — Refund a transaction (admin)
export async function refundTransaction(req: Request, res: Response, next: NextFunction) {
  try {
    const transaction = await transactionService.refundTransaction(
      req.params.id as string
    );
    res.json(transaction);
  } catch (error) {
    next(error);
  }
}
