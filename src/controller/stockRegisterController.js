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

// Create a new stock register entry
export const createStockRegister = async (req, res) => {
  try {
    const {
      id, // User provided ID
      articleName,
      entryDate,
      companyName,
      address,
      productDetails,
      voucherOrBillNumber,
      costRate,
      cgst,
      sgst,
      receiptNumber,
      pageNumber,
      billingDate
    } = req.body;

    // Basic Validations
    if (!id || !articleName || !voucherOrBillNumber || !costRate || !billingDate) {
      return res.status(400).json({ message: 'Missing required fields (id, articleName, voucherOrBillNumber, costRate, billingDate)' });
    }

     // Check for existing ID
    const existingEntry = await prisma.stockRegister.findUnique({ where: { id }});
    if (existingEntry) {
        return res.status(400).json({ message: 'A stock register entry with this ID already exists. Please use a unique ID.' });
    }

    // Get file path
    const photoUrl = req.file ? req.file.path.replace(/\\/g, '/') : null;

    // Calculate total rate
    const parsedCostRate = parseFloat(costRate);
    const parsedCgst = parseFloat(cgst || 0); // Default CGST/SGST to 0 if not provided
    const parsedSgst = parseFloat(sgst || 0);
    const totalRate = parsedCostRate + parsedCgst + parsedSgst;

    // Prepare data
    const entryData = {
        id,
        articleName,
        entryDate: entryDate ? new Date(entryDate) : new Date(), // Default entryDate to now if not provided
        companyName,
        address,
        productDetails,
        voucherOrBillNumber,
        costRate: parsedCostRate,
        cgst: parsedCgst,
        sgst: parsedSgst,
        totalRate, // Calculated value
        receiptNumber,
        pageNumber: pageNumber ? parseInt(pageNumber, 10) : null, // Ensure integer or null
        billingDate: new Date(billingDate),
        photoUrl,
        userId: req.user.id, // from auth middleware
    };

    // Create stock register entry
    const newEntry = await prisma.stockRegister.create({
      data: entryData,
      include: {
         user: { select: { id: true, username: true }}
      }
    });

    res.status(201).json(newEntry);

  } catch (error) {
    console.error('Create Stock Register Error:', error);
    safeUnlink(req.file?.path);
    if (error.code === 'P2002') {
        return res.status(409).json({ message: `Stock Register creation failed: ID already exists.` });
    }
    res.status(500).json({ message: 'Server Error creating stock register entry', error: error.message });
  }
};

// Get all stock register entries (admin sees all, user sees own)
export const getAllStockRegisters = async (req, res) => {
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
    const orderByField = ['articleName', 'entryDate', 'billingDate', 'voucherOrBillNumber', 'costRate', 'totalRate', 'createdAt', 'updatedAt'].includes(sortBy) ? sortBy : 'createdAt';
    const orderDirection = validSortOrders.includes(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : 'desc';
    const orderBy = { [orderByField]: orderDirection };


  try {
    const stockRegisters = await prisma.stockRegister.findMany({
      where,
      include: {
        user: { select: { id: true, username: true } }
      },
      orderBy,
      skip,
      take: limitNum
    });

    const total = await prisma.stockRegister.count({ where });

    res.json({
      stockRegisters,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      totalStockRegisters: total
    });

  } catch (error) {
    console.error('Get All Stock Registers Error:', error);
    res.status(500).json({ message: 'Server Error retrieving stock register entries' });
  }
};

// Get stock register entry by ID
export const getStockRegisterById = async (req, res) => {
  const { id } = req.params;

  try {
    const stockRegister = await prisma.stockRegister.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true } }
      }
    });

    if (!stockRegister) {
      return res.status(404).json({ message: 'Stock register entry not found' });
    }

    // Authorization check: Owner or Admin
    if (req.user.role !== 'ADMIN' && stockRegister.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to view this stock register entry' });
    }

    res.json(stockRegister);

  } catch (error) {
    console.error('Get Stock Register By ID Error:', error);
    res.status(500).json({ message: 'Server Error retrieving stock register entry' });
  }
};

