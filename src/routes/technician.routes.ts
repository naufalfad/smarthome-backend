/**
 * PHASE 8: TECHNICIAN WORKSPACE ROUTES
 *
 * Dedicated endpoints for authenticated technicians to inspect their active assignments.
 */

import { Router } from 'express';
import {
  getMyAssignments,
  getMyAssignmentDetail,
} from '../controllers/service-order-assignment.controller.js';
import {
  getOrCreateSurvey,
  saveSurveyDraft,
  scheduleSurveyVisit,
  uploadSurveyPhoto,
  deleteSurveyPhoto,
  submitSurvey,
} from '../controllers/field-survey.controller.js';
import { uploadSurveyPhotoFile } from '../middlewares/upload.middleware.js';
import { requireRole } from '../middlewares/auth.middleware.js';
import { validateUuidParam } from '../middlewares/validation.middleware.js';

export const technicianRouter = Router();

// Strictly restricted to TECHNICIAN role only
technicianRouter.use(requireRole('TECHNICIAN'));

technicianRouter.get('/assignments', getMyAssignments);
technicianRouter.get('/assignments/:assignmentId', validateUuidParam('assignmentId'), getMyAssignmentDetail);

// Phase 9: Field Survey execution endpoints
technicianRouter.get(
  '/assignments/:assignmentId/survey',
  validateUuidParam('assignmentId'),
  getOrCreateSurvey
);

technicianRouter.put(
  '/assignments/:assignmentId/survey',
  validateUuidParam('assignmentId'),
  saveSurveyDraft
);

technicianRouter.patch(
  '/assignments/:assignmentId/survey/schedule',
  validateUuidParam('assignmentId'),
  scheduleSurveyVisit
);

technicianRouter.post(
  '/assignments/:assignmentId/survey/photos',
  validateUuidParam('assignmentId'),
  uploadSurveyPhotoFile.single('photo'),
  uploadSurveyPhoto
);

technicianRouter.delete(
  '/assignments/:assignmentId/survey/photos/:photoId',
  validateUuidParam('assignmentId'),
  validateUuidParam('photoId'),
  deleteSurveyPhoto
);

technicianRouter.post(
  '/assignments/:assignmentId/survey/submit',
  validateUuidParam('assignmentId'),
  submitSurvey
);

export default technicianRouter;

