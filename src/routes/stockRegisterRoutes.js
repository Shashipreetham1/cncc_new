import express from 'express';
import {
  createStockRegister,
  getAllStockRegisters,
  getStockRegisterById,
  updateStockRegister,
  deleteStockRegister,
  requestEditPermission
} from '../controller/stockRegisterController.js';
import { auth } from '../middleware/auth.js';
import upload from '../middleware/fileUpload.js';

const router = express.Router();

// Stock Register routes
router.post('/', auth, upload.single('photo'), createStockRegister);
router.get('/', auth, getAllStockRegisters);
router.get('/:id', auth, getStockRegisterById);

// Add document type parameter for permission checking
router.put('/:id', auth, upload.single('photo'), (req, res, next) => {
  req.params.documentType = 'stockRegister';
  next();
}, updateStockRegister);

router.delete('/:id', auth, (req, res, next) => {
  req.params.documentType = 'stockRegister';
  next();
}, deleteStockRegister);

router.post('/:id/request-edit', auth, requestEditPermission);

export default router;