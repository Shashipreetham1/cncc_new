import express from 'express';
import {
  createInvoice,
  getAllInvoices,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  requestEditPermission
} from '../controller/invoiceController.js';
import { auth, canEdit } from '../middleware/auth.js';
import upload from '../middleware/fileUpload.js';

const router = express.Router();

// Invoice routes
router.post('/', auth, upload.single('invoiceFile'), createInvoice);
router.get('/', auth, getAllInvoices);
router.get('/:id', auth, getInvoiceById);

// Add document type parameter for the canEdit middleware
// For update and delete operations, we need to make sure the user has permission
router.put('/:id', auth, upload.single('invoiceFile'), (req, res, next) => {
  req.params.documentType = 'invoice';
  next();
}, updateInvoice);

router.delete('/:id', auth, (req, res, next) => {
  req.params.documentType = 'invoice';
  next();
}, deleteInvoice);

router.post('/:id/request-edit', auth, requestEditPermission);

export default router;