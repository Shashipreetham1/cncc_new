import express from 'express';
import {
  // Note: createEditRequest is handled by document-specific routes (e.g., /api/invoices/:id/request-edit)
  getAllEditRequests,
  getEditRequestById,
  approveEditRequest,
  rejectEditRequest
} from '../controller/editRequestController.js';
import { auth, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// --- Edit Request Management Routes (Admin Only) ---

// GET all edit requests (filtered by status in query, e.g., /?status=PENDING)
router.get('/', auth, adminOnly, getAllEditRequests);

// GET a specific edit request by ID
router.get('/:id', auth, adminOnly, getEditRequestById);

// PUT route to approve a specific edit request
router.put('/:id/approve', auth, adminOnly, approveEditRequest);

// PUT route to reject a specific edit request
router.put('/:id/reject', auth, adminOnly, rejectEditRequest);

export default router;