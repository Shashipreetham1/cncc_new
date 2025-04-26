import { PrismaClient, Role } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { createEditRequest } from './editRequestController.js';

const prisma = new PrismaClient();

// Utility for safe file deletion
const safeUnlink = (filePath) => {
  if (filePath) {
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.error(`Error deleting file (${filePath}):`, err);
      }
    });
  }
};

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
      items, // Expected as JSON string or array
      totalAmount
    } = req.body;

     // Basic Validations
    if (!id || !orderDate || !fromAddress || !vendorName || !purchaseOrderNumber || !totalAmount || !items) {
        return res.status(400).json({ message: 'Missing required fields (id, orderDate, fromAddress, vendorName, purchaseOrderNumber, totalAmount, items)' });
    }

    // Check for existing ID
    const existingPO = await prisma.purchaseOrder.findUnique({ where: { id }});
    if (existingPO) {
        return res.status(400).json({ message: 'A purchase order with this ID already exists. Please use a unique ID.' });
    }

    // Parse items safely
    let parsedItems;
    try {
        parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
        if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
            throw new Error('Items data must be a non-empty array.');
        }
        parsedItems.forEach(item => {
             if (!item.description || !item.quantity || !item.rate) throw new Error ('Each item must have description, quantity, and rate.');
        });
    } catch (e) {
        safeUnlink(req.file?.path);
        return res.status(400).json({ message: `Invalid items data: ${e.message}` });
    }

    // Get file path
    const purchaseOrderFileUrl = req.file ? req.file.path.replace(/\\/g, '/') : null;

    // Prepare data
    const poData = {
        id,
        orderDate: new Date(orderDate),
        fromAddress,
        vendorName,
        contactNumber,
        gstNumber,
        purchaseOrderNumber,
        totalAmount: parseFloat(totalAmount),
        purchaseOrderFileUrl,
        userId: req.user.id,
        items: {
          create: parsedItems.map(item => ({
            description: item.description,
            quantity: parseInt(item.quantity, 10),
            rate: parseFloat(item.rate)
          }))
        }
    };

    // Create purchase order with nested items
    const newPurchaseOrder = await prisma.purchaseOrder.create({
      data: poData,
      include: {
        items: true,
        user: { select: { id: true, username: true }}
      }
    });

    res.status(201).json(newPurchaseOrder);

  } catch (error) {
    console.error('Create Purchase Order Error:', error);
    safeUnlink(req.file?.path);
    if (error.code === 'P2002') {
        return res.status(409).json({ message: `Purchase Order creation failed: ID already exists.` });
    }
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
        return res.status(400).json({ message: `Invalid JSON format in request body (likely 'items').` });
    }
    res.status(500).json({ message: 'Server Error creating purchase order', error: error.message });
  }
};

// Get all purchase orders (admin sees all, user sees own)
export const getAllPurchaseOrders = async (req, res) => {
  const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  if (isNaN(pageNum) || pageNum < 1 || isNaN(limitNum) || limitNum < 1) {
    return res.status(400).json({ message: 'Invalid pagination parameters.' });
  }
  const skip = (pageNum - 1) * limitNum;

  // Determine filter based on user role
  const where = req.user.role === 'ADMIN' ? {} : { userId: req.user.id };

   // Build sorting
  const validSortOrders = ['asc', 'desc'];
  const orderByField = ['vendorName', 'orderDate', 'purchaseOrderNumber', 'totalAmount', 'createdAt', 'updatedAt'].includes(sortBy) ? sortBy : 'createdAt';
  const orderDirection = validSortOrders.includes(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : 'desc';
  const orderBy = { [orderByField]: orderDirection };

  try {
    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where,
      include: {
        items: true,
        user: { select: { id: true, username: true } }
      },
      orderBy,
      skip,
      take: limitNum
    });

    const total = await prisma.purchaseOrder.count({ where });

    res.json({
      purchaseOrders,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      totalPurchaseOrders: total
    });

  } catch (error) {
    console.error('Get All Purchase Orders Error:', error);
    res.status(500).json({ message: 'Server Error retrieving purchase orders' });
  }
};

// Get purchase order by ID
export const getPurchaseOrderById = async (req, res) => {
  const { id } = req.params;

  try {
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: true,
        user: { select: { id: true, username: true } }
      }
    });

    if (!purchaseOrder) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    // Authorization check: Owner or Admin
    if (req.user.role !== 'ADMIN' && purchaseOrder.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to view this purchase order' });
    }

    res.json(purchaseOrder);

  } catch (error) {
    console.error('Get Purchase Order By ID Error:', error);
    res.status(500).json({ message: 'Server Error retrieving purchase order' });
  }
};

