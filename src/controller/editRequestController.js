import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get all edit requests (admin only)
export const getAllEditRequests = async (req, res) => {
  try {
    const { status = 'PENDING', page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build where clause for filtering
    const where = {};
    
    // Filter by status if provided
    if (status && status !== 'ALL') {
      where.status = status;
    }
    
    // Get edit requests with pagination
    const editRequests = await prisma.editRequest.findMany({
      where,
      include: {
        requestedBy: {
          select: {
            id: true,
            username: true
          }
        },
        invoice: {
          select: {
            id: true,
            companyName: true,
            vendorName: true,
            createdAt: true
          }
        },
        purchaseOrder: {
          select: {
            id: true,
            vendorName: true,
            purchaseOrderNumber: true,
            createdAt: true
          }
        },
        stockRegister: {
          select: {
            id: true,
            articleName: true,
            voucherOrBillNumber: true,
            createdAt: true
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
    const total = await prisma.editRequest.count({ where });
    
    res.json({
      editRequests,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Get edit request by ID
export const getEditRequestById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const editRequest = await prisma.editRequest.findUnique({
      where: { id },
      include: {
        requestedBy: {
          select: {
            id: true,
            username: true
          }
        },
        invoice: {
          select: {
            id: true,
            companyName: true,
            vendorName: true,
            createdAt: true,
            allowEditing: true
          }
        },
        purchaseOrder: {
          select: {
            id: true,
            vendorName: true,
            purchaseOrderNumber: true,
            createdAt: true,
            allowEditing: true
          }
        },
        stockRegister: {
          select: {
            id: true,
            articleName: true,
            voucherOrBillNumber: true,
            createdAt: true,
            allowEditing: true
          }
        }
      }
    });
    
    if (!editRequest) {
      return res.status(404).json({ message: 'Edit request not found' });
    }
    
    res.json(editRequest);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Approve edit request
export const approveEditRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { responseMessage } = req.body;
    
    // Check if edit request exists
    const editRequest = await prisma.editRequest.findUnique({
      where: { id },
      include: {
        invoice: true,
        purchaseOrder: true,
        stockRegister: true
      }
    });
    
    if (!editRequest) {
      return res.status(404).json({ message: 'Edit request not found' });
    }
    
    // Check if request is already processed
    if (editRequest.status !== 'PENDING') {
      return res.status(400).json({ 
        message: `This request has already been ${editRequest.status.toLowerCase()}`
      });
    }
    
    // Determine which document type needs to be updated
    let documentType, documentId, updateResult;
    
    if (editRequest.invoiceId) {
      documentType = 'invoice';
      documentId = editRequest.invoiceId;
      
      // Update invoice allowEditing flag
      updateResult = await prisma.invoice.update({
        where: { id: documentId },
        data: { allowEditing: true }
      });
    } else if (editRequest.purchaseOrderId) {
      documentType = 'purchase order';
      documentId = editRequest.purchaseOrderId;
      
      // Update purchase order allowEditing flag
      updateResult = await prisma.purchaseOrder.update({
        where: { id: documentId },
        data: { allowEditing: true }
      });
    } else if (editRequest.stockRegisterId) {
      documentType = 'stock register entry';
      documentId = editRequest.stockRegisterId;
      
      // Update stock register allowEditing flag
      updateResult = await prisma.stockRegister.update({
        where: { id: documentId },
        data: { allowEditing: true }
      });
    } else {
      return res.status(400).json({ message: 'Invalid edit request (no document referenced)' });
    }
    
    // Update edit request status
    const updatedEditRequest = await prisma.editRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        responseMessage,
        adminUserId: req.user.id,
        updatedAt: new Date()
      },
      include: {
        requestedBy: {
          select: {
            id: true,
            username: true
          }
        },
        adminUser: {
          select: {
            id: true,
            username: true
          }
        }
      }
    });
    
    res.json({
      message: `Edit permission for ${documentType} approved successfully`,
      editRequest: updatedEditRequest
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// Reject edit request
export const rejectEditRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { responseMessage } = req.body;
    
    // Check if edit request exists
    const editRequest = await prisma.editRequest.findUnique({
      where: { id }
    });
    
    if (!editRequest) {
      return res.status(404).json({ message: 'Edit request not found' });
    }
    
    // Check if request is already processed
    if (editRequest.status !== 'PENDING') {
      return res.status(400).json({ 
        message: `This request has already been ${editRequest.status.toLowerCase()}`
      });
    }
    
    // Determine document type for response message
    let documentType;
    
    if (editRequest.invoiceId) {
      documentType = 'invoice';
    } else if (editRequest.purchaseOrderId) {
      documentType = 'purchase order';
    } else if (editRequest.stockRegisterId) {
      documentType = 'stock register entry';
    } else {
      return res.status(400).json({ message: 'Invalid edit request (no document referenced)' });
    }
    
    // Update edit request status
    const updatedEditRequest = await prisma.editRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        responseMessage,
        adminUserId: req.user.id,
        updatedAt: new Date()
      },
      include: {
        requestedBy: {
          select: {
            id: true,
            username: true
          }
        },
        adminUser: {
          select: {
            id: true,
            username: true
          }
        }
      }
    });
    
    res.json({
      message: `Edit permission for ${documentType} rejected`,
      editRequest: updatedEditRequest
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};