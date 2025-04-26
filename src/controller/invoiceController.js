import { PrismaClient, Role } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { createEditRequest } from './editRequestController.js'; // Import function if request handled here

const prisma = new PrismaClient();

// Utility for safe file deletion
const safeUnlink = (filePath) => {
  if (filePath) {
    fs.unlink(filePath, (err) => {
      // Log error only if it's not a "file not found" error
      if (err && err.code !== 'ENOENT') {
        console.error(`Error deleting file (${filePath}):`, err);
      }
    });
  }
};

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
      products, // Expected as JSON string or array
      totalAmount,
    } = req.body;

    // Basic Validations
    if (!id || !companyName || !vendorName || !address || !totalAmount || !products || !purchaseDate) {
      return res.status(400).json({ message: 'Missing required fields (id, companyName, vendorName, address, totalAmount, products, purchaseDate)' });
    }

    // Check if invoice with this ID already exists
    const existingInvoice = await prisma.invoice.findUnique({
      where: { id }
    });
    if (existingInvoice) {
      return res.status(400).json({ message: 'An invoice with this ID already exists. Please use a unique ID.' });
    }

    // Parse products safely
    let parsedProducts;
    try {
        parsedProducts = typeof products === 'string' ? JSON.parse(products) : products;
        if (!Array.isArray(parsedProducts) || parsedProducts.length === 0) {
            throw new Error('Products data must be a non-empty array.');
        }
        // Further validation for each product item can be added here
        parsedProducts.forEach(p => {
            if (!p.productName || !p.quantity || !p.price) throw new Error ('Each product must have productName, quantity, and price.');
        });
    } catch (e) {
        safeUnlink(req.file?.path); // Clean up uploaded file on error
        return res.status(400).json({ message: `Invalid products data: ${e.message}` });
    }

    // Get file path (normalized)
    const invoiceFileUrl = req.file ? req.file.path.replace(/\\/g, '/') : null;

    // Prepare data for Prisma create
    const invoiceData = {
      id,
      purchaseDate: new Date(purchaseDate),
      companyName,
      orderOrSerialNumber,
      vendorName,
      contactNumber,
      address,
      invoiceFileUrl,
      additionalDetails,
      totalAmount: parseFloat(totalAmount),
      userId: req.user.id, // Comes from auth middleware
      // 'allowEditing' defaults to false, 'editableUntil' is null by default per schema
      products: {
        create: parsedProducts.map(product => ({
          productName: product.productName,
          serialNumber: product.serialNumber,
          warrantyYears: parseInt(product.warrantyYears || 0, 10),
          quantity: parseInt(product.quantity, 10),
          price: parseFloat(product.price)
        }))
      }
    };

    // Create invoice with nested products
    const newInvoice = await prisma.invoice.create({
      data: invoiceData,
      include: { // Include relations in the response
        products: true,
        user: { select: { id: true, username: true }}
      }
    });

    res.status(201).json(newInvoice);

  } catch (error) {
    console.error('Create Invoice Error:', error);
    safeUnlink(req.file?.path); // Ensure cleanup on any other error
    // Check for specific Prisma errors if needed (e.g., P2002 for unique constraints)
    if (error.code === 'P2002') {
         return res.status(409).json({ message: `Invoice creation failed: A record with the provided identifier already exists.` });
    }
     if (error instanceof SyntaxError && error.message.includes('JSON')) {
        return res.status(400).json({ message: `Invalid JSON format in request body (likely 'products').` });
    }
    res.status(500).json({ message: 'Server Error creating invoice', error: error.message });
  }
};

// Get all invoices (admin sees all, user sees own)
export const getAllInvoices = async (req, res) => {
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
  const orderByField = ['companyName', 'vendorName', 'purchaseDate', 'totalAmount', 'createdAt', 'updatedAt'].includes(sortBy) ? sortBy : 'createdAt';
  const orderDirection = validSortOrders.includes(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : 'desc';
  const orderBy = { [orderByField]: orderDirection };

  try {
    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        products: true,
        user: { select: { id: true, username: true } }
      },
      orderBy,
      skip,
      take: limitNum
    });

    const total = await prisma.invoice.count({ where });

    res.json({
      invoices,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      totalInvoices: total
    });

  } catch (error) {
    console.error('Get All Invoices Error:', error);
    res.status(500).json({ message: 'Server Error retrieving invoices' });
  }
};

// Get specific invoice by ID
export const getInvoiceById = async (req, res) => {
  const { id } = req.params;

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        products: true,
        user: { select: { id: true, username: true } }
      }
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Authorization check: Owner or Admin can view
    if (req.user.role !== 'ADMIN' && invoice.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to view this invoice' });
    }

    res.json(invoice);

  } catch (error) {
    console.error('Get Invoice By ID Error:', error);
    res.status(500).json({ message: 'Server Error retrieving invoice' });
  }
};

