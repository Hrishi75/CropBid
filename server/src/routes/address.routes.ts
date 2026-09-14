// =============================================================================
// Address Routes — the shopper's saved delivery addresses
// =============================================================================
// Authenticated throughout. An address book belongs to an account and there is
// no public view of one.
// =============================================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as addressController from '../controllers/address.controller';

const router = Router();

router.use(authenticate);

router.get('/', addressController.list);
router.post('/', addressController.create);
router.put('/:id', addressController.update);
router.patch('/:id/default', addressController.setDefault);
router.delete('/:id', addressController.remove);

export default router;
