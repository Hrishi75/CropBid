// =============================================================================
// Wallet Routes — prepaid credits
// =============================================================================
// Authenticated throughout: a wallet belongs to an account, and there is no
// public view of one. Every handler reads the owner from the session.
// =============================================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as walletController from '../controllers/wallet.controller';

const router = Router();

router.use(authenticate);

router.get('/', walletController.getWallet);
router.get('/entries', walletController.listEntries);
router.post('/topup/order', walletController.createTopupOrder);
router.post('/topup/verify', walletController.verifyTopup);

export default router;
