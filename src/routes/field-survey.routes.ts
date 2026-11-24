/**
 * PHASE 9: FIELD SURVEY PUBLIC/AUTHENTICATED SECURE STREAMING ROUTES
 *
 * Provides authenticated and access-checked internal survey photo streaming.
 */

import { Router } from 'express';
import { streamSurveyPhoto } from '../controllers/field-survey.controller.js';
import { validateUuidParam } from '../middlewares/validation.middleware.js';

export const fieldSurveyRouter = Router();

// Stream survey photo with photoId directly: /api/surveys/photos/:photoId
fieldSurveyRouter.get('/photos/:photoId', validateUuidParam('photoId'), streamSurveyPhoto);

// Stream survey photo nested: /api/surveys/:surveyId/photos/:photoId
fieldSurveyRouter.get('/:surveyId/photos/:photoId', validateUuidParam('photoId'), streamSurveyPhoto);

export default fieldSurveyRouter;
