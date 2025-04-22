import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

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

    // Check if id is provided
    if (!id) {
      return res.status(400).json({ message: 'Stock Register ID is required' });
    }

    // Check if stock register entry with this ID already exists
    const existingEntry = await prisma.stockRegister.findUnique({
      where: { id }
    });

    if (existingEntry) {
      return res.status(400).json({ message: 'A stock register entry with this ID already exists' });
    }

    // Get file path if uploaded
    const photoUrl = req.file ? req.file.path.replace(/\\/g, '/') : null;

    // Calculate total rate
    const parsedCostRate = parseFloat(costRate);
    const parsedCgst = parseFloat(cgst || 0);
    const parsedSgst = parseFloat(sgst || 0);
    const totalRate = parsedCostRate + parsedCgst + parsedSgst;

    // Create stock register entry
    const stockRegister = await prisma.stockRegister.create({
      data: {
        id, // User provided ID
        articleName,
        entryDate: entryDate ? new Date(entryDate) : new Date(),
        companyName,
        address,
        productDetails,
        voucherOrBillNumber,
        costRate: parsedCostRate,
        cgst: parsedCgst,
        sgst: parsedSgst,
        totalRate,
        receiptNumber,
        pageNumber: pageNumber ? parseInt(pageNumber) : null,
        billingDate: new Date(billingDate),
        photoUrl,
        userId: req.user.id,
        // Calculate editableUntil date (24 hours from now)
        editableUntil: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    res.status(201).json(stockRegister);
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

// Get all stock register entries (admin can see all, users can see only their own)
export const getAllStockRegisters = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Filter based on user role
    const where = req.user.role === 'ADMIN' ? {} : { userId: req.user.id };
    
    // Get stock register entries with pagination
    const stockRegisters = await prisma.stockRegister.findMany({
      where,
      include: {
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
    const total = await prisma.stockRegister.count({ where });
    
    res.json({
      stockRegisters,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Get stock register entry by ID
export const getStockRegisterById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const stockRegister = await prisma.stockRegister.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true
          }
        }
      }
    });
    
    if (!stockRegister) {
      return res.status(404).json({ message: 'Stock register entry not found' });
    }
    
    // Check if user is authorized to view this stock register entry
    if (req.user.role !== 'ADMIN' && stockRegister.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    res.json(stockRegister);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Update stock register entry
export const updateStockRegister = async (req, res) => {
  try {
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
    
    // Check if stock register entry exists
    const existingStockRegister = await prisma.stockRegister.findUnique({
      where: { id }
    });
    
    if (!existingStockRegister) {
      return res.status(404).json({ message: 'Stock register entry not found' });
    }
    
    // Check if user is authorized to update this stock register entry
    const isOwner = existingStockRegister.userId === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';
    
    // Check if stock register entry is still editable (within 24 hours or has permission)
    const now = new Date();
    const isWithin24Hours = (now - new Date(existingStockRegister.createdAt)) < (24 * 60 * 60 * 1000);
    const canEdit = isAdmin || (isOwner && (isWithin24Hours || existingStockRegister.allowEditing));
    
    if (!canEdit) {
      return res.status(403).json({ 
        message: 'Edit not allowed. Please request permission from admin.'
      });
    }
    
    // Calculate total rate
    const parsedCostRate = parseFloat(costRate);
    const parsedCgst = parseFloat(cgst || 0);
    const parsedSgst = parseFloat(sgst || 0);
    const totalRate = parsedCostRate + parsedCgst + parsedSgst;
    
    // Get file path if new file uploaded
    const photoUrl = req.file 
      ? req.file.path.replace(/\\/g, '/') 
      : existingStockRegister.photoUrl;
    
    // If a new file is uploaded, delete the old file
    if (req.file && existingStockRegister.photoUrl) {
      fs.unlink(existingStockRegister.photoUrl, err => {
        if (err && !err.code === 'ENOENT') console.error('Error deleting file:', err);
      });
    }
    
    // Update stock register entry
    const updatedStockRegister = await prisma.stockRegister.update({
      where: { id },
      data: {
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
        pageNumber: pageNumber ? parseInt(pageNumber) : null,
        billingDate: billingDate ? new Date(billingDate) : undefined,
        photoUrl
      },
      include: {
        user: {
          select: {
            id: true,
            username: true
          }
        }
      }
    });
    
    res.json(updatedStockRegister);
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

// Delete stock register entry
export const deleteStockRegister = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if stock register entry exists
    const stockRegister = await prisma.stockRegister.findUnique({
      where: { id }
    });
    
    if (!stockRegister) {
      return res.status(404).json({ message: 'Stock register entry not found' });
    }
    
    // Check if user is authorized to delete this stock register entry
    if (req.user.role !== 'ADMIN' && stockRegister.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    // Delete file if it exists
    if (stockRegister.photoUrl) {
      fs.unlink(stockRegister.photoUrl, err => {
        if (err && !err.code === 'ENOENT') console.error('Error deleting file:', err);
      });
    }
    
    // Delete stock register entry
    await prisma.stockRegister.delete({
      where: { id }
    });
    
    res.json({ message: 'Stock register entry deleted successfully' });
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
    
    // Check if stock register entry exists
    const stockRegister = await prisma.stockRegister.findUnique({
      where: { id }
    });
    
    if (!stockRegister) {
      return res.status(404).json({ message: 'Stock register entry not found' });
    }
    
    // Check if user is the owner
    if (stockRegister.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    // Check if stock register entry is outside the 24-hour window
    const now = new Date();
    const isWithin24Hours = (now - new Date(stockRegister.createdAt)) < (24 * 60 * 60 * 1000);
    
    if (isWithin24Hours) {
      return res.status(400).json({ 
        message: 'This entry is still within the 24-hour edit window. No permission needed.'
      });
    }
    
    // Create edit request
    const editRequest = await prisma.editRequest.create({
      data: {
        requestMessage,
        requestedById: req.user.id,
        stockRegisterId: id
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