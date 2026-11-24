/**
 * PHASE 7: SMART HOME AUTOMATION ENGINE - ROUTES
 */

import { Router } from 'express';
import { AutomationController } from '../controllers/automation.controller.js';
import { validateUuidParam } from '../middlewares/validation.middleware.js';

const router = Router();

// Engine status & evaluation
router.get('/status', AutomationController.getEngineStatus);
router.post('/evaluate', AutomationController.triggerEvaluation);

// Dry-run testing (draft before create)
router.post('/test', AutomationController.testDraftRule);

// Rules CRUD
router.get('/', AutomationController.getRules);
router.post('/', AutomationController.createRule);
router.get('/:id', validateUuidParam('id'), AutomationController.getRuleById);
router.put('/:id', validateUuidParam('id'), AutomationController.updateRule);
router.delete('/:id', validateUuidParam('id'), AutomationController.deleteRule);
router.patch('/:id/toggle', validateUuidParam('id'), AutomationController.toggleRule);
router.post('/:id/test', validateUuidParam('id'), AutomationController.testRule);
router.get('/:id/executions', validateUuidParam('id'), AutomationController.getRuleExecutions);

export default router;

