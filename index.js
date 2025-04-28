// index.js

// --- Module Imports ---
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';

// --- Environment Loading & Validation ---
dotenv.config();
const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET', 'FRONTEND_URL', 'PORT'];
requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        console.error(`❌ FATAL ERROR: Environment variable ${varName} is not set.`);
        process.exit(1);
    }
});
const jwtSecret = process.env.JWT_SECRET;
// Enhanced security check for JWT secret
if (!jwtSecret || jwtSecret === 'REPLACE_THIS_WITH_YOUR_ACTUAL_STRONG_JWT_SECRET_KEY' || jwtSecret === 'your-secure-jwt-secret-key' || jwtSecret.length < 32) {
    console.error("❌ FATAL ERROR: JWT_SECRET is not defined, uses a placeholder, or is insecurely short. Please set a strong unique secret in the .env file.");
    process.exit(1);
}

// --- Import Application Components ---
import userRoutes from './src/routes/userRoutes.js';
import invoiceRoutes from './src/routes/invoiceRoutes.js';
import purchaseOrderRoutes from './src/routes/purchaseOrderRoutes.js';
import stockRegisterRoutes from './src/routes/stockRegisterRoutes.js';
import editRequestRoutes from './src/routes/editRequestRoutes.js';
import searchRoutes from './src/routes/searchRoutes.js';
import dashboardRoutes from './src/routes/dashboardRoutes.js'; // <<<--- ADD THIS IMPORT
import createAdminUser from './src/seeds/createAdminUser.js';

// --- Initialization ---
const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'], // Configure Prisma logging
});
const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL, // Read from checked env var
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"], // Standard methods
    credentials: true
  }
});

// --- Socket.IO Setup ---
global.io = io; // Make io globally accessible (consider dependency injection for larger apps)
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);
  let userIdForSocket = null;

  socket.on('identify-user', (authUserId) => {
      if (authUserId && typeof authUserId === 'string') {
          userIdForSocket = authUserId;
          connectedUsers.set(userIdForSocket, socket.id);
          socket.join(`user-${userIdForSocket}`);
          console.log(`   👤 User ${userIdForSocket} identified for socket ${socket.id}, joined room user-${userIdForSocket}`);
      } else {
          console.warn(`Socket ${socket.id} sent invalid userId for identification:`, authUserId);
      }
  });

  socket.on('join-admin-room', () => {
    // TODO: Add backend verification here based on socket auth or session if needed
    // For now, assuming client is trusted (only admins should emit this)
    socket.join('admin-room');
    console.log(`   👑 Socket ID ${socket.id} joined admin-room`);
    socket.emit('joined-admin-room-ack', { success: true });
  });

  // Separate logic for leaving rooms can be added if needed

  socket.on('error', (error) => console.error(`❌ Socket error (${socket.id}):`, error));

  socket.on('disconnect', (reason) => {
    console.log(`🔌 Socket disconnected: ${socket.id}, Reason: ${reason}`);
    if (userIdForSocket) {
      if (connectedUsers.get(userIdForSocket) === socket.id) { // Only delete if it's the current socket for that user
          connectedUsers.delete(userIdForSocket);
          console.log(`   👤 User ${userIdForSocket} mapping removed.`);
      }
    }
     userIdForSocket = null; // Clear associated userId
  });
});


// --- __dirname Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Database Connection & Seeding ---
const connectDbAndSeed = async () => {
    try {
        // Attempt to connect
        await prisma.$connect();
        console.log('✅ Connected to database successfully');
        // Run seeder (creates default admin if none exists)
        await createAdminUser();
    } catch (error) {
        console.error('❌ DB connection or seeding failed:', error);
        // Ensure disconnect is attempted even on failure
        await prisma.$disconnect().catch(e => console.error("Error disconnecting Prisma after connection failure:", e));
        process.exit(1); // Exit if critical setup fails
    }
};
// Initiate DB connection and seeding on startup
connectDbAndSeed();

// --- Core Express Middleware ---
app.use(cors({ // Configure CORS strictly based on .env
  origin: process.env.FRONTEND_URL,
  credentials: true // Allow cookies if needed later
}));
app.use(express.json({ limit: process.env.MAX_FILE_SIZE || '10mb' })); // Use size limit from .env or default
app.use(express.urlencoded({ extended: true, limit: process.env.MAX_FILE_SIZE || '10mb' }));

