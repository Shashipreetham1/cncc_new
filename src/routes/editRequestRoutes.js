import express from 'express';
import {
  getAllEditRequests,
  getEditRequestById,
  approveEditRequest,
  rejectEditRequest
} from '../controller/editRequestController.js';
import { auth, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// Edit Request routes (admin only)
router.get('/', auth, adminOnly, getAllEditRequests);
router.get('/:id', auth, adminOnly, getEditRequestById);
router.put('/:id/approve', auth, adminOnly, approveEditRequest);
router.put('/:id/reject', auth, adminOnly, rejectEditRequest);

export default router;