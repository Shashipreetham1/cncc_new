import express from 'express';
import {
  createPurchaseOrder,
  getAllPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrder,
  deletePurchaseOrder,
  requestEditPermission
} from '../controller/purchaseOrderController.js';
import { auth } from '../middleware/auth.js';
import upload from '../middleware/fileUpload.js';

const router = express.Router();

// Purchase Order routes
router.post('/', auth, upload.single('purchaseOrderFile'), createPurchaseOrder);
router.get('/', auth, getAllPurchaseOrders);
router.get('/:id', auth, getPurchaseOrderById);

// Add document type parameter for permission checking
router.put('/:id', auth, upload.single('purchaseOrderFile'), (req, res, next) => {
  req.params.documentType = 'purchaseOrder';
  next();
}, updatePurchaseOrder);

router.delete('/:id', auth, (req, res, next) => {
  req.params.documentType = 'purchaseOrder';
  next();
}, deletePurchaseOrder);

router.post('/:id/request-edit', auth, requestEditPermission);

export default router;