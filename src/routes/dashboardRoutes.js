// src/routes/dashboardRoutes.js
import express from 'express';
import { getDashboardSummary } from '../controller/dashboardController.js';
import { auth } from '../middleware/auth.js'; // Endpoint requires authentication

const router = express.Router();

// Define the route for fetching dashboard summary data
// GET /api/dashboard/summary
router.get('/summary', auth, getDashboardSummary); // Use auth middleware

export default router;