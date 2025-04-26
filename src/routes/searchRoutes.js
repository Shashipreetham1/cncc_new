// src/routes/searchRoutes.js
import express from 'express';
// Import search-specific functions
import { searchDocuments, advancedInvoiceSearch, advancedPurchaseOrderSearch, advancedStockRegisterSearch, validateUniqueId, exportSearchResults } from '../controller/searchController.js';
// Import saved-search specific functions
import { saveSearch, getUserSavedSearches, getSavedSearchById, updateSavedSearch, deleteSavedSearch } from '../controller/savedSearchController.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// --- General Search, Export, Validation ---
router.get('/', auth, searchDocuments);                // GET /api/search?query=...&type=...
router.get('/export', auth, exportSearchResults);      // GET /api/search/export?type=...&format=...
router.post('/validate-id', auth, validateUniqueId);   // POST /api/search/validate-id

// --- Advanced Search Routes ---
router.get('/advanced/invoices', auth, advancedInvoiceSearch);         // GET /api/search/advanced/invoices?...
router.get('/advanced/purchase-orders', auth, advancedPurchaseOrderSearch); // GET /api/search/advanced/purchase-orders?...
router.get('/advanced/stock-register', auth, advancedStockRegisterSearch); // GET /api/search/advanced/stock-register?...

// --- Saved Searches Routes ---
router.post('/saved', auth, saveSearch);                // POST /api/search/saved
router.get('/saved', auth, getUserSavedSearches);       // GET /api/search/saved
router.get('/saved/:id', auth, getSavedSearchById);     // GET /api/search/saved/:id
router.put('/saved/:id', auth, updateSavedSearch);      // PUT /api/search/saved/:id
router.delete('/saved/:id', auth, deleteSavedSearch);   // DELETE /api/search/saved/:id

export default router;