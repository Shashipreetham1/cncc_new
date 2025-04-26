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
if (!jwtSecret || jwtSecret === 'REPLACE_THIS_WITH_A_VERY_STRONG_RANDOM_SECRET_KEY' || jwtSecret.length < 32) {
    console.error("❌ FATAL ERROR: JWT_SECRET is not set or is insecure. Please set a strong unique secret.");
    process.exit(1);
}

// --- Import Application Components ---
import userRoutes from './src/routes/userRoutes.js';
import invoiceRoutes from './src/routes/invoiceRoutes.js';
import purchaseOrderRoutes from './src/routes/purchaseOrderRoutes.js';
import stockRegisterRoutes from './src/routes/stockRegisterRoutes.js';
import editRequestRoutes from './src/routes/editRequestRoutes.js';
import searchRoutes from './src/routes/searchRoutes.js';
import createAdminUser from './src/seeds/createAdminUser.js';

// --- Initialization ---
const prisma = new PrismaClient();
const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true
  }
});

// --- Socket.IO Setup ---
global.io = io; // Make available globally for controllers
const connectedUsers = new Map(); // Track connected sockets by userId

io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);
  let userId = null; // Track the user ID associated with this socket

  // Event for user to identify themselves after connecting (e.g., post-login)
  socket.on('identify-user', (authUserId) => {
      if (authUserId) {
          userId = authUserId;
          connectedUsers.set(userId, socket.id);
          socket.join(`user-${userId}`); // Join a room specific to this user
          console.log(`   👤 User ${userId} identified for socket ${socket.id}, joined room user-${userId}`);
      }
  });

  // Event for admin users to join the global admin notification room
  socket.on('join-admin-room', (adminUserId) => { // Expecting admin's own userId perhaps? Or just verify role later?
    // Better: verify role based on an auth token if sent, or rely on client self-reporting (less secure)
     // Assuming role check happens on backend action or client sends role (as per previous logic)
      socket.join('admin-room');
      console.log(`   👑 Admin User (Socket ID: ${socket.id}) joined admin-room`);
      socket.emit('joined-admin-room-ack', { success: true }); // Acknowledge join
  });

  socket.on('error', (error) => console.error(`❌ Socket error (${socket.id}):`, error));

  socket.on('disconnect', (reason) => {
    console.log(`🔌 Socket disconnected: ${socket.id}, Reason: ${reason}`);
    // Clean up user mapping if identified
    if (userId) {
        connectedUsers.delete(userId);
         console.log(`   👤 User ${userId} mapping removed.`);
    }
  });
});

// --- __dirname Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Database Connection & Seeding ---
const connectDbAndSeed = async () => { /* ... (Connect and seed logic as before) ... */
  try {
    await prisma.$connect();
    console.log('✅ Connected to database successfully');
    await createAdminUser();
  } catch (error) {
    console.error('❌ Failed to connect/seed database:', error);
    await prisma.$disconnect().catch(e => console.error("Error disconnecting Prisma:", e));
    process.exit(1);
  }
};
connectDbAndSeed();

// --- Core Express Middleware ---
app.use(cors({
  origin: process.env.FRONTEND_URL,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Common methods
  allowedHeaders: ["Content-Type", "Authorization"], // Essential headers
  credentials: true
}));
app.use(express.json({ limit: '10mb' })); // Body parser for JSON
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Body parser for URL-encoded

// Static Files Server
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir)); // Serve files under /uploads route

// Basic Request Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// --- API Routes ---
app.use('/api/users', userRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/stock-register', stockRegisterRoutes);
app.use('/api/edit-requests', editRequestRoutes);
app.use('/api/search', searchRoutes);

// --- Root Health Check ---
app.get('/', (req, res) => res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() }));

// --- 404 Not Found Handler ---
app.use((req, res, next) => res.status(404).json({ message: `Resource not found: ${req.originalUrl}` }));

// --- Global Error Handling Middleware ---
app.use((err, req, res, next) => { /* ... (Error handler as previously finalized) ... */
  console.error("--- 💥 Unhandled Error 💥 ---");
  console.error("Route:", req.method, req.originalUrl);
  console.error("Error:", process.env.NODE_ENV === 'development' ? err.stack : err.message);
  console.error("--- End Error ---");

  let statusCode = err.status || err.statusCode || 500;
  if (err instanceof SyntaxError && err.message.includes('JSON')) statusCode = 400;
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') statusCode = 401;
  if (err.code === 'P2002') statusCode = 409; // Prisma unique constraint
  if (err.code === 'P2025') statusCode = 404; // Prisma record not found for update/delete

  res.status(statusCode).json({
    message: statusCode >= 500 ? 'Internal Server Error' : err.message,
    error: process.env.NODE_ENV === 'development' ? { name: err.name, code: err.code, message: err.message } : undefined
  });
});

// --- Start Server ---
const PORT = parseInt(process.env.PORT, 10);
httpServer.listen(PORT, () => {
    console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    console.log(`🔗 Allowing requests from: ${process.env.FRONTEND_URL}`);
});

// --- Graceful Shutdown ---
const cleanup = async (signal) => { /* ... (Shutdown logic as before) ... */
  console.log(`\nReceived ${signal}. Shutting down...`);
  httpServer.close(async () => {
    console.log('✅ HTTP server closed.');
    await prisma.$disconnect();
    console.log('✅ Prisma client disconnected.');
    process.exit(0);
  });
  setTimeout(() => { console.error('❌ Forcing shutdown after timeout.'); process.exit(1); }, 10000);
};
process.on('SIGTERM', () => cleanup('SIGTERM'));
process.on('SIGINT', () => cleanup('SIGINT'));

export default app; // Export for potential testing