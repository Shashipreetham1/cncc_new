// src/routes/invoiceRoutes.js
import express from 'express';
import { createInvoice, getAllInvoices, getInvoiceById, updateInvoice, deleteInvoice, requestEditPermission } from '../controller/invoiceController.js';
import { auth, canEdit, adminOnly } from '../middleware/auth.js';
import upload, { handleUploadError } from '../middleware/fileUpload.js';

const router = express.Router();

// Middleware to inject document type for canEdit
const setDocumentType = (docType) => (req, res, next) => {
    req.params.documentType = docType; // Set on req.params for canEdit middleware
    next();
};

// POST /api/invoices (Create)
router.post('/', auth, upload.single('invoiceFile'), handleUploadError, createInvoice);

// GET /api/invoices (List - controller filters user/admin)
router.get('/', auth, getAllInvoices);

// GET /api/invoices/:id (Read - controller checks authz)
router.get('/:id', auth, getInvoiceById);

// PUT /api/invoices/:id (Update)
router.put('/:id',
    auth,                       // 1. Authenticate
    setDocumentType('invoice'), // 2. Set type for canEdit
    canEdit,                    // 3. Check Permission **before** upload/controller
    upload.single('invoiceFile'), // 4. Handle File Upload (only if permitted)
    handleUploadError,         // 5. Handle Upload Errors
    updateInvoice              // 6. Proceed to Controller
);

// DELETE /api/invoices/:id (Delete - controller checks authz)
router.delete('/:id', auth, deleteInvoice);

// POST /api/invoices/:id/request-edit (Request Edit Permission)
router.post('/:id/request-edit', auth, requestEditPermission);

export default router;