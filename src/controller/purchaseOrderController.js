import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Create a new purchase order
export const createPurchaseOrder = async (req, res) => {
  try {
    const {
      id, // User provided ID
      orderDate,
      fromAddress,
      vendorName,
      contactNumber,
      gstNumber,
      purchaseOrderNumber,
      items,
      totalAmount
    } = req.body;

    // Check if id is provided
    if (!id) {
      return res.status(400).json({ message: 'Purchase Order ID is required' });
    }

    // Check if purchase order with this ID already exists
    const existingPO = await prisma.purchaseOrder.findUnique({
      where: { id }
    });

    if (existingPO) {
      return res.status(400).json({ message: 'A purchase order with this ID already exists' });
    }

    // Parse items JSON if it's a string
    let parsedItems;
    try {
      parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
    } catch (e) {
      return res.status(400).json({ message: 'Invalid items data' });
    }

    // Get file path if uploaded
    const purchaseOrderFileUrl = req.file ? req.file.path.replace(/\\/g, '/') : null;

    // Create purchase order with items
    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        id, // User provided ID
        orderDate: new Date(orderDate),
        fromAddress,
        vendorName,
        contactNumber,
        gstNumber,
        purchaseOrderNumber,
        totalAmount: parseFloat(totalAmount),
        purchaseOrderFileUrl,
        userId: req.user.id,
        // Calculate editableUntil date (24 hours from now)
        editableUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
        items: {
          create: parsedItems.map(item => ({
            description: item.description,
            quantity: parseInt(item.quantity),
            rate: parseFloat(item.rate)
          }))
        }
      },
      include: {
        items: true
      }
    });

    res.status(201).json(purchaseOrder);
  } catch (error) {
    console.error(error);
    
    // Delete uploaded file if there was an error
    if (req.file) {
      fs.unlink(req.file.path, err => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// Get all purchase orders (admin can see all, users can see only their own)
export const getAllPurchaseOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Filter based on user role
    const where = req.user.role === 'ADMIN' ? {} : { userId: req.user.id };
    
    // Get purchase orders with pagination
    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where,
      include: {
        items: true,
        user: {
          select: {
            id: true,
            username: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: parseInt(limit)
    });
    
    // Get total count
    const total = await prisma.purchaseOrder.count({ where });
    
    res.json({
      purchaseOrders,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Get purchase order by ID
export const getPurchaseOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: true,
        user: {
          select: {
            id: true,
            username: true
          }
        }
      }
    });
    
    if (!purchaseOrder) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    
    // Check if user is authorized to view this purchase order
    if (req.user.role !== 'ADMIN' && purchaseOrder.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    res.json(purchaseOrder);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Update purchase order
export const updatePurchaseOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      orderDate,
      fromAddress,
      vendorName,
      contactNumber,
      gstNumber,
      purchaseOrderNumber,
      items,
      totalAmount
    } = req.body;
    
    // Check if purchase order exists
    const existingPurchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true }
    });
    
    if (!existingPurchaseOrder) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    
    // Check if user is authorized to update this purchase order
    const isOwner = existingPurchaseOrder.userId === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';
    
    // Check if purchase order is still editable (within 24 hours or has permission)
    const now = new Date();
    const isWithin24Hours = (now - new Date(existingPurchaseOrder.createdAt)) < (24 * 60 * 60 * 1000);
    const canEdit = isAdmin || (isOwner && (isWithin24Hours || existingPurchaseOrder.allowEditing));
    
    if (!canEdit) {
      return res.status(403).json({ 
        message: 'Edit not allowed. Please request permission from admin.'
      });
    }
    
    // Parse items JSON if it's a string
    let parsedItems;
    try {
      parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
    } catch (e) {
      return res.status(400).json({ message: 'Invalid items data' });
    }
    
    // Get file path if new file uploaded
    const purchaseOrderFileUrl = req.file 
      ? req.file.path.replace(/\\/g, '/') 
      : existingPurchaseOrder.purchaseOrderFileUrl;
    
    // If a new file is uploaded, delete the old file
    if (req.file && existingPurchaseOrder.purchaseOrderFileUrl) {
      fs.unlink(existingPurchaseOrder.purchaseOrderFileUrl, err => {
        if (err && !err.code === 'ENOENT') console.error('Error deleting file:', err);
      });
    }
    
    // Delete existing items and create new ones in a transaction
    const updatedPurchaseOrder = await prisma.$transaction(async (tx) => {
      // Delete existing items
      await tx.item.deleteMany({
        where: { purchaseOrderId: id }
      });
      
      // Update purchase order and create new items
      return tx.purchaseOrder.update({
        where: { id },
        data: {
          orderDate: orderDate ? new Date(orderDate) : undefined,
          fromAddress,
          vendorName,
          contactNumber,
          gstNumber,
          purchaseOrderNumber,
          totalAmount: totalAmount ? parseFloat(totalAmount) : undefined,
          purchaseOrderFileUrl,
          items: {
            create: parsedItems.map(item => ({
              description: item.description,
              quantity: parseInt(item.quantity),
              rate: parseFloat(item.rate)
            }))
          }
        },
        include: {
          items: true,
          user: {
            select: {
              id: true,
              username: true
            }
          }
        }
      });
    });
    
    res.json(updatedPurchaseOrder);
  } catch (error) {
    console.error(error);
    
    // Delete uploaded file if there was an error
    if (req.file) {
      fs.unlink(req.file.path, err => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

// Delete purchase order
export const deletePurchaseOrder = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if purchase order exists
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id }
    });
    
    if (!purchaseOrder) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    
    // Check if user is authorized to delete this purchase order
    if (req.user.role !== 'ADMIN' && purchaseOrder.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    // Delete file if it exists
    if (purchaseOrder.purchaseOrderFileUrl) {
      fs.unlink(purchaseOrder.purchaseOrderFileUrl, err => {
        if (err && !err.code === 'ENOENT') console.error('Error deleting file:', err);
      });
    }
    
    // Delete purchase order (automatically deletes related items due to cascading)
    await prisma.purchaseOrder.delete({
      where: { id }
    });
    
    res.json({ message: 'Purchase order deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Request edit permission
export const requestEditPermission = async (req, res) => {
  try {
    const { id } = req.params;
    const { requestMessage } = req.body;
    
    // Check if purchase order exists
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id }
    });
    
    if (!purchaseOrder) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    
    // Check if user is the owner
    if (purchaseOrder.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    // Check if purchase order is outside the 24-hour window
    const now = new Date();
    const isWithin24Hours = (now - new Date(purchaseOrder.createdAt)) < (24 * 60 * 60 * 1000);
    
    if (isWithin24Hours) {
      return res.status(400).json({ 
        message: 'This purchase order is still within the 24-hour edit window. No permission needed.'
      });
    }
    
    // Create edit request
    const editRequest = await prisma.editRequest.create({
      data: {
        requestMessage,
        requestedById: req.user.id,
        purchaseOrderId: id
      }
    });
    
    res.status(201).json({
      message: 'Edit permission request submitted successfully',
      editRequest
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};