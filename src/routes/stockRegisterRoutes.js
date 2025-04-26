// src/routes/stockRegisterRoutes.js
import express from 'express';
import { createStockRegister, getAllStockRegisters, getStockRegisterById, updateStockRegister, deleteStockRegister, requestEditPermission } from '../controller/stockRegisterController.js';
import { auth, canEdit, adminOnly } from '../middleware/auth.js';
import upload, { handleUploadError } from '../middleware/fileUpload.js';

const router = express.Router();

const setDocumentType = (docType) => (req, res, next) => {
    req.params.documentType = docType;
    next();
};

// POST /api/stock-register (Create)
router.post('/', auth, upload.single('photo'), handleUploadError, createStockRegister);

// GET /api/stock-register (List)
router.get('/', auth, getAllStockRegisters);

// GET /api/stock-register/:id (Read)
router.get('/:id', auth, getStockRegisterById);

// PUT /api/stock-register/:id (Update)
router.put('/:id',
    auth,
    setDocumentType('stockRegister'), // Use correct type name
    canEdit,
    upload.single('photo'),
    handleUploadError,
    updateStockRegister
);

// DELETE /api/stock-register/:id (Delete)
router.delete('/:id', auth, deleteStockRegister);

// POST /api/stock-register/:id/request-edit (Request Edit)
router.post('/:id/request-edit', auth, requestEditPermission);

export default router;