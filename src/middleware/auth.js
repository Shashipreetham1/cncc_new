import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
// CRITICAL: Use a strong secret from environment variables
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not defined in environment variables.");
  process.exit(1); // Exit if secret is missing
}

/**
 * Authentication Middleware: Verifies JWT token and attaches user to request.
 */
export const auth = async (req, res, next) => {
  const authHeader = req.header('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    // Allow access to specific non-protected routes if needed (usually handled at route level)
    // For this structure, assume all routes using this middleware require a token.
    return res.status(401).json({ message: 'Authorization denied: No token provided' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET); // decoded will contain { id, username, role, iat, exp }

    // Find user based on token payload
    // Select only necessary fields to avoid exposing sensitive data like password hash
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        username: true,
        role: true,
      },
    });

    if (!user) {
      // User may have been deleted after token was issued
      return res.status(401).json({ message: 'Authorization denied: User not found' });
    }

    // Attach user object to the request for downstream middleware/controllers
    req.user = user;
    next(); // Proceed to the next middleware or route handler
  } catch (err) {
    console.error('Authentication error:', err.message);
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Authorization denied: Invalid token' });
    } else if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Authorization denied: Token expired' });
    } else {
        return res.status(500).json({ message: 'Internal Server Error during authentication' });
    }
  }
};

/**
 * Admin Authorization Middleware: Checks if the authenticated user is an ADMIN.
 * Must be used AFTER the `auth` middleware.
 */
export const adminOnly = (req, res, next) => {
  // Check if user object exists (populated by previous auth middleware) and has ADMIN role
  if (!req.user) {
     // This shouldn't happen if 'auth' middleware runs first, but defensively check
     console.error("Error: adminOnly middleware run without preceding auth middleware setting req.user");
     return res.status(500).json({ message: 'Server configuration error' });
  }

  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Access denied: Admin privileges required.' });
  }
  next(); // User is an admin, proceed
};


/**
 * Edit Permission Middleware: Checks if the user can edit a specific document.
 * Assumes `req.params.documentType` ('invoice', 'purchaseOrder', 'stockRegister') and `req.params.id` are set.
 * Should be used AFTER the `auth` middleware.
 */
export const canEdit = async (req, res, next) => {
  try {
    const documentType = req.params.documentType; // e.g., 'invoice'
    const documentId = req.params.id; // The ID of the specific document

    if (!req.user) {
        console.error("Error: canEdit middleware run without preceding auth middleware setting req.user");
        return res.status(500).json({ message: 'Server configuration error' });
    }
    if (!documentType || !documentId) {
        console.error(`Error: Missing documentType (${documentType}) or id (${documentId}) in req.params for canEdit middleware`);
        return res.status(400).json({ message: 'Bad Request: Missing document identifier in URL path for permission check.' });
    }


    let document;
    const commonInclude = { select: { userId: true, createdAt: true, allowEditing: true, editableUntil: true }};

    // Find the document based on type
    switch (documentType) {
      case 'invoice':
        document = await prisma.invoice.findUnique({ where: { id: documentId }, ...commonInclude });
        break;
      case 'purchaseOrder':
        document = await prisma.purchaseOrder.findUnique({ where: { id: documentId }, ...commonInclude });
        break;
      case 'stockRegister':
        document = await prisma.stockRegister.findUnique({ where: { id: documentId }, ...commonInclude });
        break;
      default:
        console.warn(`Invalid documentType (${documentType}) provided to canEdit middleware`);
        return res.status(400).json({ message: 'Invalid document type specified for permission check' });
    }

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // --- Permission Logic ---
    const isOwner = document.userId === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';

    // Calculate if still within the initial editing window (e.g., 24 hours from CREATION)
    // Adjust the duration (24 * 60 * 60 * 1000) if needed
    const now = new Date();
    const initialWindowMs = 24 * 60 * 60 * 1000;
    const isWithinInitialWindow = (now.getTime() - new Date(document.createdAt).getTime()) < initialWindowMs;

    // Check if explicit permission has been granted and is still valid (if editableUntil is set)
    const hasValidAdminPermission = document.allowEditing && (!document.editableUntil || now < new Date(document.editableUntil));


    // --- Determine final edit permission ---
    let allowedToEdit = false;

    if (isAdmin) {
      allowedToEdit = true; // Admins can always edit
    } else if (isOwner) {
      // Owners can edit if:
      // 1. Within the initial creation window OR
      // 2. They have been granted explicit, valid permission by an admin
      allowedToEdit = isWithinInitialWindow || hasValidAdminPermission;
    }


    // --- Respond based on permission ---
    if (allowedToEdit) {
      req.document = document; // Optionally attach the document to the request for the controller
      return next(); // Allow access
    } else {
      // User is not allowed to edit, provide informative message
      const needsPermission = isOwner && !isWithinInitialWindow && !document.allowEditing;
      const reason = isAdmin ? "Admin check failed (this shouldn't happen)" : // Should never happen if admin is allowed
                     !isOwner ? "Not authorized (not owner)" :
                     !isWithinInitialWindow && !document.allowEditing ? "Initial edit window expired. Please request permission." :
                     document.allowEditing && document.editableUntil && now >= new Date(document.editableUntil) ? "Admin granted edit permission has expired." :
                     "Edit not allowed for unknown reason."; // Fallback

      return res.status(403).json({
        message: 'Edit not allowed. ' + reason,
        needsPermissionRequest: needsPermission // Flag for frontend to show 'Request Edit' button
      });
    }
  } catch (err) {
    console.error('Error in canEdit middleware:', err);
    res.status(500).json({ message: 'Server error during permission check' });
  }
};