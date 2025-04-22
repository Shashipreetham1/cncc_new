import express from 'express';
import { 
  searchDocuments, 
  advancedInvoiceSearch, 
  advancedPurchaseOrderSearch, 
  advancedStockRegisterSearch,
  validateUniqueId,
  exportSearchResults
} from '../controller/searchController.js';
import {
  saveSearch,
  getUserSavedSearches,
  getSavedSearchById,
  updateSavedSearch,
  deleteSavedSearch
} from '../controller/savedSearchController.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// General search route
router.get('/', auth, searchDocuments);

// Advanced search routes
router.get('/advanced/invoices', auth, advancedInvoiceSearch);
router.get('/advanced/purchase-orders', auth, advancedPurchaseOrderSearch);
router.get('/advanced/stock-register', auth, advancedStockRegisterSearch);

// Export route for search results
router.get('/export', auth, exportSearchResults);

// ID validation route to prevent duplicate primary keys
router.post('/validate-id', auth, validateUniqueId);

// Saved searches routes
router.post('/saved', auth, saveSearch);
router.get('/saved', auth, getUserSavedSearches);
router.get('/saved/:id', auth, getSavedSearchById);
router.put('/saved/:id', auth, updateSavedSearch);
router.delete('/saved/:id', auth, deleteSavedSearch);

export default router;