// Update purchase order
export const updatePurchaseOrder = async (req, res) => {
   // Permission checked by `canEdit` middleware
  const { id } = req.params;
  const {
    orderDate,
    fromAddress,
    vendorName,
    contactNumber,
    gstNumber,
    purchaseOrderNumber,
    items, // Expected as JSON string or array
    totalAmount
  } = req.body;

   // Basic presence check
   if (!orderDate || !fromAddress || !vendorName || !purchaseOrderNumber || !totalAmount || !items) {
     return res.status(400).json({ message: 'Missing required fields for update (orderDate, fromAddress, vendorName, purchaseOrderNumber, totalAmount, items)' });
   }

  // Parse items safely
  let parsedItems;
  try {
     parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
     if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
        throw new Error('Items data must be a non-empty array.');
    }
     parsedItems.forEach(item => {
             if (!item.description || !item.quantity || !item.rate) throw new Error ('Each item must have description, quantity, and rate.');
        });
  } catch (e) {
     safeUnlink(req.file?.path);
     return res.status(400).json({ message: `Invalid items data: ${e.message}` });
  }

  // Determine new file URL or keep existing
  let newPOFileUrl;
  let oldPOFileUrl;

  try {
    // Find the current file URL
    const existingPO = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { purchaseOrderFileUrl: true }
    });
    if (!existingPO) {
        return res.status(404).json({ message: 'Purchase order not found for update' });
    }
    oldPOFileUrl = existingPO.purchaseOrderFileUrl;

    newPOFileUrl = req.file ? req.file.path.replace(/\\/g, '/') : oldPOFileUrl;

    // Prepare update data
    const updateData = {
      orderDate: orderDate ? new Date(orderDate) : undefined,
      fromAddress,
      vendorName,
      contactNumber,
      gstNumber,
      purchaseOrderNumber,
      totalAmount: parseFloat(totalAmount),
      purchaseOrderFileUrl: newPOFileUrl,
    };

    // Transaction: Delete old items, Update PO, Create new items
    const updatedPurchaseOrder = await prisma.$transaction(async (tx) => {
        // Delete existing items
        await tx.item.deleteMany({
          where: { purchaseOrderId: id }
        });

        // Update PO and create new items
        return tx.purchaseOrder.update({
          where: { id },
          data: {
              ...updateData,
              items: {
                create: parsedItems.map(item => ({
                    description: item.description,
                    quantity: parseInt(item.quantity, 10),
                    rate: parseFloat(item.rate)
                }))
             }
          },
          include: { // Include relations in response
            items: true,
            user: { select: { id: true, username: true } }
          }
        });
    }); // End transaction

    // If transaction succeeded and file replaced, delete old file
    if (req.file && oldPOFileUrl) {
      safeUnlink(oldPOFileUrl);
    }

    res.json(updatedPurchaseOrder);

  } catch (error) {
    console.error('Update Purchase Order Error:', error);
    if (req.file) safeUnlink(req.file.path);
     if (error instanceof SyntaxError && error.message.includes('JSON')) {
        return res.status(400).json({ message: `Invalid JSON format in request body (likely 'items').` });
    }
    res.status(500).json({ message: 'Server Error updating purchase order', error: error.message });
  }
};

// Delete purchase order
export const deletePurchaseOrder = async (req, res) => {
  const { id } = req.params;

  try {
    // Check existence, owner, file URL
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { userId: true, purchaseOrderFileUrl: true }
    });

    if (!purchaseOrder) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    // Authorization: Owner or Admin
    if (req.user.role !== 'ADMIN' && purchaseOrder.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this purchase order' });
    }

    // Delete associated file
    safeUnlink(purchaseOrder.purchaseOrderFileUrl);

    // Delete purchase order (items, edit requests cascade based on schema)
    await prisma.purchaseOrder.delete({
      where: { id }
    });

    res.status(200).json({ message: 'Purchase order deleted successfully' });

  } catch (error) {
    console.error('Delete Purchase Order Error:', error);
    if (error.code === 'P2014') {
        return res.status(409).json({ message: `Cannot delete purchase order due to related records.` });
    }
    res.status(500).json({ message: 'Server Error deleting purchase order', error: error.message });
  }
};

// Request edit permission for this purchase order
export const requestEditPermission = async (req, res) => {
   req.params.documentType = 'purchaseOrder';
   // Delegate to shared controller logic
   createEditRequest(req, res);
};