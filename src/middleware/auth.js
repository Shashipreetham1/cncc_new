import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'; // Use env variable in production

export const auth = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Find user
    const user = await prisma.user.findUnique({
      where: { id: decoded.id }
    });

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // Add user to request
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Middleware to check if user is admin
export const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Access denied. Admin only.' });
  }
  next();
};

// Check if edit is allowed for the document
export const canEdit = async (req, res, next) => {
  try {
    const documentType = req.params.documentType;
    const documentId = req.params.id;
    let document;

    // Find the document
    switch (documentType) {
      case 'invoice':
        document = await prisma.invoice.findUnique({ where: { id: documentId } });
        break;
      case 'purchaseOrder':
        document = await prisma.purchaseOrder.findUnique({ where: { id: documentId } });
        break;
      case 'stockRegister':
        document = await prisma.stockRegister.findUnique({ where: { id: documentId } });
        break;
      default:
        return res.status(400).json({ message: 'Invalid document type' });
    }

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Check if user is the owner or admin
    const isOwner = document.userId === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';
    
    // Check if document is still editable (within 24 hours or has permission)
    const now = new Date();
    const isWithin24Hours = (now - new Date(document.createdAt)) < (24 * 60 * 60 * 1000);
    
    // Allow if:
    // 1. User is admin
    // 2. User is owner AND (within 24 hours OR allowEditing is true)
    if (isAdmin || (isOwner && (isWithin24Hours || document.allowEditing))) {
      return next();
    }
    
    res.status(403).json({ 
      message: 'Edit not allowed. Please request permission from admin.',
      canRequestPermission: isOwner && !isWithin24Hours && !document.allowEditing
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};