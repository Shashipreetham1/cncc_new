import { PrismaClient } from '@prisma/client';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Import routes
import userRoutes from './src/routes/userRoutes.js';
import invoiceRoutes from './src/routes/invoiceRoutes.js';
import purchaseOrderRoutes from './src/routes/purchaseOrderRoutes.js';
import stockRegisterRoutes from './src/routes/stockRegisterRoutes.js';
import editRequestRoutes from './src/routes/editRequestRoutes.js';
import searchRoutes from './src/routes/searchRoutes.js';

// Import seed function
import createAdminUser from './src/seeds/createAdminUser.js';

// Load environment variables
dotenv.config();

// Initialize Prisma Client
const prisma = new PrismaClient();
const app = express();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test database connection on startup
prisma.$connect()
  .then(() => {
    console.log('Connected to database successfully');
    // Create admin user if needed
    return createAdminUser();
  })
  .catch(e => {
    console.error('Failed to connect to database:', e);
    process.exit(1); // Exit if database connection fails
  });

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/stock-register', stockRegisterRoutes);
app.use('/api/edit-requests', editRequestRoutes);
app.use('/api/search', searchRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to CNCC Backend API' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Internal Server Error', 
    error: process.env.NODE_ENV === 'development' ? err.message : "server error"
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export default app;