// Update stock register entry
export const updateStockRegister = async (req, res) => {
  // Permission checked by `canEdit` middleware
  const { id } = req.params;
  const {
    articleName,
    entryDate,
    companyName,
    address,
    productDetails,
    voucherOrBillNumber,
    costRate,
    cgst,
    sgst,
    receiptNumber,
    pageNumber,
    billingDate
  } = req.body;

  // Basic Validations
  if (!articleName || !voucherOrBillNumber || !costRate || !billingDate) {
    return res.status(400).json({ message: 'Missing required fields for update (articleName, voucherOrBillNumber, costRate, billingDate)' });
  }


  // Determine new file URL or keep existing
  let newPhotoUrl;
  let oldPhotoUrl;

  try {
    // Fetch existing entry to get old photo URL
    const existingEntry = await prisma.stockRegister.findUnique({
      where: { id },
      select: { photoUrl: true }
    });
    if (!existingEntry) {
      return res.status(404).json({ message: 'Stock register entry not found for update' });
    }
    oldPhotoUrl = existingEntry.photoUrl;

    newPhotoUrl = req.file ? req.file.path.replace(/\\/g, '/') : oldPhotoUrl;


    // Recalculate total rate for update
    const parsedCostRate = parseFloat(costRate);
    const parsedCgst = parseFloat(cgst || 0);
    const parsedSgst = parseFloat(sgst || 0);
    const totalRate = parsedCostRate + parsedCgst + parsedSgst;

    // Prepare update data - update only fields present in request
    const updateData = {
        articleName,
        entryDate: entryDate ? new Date(entryDate) : undefined,
        companyName,
        address,
        productDetails,
        voucherOrBillNumber,
        costRate: parsedCostRate,
        cgst: parsedCgst,
        sgst: parsedSgst,
        totalRate,
        receiptNumber,
        pageNumber: pageNumber !== undefined ? parseInt(pageNumber, 10) : undefined,
        billingDate: billingDate ? new Date(billingDate) : undefined,
        photoUrl: newPhotoUrl
    };

    // Update the entry
    const updatedStockRegister = await prisma.stockRegister.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, username: true } }
      }
    });

    // Delete old file if replaced successfully
    if (req.file && oldPhotoUrl) {
      safeUnlink(oldPhotoUrl);
    }

    res.json(updatedStockRegister);

  } catch (error) {
    console.error('Update Stock Register Error:', error);
    if (req.file) safeUnlink(req.file.path); // Clean up new file on error
    res.status(500).json({ message: 'Server Error updating stock register entry', error: error.message });
  }
};

// Delete stock register entry
export const deleteStockRegister = async (req, res) => {
  const { id } = req.params;

  try {
     // Check existence, owner, file URL
    const stockRegister = await prisma.stockRegister.findUnique({
      where: { id },
      select: { userId: true, photoUrl: true }
    });

    if (!stockRegister) {
      return res.status(404).json({ message: 'Stock register entry not found' });
    }

    // Authorization: Owner or Admin
    if (req.user.role !== 'ADMIN' && stockRegister.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this stock register entry' });
    }

     // Delete associated file
    safeUnlink(stockRegister.photoUrl);

    // Delete stock register entry (edit requests cascade)
    await prisma.stockRegister.delete({
      where: { id }
    });

    res.status(200).json({ message: 'Stock register entry deleted successfully' });

  } catch (error) {
    console.error('Delete Stock Register Error:', error);
    if (error.code === 'P2014') {
       return res.status(409).json({ message: `Cannot delete stock register entry due to related records.` });
    }
    res.status(500).json({ message: 'Server Error deleting stock register entry', error: error.message });
  }
};

// Request edit permission for this stock register entry
export const requestEditPermission = async (req, res) => {
    req.params.documentType = 'stockRegister';
    // Delegate to shared controller logic
    createEditRequest(req, res);
};