// Static File Server setup
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) { // Ensure directory exists
    try {
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log(`📁 Created uploads directory at: ${uploadsDir}`);
    } catch (mkdirError) {
         console.error(`❌ Failed to create uploads directory: ${mkdirError}`);
         // Consider if this is fatal or can continue without file serving
    }
}
// Only serve if directory exists
if (fs.existsSync(uploadsDir)) {
    app.use('/uploads', express.static(uploadsDir));
    console.log(`   Serving static files from: ${uploadsDir}`);
}

// Simple Request Logger
app.use((req, res, next) => {
  console.log(`➡️ ${req.method} ${req.originalUrl}`);
  next();
});

// --- API Routes Mounting ---
app.use('/api/users', userRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/stock-register', stockRegisterRoutes);
app.use('/api/edit-requests', editRequestRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/dashboard', dashboardRoutes); // <<<--- MOUNT DASHBOARD ROUTES HERE

// --- Root Health Check ---
app.get('/', (req, res) => res.status(200).json({ status: 'UP', message: 'CNCC Backend API Operational', timestamp: new Date().toISOString() }));

// --- 404 Not Found Handler ---
app.use((req, res, next) => {
  res.status(404).json({ message: `Not Found: Cannot ${req.method} ${req.originalUrl}` });
});

// --- Global Error Handling Middleware ---
app.use((err, req, res, next) => {
  console.error("--- 💥 Unhandled Error Captured 💥 ---");
  console.error("Route:", req.method, req.originalUrl);
  const errForLogging = (err instanceof Error) ? err.stack : JSON.stringify(err);
  console.error("Error Details:", process.env.NODE_ENV === 'development' ? errForLogging : err.message);
  console.error("--- End Error ---");

  let statusCode = err?.status || err?.statusCode || 500; // Prioritize specific error status codes
  let message = err instanceof Error ? err.message : 'An unknown error occurred';

  // Check for specific Prisma error codes for better client messages
  if (err.code === 'P2002') { statusCode = 409; message = 'Conflict: A record with this unique identifier already exists.'; } // Unique constraint
  if (err.code === 'P2025') { statusCode = 404; message = 'Error: The requested record could not be found.'; } // Record not found (e.g., for update/delete)

  // Standard error handling for JWT and JSON errors
  if (err instanceof SyntaxError && message.includes('JSON')) { statusCode = 400; message = 'Bad Request: Invalid JSON format.'; }
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') statusCode = 401; // Handled here if interceptor somehow missed it

  // Sanitize message for production
  if (statusCode >= 500 && process.env.NODE_ENV !== 'development') {
    message = 'Internal Server Error';
  }

  res.status(statusCode).json({
    message: message,
    // Optionally include error code or name in non-production if helpful
    // code: err.code,
    // error: process.env.NODE_ENV === 'development' ? err : undefined // Avoid leaking stack in prod
  });
});

// --- Start Server ---
const PORT = parseInt(process.env.PORT || '3001', 10);
httpServer.listen(PORT, '0.0.0.0', () => { // Listen on 0.0.0.0 to be accessible externally if needed (e.g., Docker)
    console.log(`\n🚀 Server ready and running in ${process.env.NODE_ENV} mode.`);
    console.log(`👂 Listening on port: ${PORT}`);
    console.log(`🔗 Allowing CORS requests from: ${process.env.FRONTEND_URL}`);
});

// --- Graceful Shutdown ---
const cleanup = async (signal) => {
  console.log(`\n🚨 Received ${signal}. Initiating graceful shutdown...`);
  try {
      io.close((err) => { // Close Socket.IO connections
           if (err) { console.error('Error closing Socket.IO:', err); }
           else { console.log('⚪ Socket.IO server closed.'); }
       });
      httpServer.close(async () => { // Stop accepting HTTP connections
         console.log('⚪ HTTP server closed.');
          await prisma.$disconnect(); // Close DB connection
          console.log('⚪ Prisma client disconnected.');
         console.log('✅ Shutdown complete.');
          process.exit(0);
      });
  } catch (e) {
     console.error("❌ Error during shutdown:", e);
     process.exit(1);
  }

  // Force exit if cleanup hangs
  setTimeout(() => { console.error('❌ Shutdown timeout, forcing exit.'); process.exit(1); }, 10000).unref(); // 10 sec timeout
};
process.on('SIGTERM', () => cleanup('SIGTERM'));
process.on('SIGINT', () => cleanup('SIGINT')); // Ctrl+C

export default app;