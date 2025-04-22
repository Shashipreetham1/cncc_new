import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Create a new invoice
export const createInvoice = async (req, res) => {
  try {
    const {
      id, // User provided ID
      purchaseDate,
      companyName,
      orderOrSerialNumber,
      vendorName,
      contactNumber,
      address,
      additionalDetails,
      products,
      totalAmount
    } = req.body;

    // Check if id is provided
    if (!id) {
      return res.status(400).json({ message: 'Invoice ID is required' });
    }

    // Check if invoice with this ID already exists
    const existingInvoice = await prisma.invoice.findUnique({
      where: { id }
    });

    if (existingInvoice) {
      return res.status(400).json({ message: 'An invoice with this ID already exists' });
    }

    // Parse products JSON if it's a string
    let parsedProducts;
    try {
      parsedProducts = typeof products === 'string' ? JSON.parse(products) : products;
    } catch (e) {
      return res.status(400).json({ message: 'Invalid products data' });
    }

    // Get file path if uploaded
    const invoiceFileUrl = req.file ? req.file.path.replace(/\\/g, '/') : null;

    // Create invoice with products
    const invoice = await prisma.invoice.create({
      data: {
        id, // User provided ID
        purchaseDate: new Date(purchaseDate),
        companyName,
        orderOrSerialNumber,
        vendorName,
        contactNumber,
        address,
        invoiceFileUrl,
        additionalDetails,
        totalAmount: parseFloat(totalAmount),
        userId: req.user.id,
        // Calculate editableUntil date (24 hours from now)
        editableUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
        products: {
          create: parsedProducts.map(product => ({
            productName: product.productName,
            serialNumber: product.serialNumber,
            warrantyYears: parseInt(product.warrantyYears || 0),
            quantity: parseInt(product.quantity),
            price: parseFloat(product.price)
          }))
        }
      },
      include: {
        products: true
      }
    });

    res.status(201).json(invoice);
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

// Get all invoices (admin can see all, users can see only their own)
export const getAllInvoices = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Filter based on user role
    const where = req.user.role === 'ADMIN' ? {} : { userId: req.user.id };
    
    // Get invoices with pagination
    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        products: true,
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
    const total = await prisma.invoice.count({ where });
    
    res.json({
      invoices,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Get invoice by ID
export const getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        products: true,
        user: {
          select: {
            id: true,
            username: true
          }
        }
      }
    });
    
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    // Check if user is authorized to view this invoice
    if (req.user.role !== 'ADMIN' && invoice.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    res.json(invoice);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Update invoice
export const updateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      purchaseDate,
      companyName,
      orderOrSerialNumber,
      vendorName,
      contactNumber,
      address,
      additionalDetails,
      products,
      totalAmount
    } = req.body;
    
    // Check if invoice exists
    const existingInvoice = await prisma.invoice.findUnique({
      where: { id },
      include: { products: true }
    });
    
    if (!existingInvoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    // Check if user is authorized to update this invoice
    const isOwner = existingInvoice.userId === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';
    
    // Check if invoice is still editable (within 24 hours or has permission)
    const now = new Date();
    const isWithin24Hours = (now - new Date(existingInvoice.createdAt)) < (24 * 60 * 60 * 1000);
    const canEdit = isAdmin || (isOwner && (isWithin24Hours || existingInvoice.allowEditing));
    
    if (!canEdit) {
      return res.status(403).json({ 
        message: 'Edit not allowed. Please request permission from admin.'
      });
    }
    
    // Parse products JSON if it's a string
    let parsedProducts;
    try {
      parsedProducts = typeof products === 'string' ? JSON.parse(products) : products;
    } catch (e) {
      return res.status(400).json({ message: 'Invalid products data' });
    }
    
    // Get file path if new file uploaded
    const invoiceFileUrl = req.file 
      ? req.file.path.replace(/\\/g, '/') 
      : existingInvoice.invoiceFileUrl;
    
    // If a new file is uploaded, delete the old file
    if (req.file && existingInvoice.invoiceFileUrl) {
      fs.unlink(existingInvoice.invoiceFileUrl, err => {
        if (err && !err.code === 'ENOENT') console.error('Error deleting file:', err);
      });
    }
    
    // Delete existing products and create new ones in a transaction
    const updatedInvoice = await prisma.$transaction(async (tx) => {
      // Delete existing products
      await tx.product.deleteMany({
        where: { invoiceId: id }
      });
      
      // Update invoice and create new products
      return tx.invoice.update({
        where: { id },
        data: {
          purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
          companyName,
          orderOrSerialNumber,
          vendorName,
          contactNumber,
          address,
          invoiceFileUrl,
          additionalDetails,
          totalAmount: totalAmount ? parseFloat(totalAmount) : undefined,
          products: {
            create: parsedProducts.map(product => ({
              productName: product.productName,
              serialNumber: product.serialNumber,
              warrantyYears: parseInt(product.warrantyYears || 0),
              quantity: parseInt(product.quantity),
              price: parseFloat(product.price)
            }))
          }
        },
        include: {
          products: true,
          user: {
            select: {
              id: true,
              username: true
            }
          }
        }
      });
    });
    
    res.json(updatedInvoice);
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

// Delete invoice
export const deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if invoice exists
    const invoice = await prisma.invoice.findUnique({
      where: { id }
    });
    
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    // Check if user is authorized to delete this invoice
    if (req.user.role !== 'ADMIN' && invoice.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    // Delete file if it exists
    if (invoice.invoiceFileUrl) {
      fs.unlink(invoice.invoiceFileUrl, err => {
        if (err && !err.code === 'ENOENT') console.error('Error deleting file:', err);
      });
    }
    
    // Delete invoice (automatically deletes related products due to cascading)
    await prisma.invoice.delete({
      where: { id }
    });
    
    res.json({ message: 'Invoice deleted successfully' });
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
    
    // Check if invoice exists
    const invoice = await prisma.invoice.findUnique({
      where: { id }
    });
    
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    // Check if user is the owner
    if (invoice.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }
    
    // Check if invoice is outside the 24-hour window
    const now = new Date();
    const isWithin24Hours = (now - new Date(invoice.createdAt)) < (24 * 60 * 60 * 1000);
    
    if (isWithin24Hours) {
      return res.status(400).json({ 
        message: 'This invoice is still within the 24-hour edit window. No permission needed.'
      });
    }
    
    // Create edit request
    const editRequest = await prisma.editRequest.create({
      data: {
        requestMessage,
        requestedById: req.user.id,
        invoiceId: id
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