// src/routes/purchaseOrderRoutes.js
import express from 'express';
import { createPurchaseOrder, getAllPurchaseOrders, getPurchaseOrderById, updatePurchaseOrder, deletePurchaseOrder, requestEditPermission } from '../controller/purchaseOrderController.js';
import { auth, canEdit, adminOnly } from '../middleware/auth.js';
import upload, { handleUploadError } from '../middleware/fileUpload.js';

const router = express.Router();

const setDocumentType = (docType) => (req, res, next) => {
    req.params.documentType = docType;
    next();
};

// POST /api/purchase-orders (Create)
router.post('/', auth, upload.single('purchaseOrderFile'), handleUploadError, createPurchaseOrder);

// GET /api/purchase-orders (List)
router.get('/', auth, getAllPurchaseOrders);

// GET /api/purchase-orders/:id (Read)
router.get('/:id', auth, getPurchaseOrderById);

// PUT /api/purchase-orders/:id (Update)
router.put('/:id',
    auth,
    setDocumentType('purchaseOrder'), // Use correct type name
    canEdit,
    upload.single('purchaseOrderFile'),
    handleUploadError,
    updatePurchaseOrder
);

// DELETE /api/purchase-orders/:id (Delete)
router.delete('/:id', auth, deletePurchaseOrder);

// POST /api/purchase-orders/:id/request-edit (Request Edit)
router.post('/:id/request-edit', auth, requestEditPermission);

export default router;