// Update invoice
export const updateInvoice = async (req, res) => {
  // Permission checked by `canEdit` middleware BEFORE this controller runs.
  // `req.user` is available from `auth` middleware.
  const { id } = req.params;
  const {
    purchaseDate,
    companyName,
    orderOrSerialNumber,
    vendorName,
    contactNumber,
    address,
    additionalDetails,
    products, // Expected as JSON string or array
    totalAmount
  } = req.body;

   // We don't need to fetch the document again if `canEdit` attaches it, but let's fetch anyway for atomicity.
   // Or rely on the `canEdit` middleware having validated existence/permissions.

  // Basic presence check - more specific validation can be added
   if (!companyName || !vendorName || !address || !totalAmount || !products || !purchaseDate) {
     return res.status(400).json({ message: 'Missing required fields for update (companyName, vendorName, address, totalAmount, products, purchaseDate)' });
   }

  // Parse products safely
  let parsedProducts;
  try {
    parsedProducts = typeof products === 'string' ? JSON.parse(products) : products;
     if (!Array.isArray(parsedProducts) || parsedProducts.length === 0) {
        throw new Error('Products data must be a non-empty array.');
    }
     parsedProducts.forEach(p => {
            if (!p.productName || !p.quantity || !p.price) throw new Error ('Each product must have productName, quantity, and price.');
     });
  } catch (e) {
     safeUnlink(req.file?.path);
     return res.status(400).json({ message: `Invalid products data: ${e.message}` });
  }

  // Determine new file URL or keep existing
  let newInvoiceFileUrl;
  let oldInvoiceFileUrl; // To delete later if replaced

  try {
      // Find the current file URL *before* the transaction
      const existingInvoice = await prisma.invoice.findUnique({
          where: { id },
          select: { invoiceFileUrl: true }
      });
      if (!existingInvoice) {
           // Should have been caught by canEdit, but check defensively
           return res.status(404).json({ message: 'Invoice not found for update' });
      }
      oldInvoiceFileUrl = existingInvoice.invoiceFileUrl;

      if (req.file) {
        newInvoiceFileUrl = req.file.path.replace(/\\/g, '/');
      } else {
        // Keep old file path if no new file uploaded
        newInvoiceFileUrl = oldInvoiceFileUrl;
      }

     // Prepare update data
     const updateData = {
        purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined, // Update only if provided
        companyName,
        orderOrSerialNumber,
        vendorName,
        contactNumber,
        address,
        invoiceFileUrl: newInvoiceFileUrl,
        additionalDetails,
        totalAmount: parseFloat(totalAmount),
        // IMPORTANT: We replace all products. No partial update supported here.
        // allowEditing and editableUntil are handled by admin approval flow
    };

    // Transaction: Delete old products, Update invoice, Create new products
    const updatedInvoice = await prisma.$transaction(async (tx) => {
        // 1. Delete existing products associated with this invoice
        await tx.product.deleteMany({
          where: { invoiceId: id }
        });

        // 2. Update the invoice details and create new products
        return tx.invoice.update({
          where: { id },
          data: {
              ...updateData,
              products: {
                create: parsedProducts.map(product => ({
                    productName: product.productName,
                    serialNumber: product.serialNumber,
                    warrantyYears: parseInt(product.warrantyYears || 0, 10),
                    quantity: parseInt(product.quantity, 10),
                    price: parseFloat(product.price)
                }))
            }
          },
          include: { // Include relations in response
            products: true,
            user: { select: { id: true, username: true } }
          }
        });
    }); // End transaction

    // If transaction succeeded and a new file replaced an old one, delete the old file
    if (req.file && oldInvoiceFileUrl) {
      safeUnlink(oldInvoiceFileUrl);
    }

    res.json(updatedInvoice);

  } catch (error) {
    console.error('Update Invoice Error:', error);
    // If a new file was uploaded during the failed attempt, try to delete it
    if (req.file) safeUnlink(req.file.path);

     if (error instanceof SyntaxError && error.message.includes('JSON')) {
        return res.status(400).json({ message: `Invalid JSON format in request body (likely 'products').` });
    }
    res.status(500).json({ message: 'Server Error updating invoice', error: error.message });
  }
};

// Delete invoice
export const deleteInvoice = async (req, res) => {
  const { id } = req.params;

  try {
    // Check if invoice exists and get owner + file URL
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { userId: true, invoiceFileUrl: true } // Only fetch needed fields
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Authorization check: Owner or Admin can delete
    if (req.user.role !== 'ADMIN' && invoice.userId !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this invoice' });
    }

    // Delete associated file first
    safeUnlink(invoice.invoiceFileUrl);

    // Delete invoice (relations like Products and EditRequests cascade delete based on schema)
    await prisma.invoice.delete({
      where: { id }
    });

    res.status(200).json({ message: 'Invoice deleted successfully' }); // 200 OK or 204 No Content

  } catch (error) {
    console.error('Delete Invoice Error:', error);
     // Handle case where related data prevents deletion (e.g., if schema changes ON DELETE rule)
    if (error.code === 'P2014') { // Prisma relation constraint violation
         return res.status(409).json({ message: `Cannot delete invoice due to related records. Ensure dependent data is handled.` });
    }
    res.status(500).json({ message: 'Server Error deleting invoice', error: error.message });
  }
};

// Request edit permission for this specific invoice
export const requestEditPermission = async (req, res) => {
   // Pass necessary details to the shared createEditRequest controller/logic
   // The route already has /:id for documentId
   req.params.documentType = 'invoice'; // Set document type explicitly for controller
   // Let createEditRequest handle finding the document, checking ownership, etc.
   createEditRequest(req, res);
};