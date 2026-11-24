import { Router } from 'express';
import {
  getHouses,
  getHouseById,
  createHouse,
  addFloor,
  deleteFloor,
  getInternalSurveys,
  streamSurveyPhoto,
  getHouseQuota,
  placeHouseDevice,
  markHouseReadyForHandover,
} from '../controllers/house.controller.js';
import { validateUuidParam } from '../middlewares/validation.middleware.js';

const router = Router();

router.get('/', getHouses);
router.post('/', createHouse);
router.get('/:id', validateUuidParam('id'), getHouseById);
router.get('/:id/quota', validateUuidParam('id'), getHouseQuota);
router.post('/:id/devices', validateUuidParam('id'), placeHouseDevice);
router.post('/:id/ready-for-handover', validateUuidParam('id'), markHouseReadyForHandover);
router.patch('/:id/ready-for-handover', validateUuidParam('id'), markHouseReadyForHandover);
router.get('/:id/surveys', validateUuidParam('id'), getInternalSurveys);
router.get('/:id/surveys/photos/:filename', validateUuidParam('id'), streamSurveyPhoto);
router.post('/:id/floors', validateUuidParam('id'), addFloor);
router.delete('/:id/floors/:floorId', validateUuidParam('id', 'floorId'), deleteFloor);

export default router;
