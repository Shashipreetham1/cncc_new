import { PrismaClient, EditRequestStatus, Role } from '@prisma/client';

const prisma = new PrismaClient();
const DEFAULT_EDIT_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Get all edit requests (admin only)
export const getAllEditRequests = async (req, res) => {
  // Admins get this, enforced by adminOnly middleware
  const { status, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  if (isNaN(pageNum) || pageNum < 1 || isNaN(limitNum) || limitNum < 1) {
    return res.status(400).json({ message: 'Invalid pagination parameters.' });
  }
  const skip = (pageNum - 1) * limitNum;

  // Build filter
  const where = {};
  if (status && Object.values(EditRequestStatus).includes(status.toUpperCase())) {
      where.status = status.toUpperCase();
  } else if (status && status.toLowerCase() !== 'all') {
       return res.status(400).json({ message: `Invalid status filter. Use PENDING, APPROVED, REJECTED, or omit/use 'all'.` });
  } // else: no status filter applied if omitted or 'all'

  // Build sorting
  const validSortOrders = ['asc', 'desc'];
  const orderByField = ['status', 'createdAt', 'updatedAt'].includes(sortBy) ? sortBy : 'createdAt';
  const orderDirection = validSortOrders.includes(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : 'desc';
  const orderBy = { [orderByField]: orderDirection };


  try {
    // Fetch requests with pagination, filtering, sorting
    const editRequests = await prisma.editRequest.findMany({
      where,
      include: {
        // Include related data, selecting specific fields
        requestedBy: { select: { id: true, username: true } },
        adminUser: { select: { id: true, username: true } },
        invoice: { select: { id: true, companyName: true } }, // Example: Basic info for identification
        purchaseOrder: { select: { id: true, purchaseOrderNumber: true } },
        stockRegister: { select: { id: true, articleName: true } },
      },
      orderBy,
      skip,
      take: limitNum,
    });

    // Get total count matching the filter for pagination
    const total = await prisma.editRequest.count({ where });

    res.json({
      editRequests,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      totalRequests: total,
    });

  } catch (error) {
    console.error('Get All Edit Requests Error:', error);
    res.status(500).json({ message: 'Server Error retrieving edit requests' });
  }
};

// Get specific edit request by ID (admin only)
export const getEditRequestById = async (req, res) => {
  const { id } = req.params;

  if (!id) {
      return res.status(400).json({ message: 'Edit Request ID is required.' });
  }

  try {
    const editRequest = await prisma.editRequest.findUnique({
      where: { id },
      include: {
        requestedBy: { select: { id: true, username: true } },
        adminUser: { select: { id: true, username: true } },
        // Include full related document details if admin needs to see them here
        invoice: true,
        purchaseOrder: true,
        stockRegister: true,
      },
    });

    if (!editRequest) {
      return res.status(404).json({ message: 'Edit request not found' });
    }

    res.json(editRequest);
  } catch (error) {
    console.error('Get Edit Request By ID Error:', error);
    res.status(500).json({ message: 'Server Error retrieving edit request' });
  }
};

// Create new edit request (triggered by specific document route like /invoices/:id/request-edit)
export const createEditRequest = async (req, res) => {
  // Expect documentType ('invoice', 'purchaseOrder', 'stockRegister') and documentId in route params or body
  // Expect requestMessage in body
  const { documentType, documentId } = req.params; // Assuming these come from route, adjust if from body
  const { requestMessage } = req.body;
  const requestedById = req.user.id; // User must be authenticated

  if (!documentType || !documentId || !requestMessage) {
      return res.status(400).json({ message: 'Document type, document ID, and request message are required' });
  }
   if (!requestedById) {
      return res.status(401).json({ message: 'User must be logged in to request edits.' }); // Should be caught by auth middleware anyway
  }


  // --- Find the document and verify ownership ---
  let document;
  const data = { requestMessage, requestedById };

  try {
    switch (documentType) {
      case 'invoice':
        document = await prisma.invoice.findUnique({ where: { id: documentId }, select: { userId: true }});
        if (!document) return res.status(404).json({ message: 'Invoice not found' });
        data.invoiceId = documentId;
        break;
      case 'purchaseOrder':
        document = await prisma.purchaseOrder.findUnique({ where: { id: documentId }, select: { userId: true }});
         if (!document) return res.status(404).json({ message: 'Purchase Order not found' });
        data.purchaseOrderId = documentId;
        break;
      case 'stockRegister':
        document = await prisma.stockRegister.findUnique({ where: { id: documentId }, select: { userId: true }});
         if (!document) return res.status(404).json({ message: 'Stock Register entry not found' });
        data.stockRegisterId = documentId;
        break;
      default:
        return res.status(400).json({ message: 'Invalid document type for edit request' });
    }

    // --- Verify ownership ---
    if (document.userId !== requestedById) {
        return res.status(403).json({ message: 'Not authorized to request edit for this document.' });
    }

    // --- Check if an edit request is already pending ---
    const existingPendingRequest = await prisma.editRequest.findFirst({
        where: {
            status: 'PENDING',
            requestedById: requestedById,
            OR: [
                { invoiceId: data.invoiceId },
                { purchaseOrderId: data.purchaseOrderId },
                { stockRegisterId: data.stockRegisterId }
            ].filter(Boolean) // Filter out undefined IDs
        }
    });

    if (existingPendingRequest) {
        return res.status(400).json({ message: 'An edit request for this document is already pending.' });
    }


    // --- Create the edit request ---
    const newEditRequest = await prisma.editRequest.create({
      data: data,
      include: { // Include data useful for notification/response
        requestedBy: { select: { id: true, username: true } },
        invoice: { select: { id: true, companyName: true } },
        purchaseOrder: { select: { id: true, purchaseOrderNumber: true } },
        stockRegister: { select: { id: true, articleName: true } },
      },
    });

    // --- Emit Socket.IO event for real-time admin notification ---
    if (global.io) {
        let documentInfo = `Document ID ${documentId}`;
        if(newEditRequest.invoice) documentInfo = `Invoice '${newEditRequest.invoice.companyName}' (ID: ${documentId})`;
        else if(newEditRequest.purchaseOrder) documentInfo = `Purchase Order ${newEditRequest.purchaseOrder.purchaseOrderNumber} (ID: ${documentId})`;
        else if(newEditRequest.stockRegister) documentInfo = `Stock Entry '${newEditRequest.stockRegister.articleName}' (ID: ${documentId})`;

        global.io.to('admin-room').emit('new-edit-request', {
            message: `New edit request submitted by ${newEditRequest.requestedBy.username} for ${documentInfo}`,
            editRequest: newEditRequest // Send request details
        });
    } else {
        console.warn("Socket.IO (global.io) not initialized. Real-time notification skipped.");
    }


    res.status(201).json({
      message: 'Edit request submitted successfully',
      editRequest: newEditRequest, // Return the created request
    });

  } catch (error) {
    console.error('Create Edit Request Error:', error);
    // Handle potential unique constraint errors if a request for this doc already exists (though handled above)
    if (error.code === 'P2002') { // Prisma unique constraint violation code
         return res.status(409).json({ message: 'An edit request for this specific document already exists.' });
    }
    res.status(500).json({ message: 'Server Error creating edit request' });
  }
};


// Approve edit request (admin only)
export const approveEditRequest = async (req, res) => {
  const { id } = req.params; // Edit request ID
  const { responseMessage } = req.body;
  const adminUserId = req.user.id; // Admin user ID from auth middleware

  if (!id) {
    return res.status(400).json({ message: 'Edit Request ID is required.' });
  }
  if (!adminUserId) {
      return res.status(401).json({ message: 'Admin user must be logged in.'}); // Should be caught by middleware
  }


  try {
      // Use transaction to ensure atomicity: update request status AND document permission
      const result = await prisma.$transaction(async (tx) => {
          // 1. Find the edit request, ensure it's PENDING
          const editRequest = await tx.editRequest.findUnique({
              where: { id },
              include: { // Include IDs needed for document update and user notification
                  requestedBy: { select: { id: true, username: true }},
                  invoice: { select: { id: true }},
                  purchaseOrder: { select: { id: true }},
                  stockRegister: { select: { id: true }},
              }
          });

          if (!editRequest) {
              throw new Error('Edit request not found'); // Custom error for transaction rollback
          }
          if (editRequest.status !== 'PENDING') {
              throw new Error(`Request already ${editRequest.status.toLowerCase()}`);
          }

          // 2. Determine which document to update and grant permission
          let documentType, documentId, documentUpdatePromise;
          const editableUntil = new Date(Date.now() + DEFAULT_EDIT_DURATION_MS); // Set expiry time

          if (editRequest.invoiceId) {
              documentType = 'invoice';
              documentId = editRequest.invoiceId;
              documentUpdatePromise = tx.invoice.update({
                  where: { id: documentId },
                  data: { allowEditing: true, editableUntil: editableUntil }
              });
          } else if (editRequest.purchaseOrderId) {
              documentType = 'purchase order';
              documentId = editRequest.purchaseOrderId;
               documentUpdatePromise = tx.purchaseOrder.update({
                  where: { id: documentId },
                  data: { allowEditing: true, editableUntil: editableUntil }
              });
          } else if (editRequest.stockRegisterId) {
              documentType = 'stock register entry';
              documentId = editRequest.stockRegisterId;
               documentUpdatePromise = tx.stockRegister.update({
                  where: { id: documentId },
                  data: { allowEditing: true, editableUntil: editableUntil }
              });
          } else {
              throw new Error('Invalid edit request: No associated document found.');
          }

          // 3. Update the document permission
          await documentUpdatePromise;

          // 4. Update the edit request status
          const updatedEditRequest = await tx.editRequest.update({
              where: { id },
              data: {
                  status: 'APPROVED',
                  responseMessage,
                  adminUserId: adminUserId, // Record which admin approved
                  updatedAt: new Date()   // Explicitly set update time
              },
              include: { // Include details for response and notification
                  requestedBy: { select: { id: true, username: true } },
                  adminUser: { select: { id: true, username: true } },
                  invoice: { select: { id: true, companyName: true } },
                  purchaseOrder: { select: { id: true, purchaseOrderNumber: true } },
                  stockRegister: { select: { id: true, articleName: true } },
              }
          });

          return { updatedEditRequest, documentType, requesterId: editRequest.requestedById };
      }); // End of Transaction


      // --- Emit Socket.IO event for real-time notification to the specific requester ---
      if (global.io && result.requesterId) {
          // Target the specific user if possible (e.g., if users have dedicated socket rooms)
          // Simplified: Emit event that the user's frontend can listen for based on request ID
          global.io.emit(`edit-request-update-${result.updatedEditRequest.id}`, {
                message: `Your edit request for ${result.documentType} (ID: ${result.updatedEditRequest.invoiceId || result.updatedEditRequest.purchaseOrderId || result.updatedEditRequest.stockRegisterId}) has been APPROVED.`,
                editRequest: result.updatedEditRequest,
                status: 'APPROVED'
            });

          // Can also emit to a user-specific room if setup: io.to(userSocketRoom).emit(...)
      }

      res.json({
        message: `Edit request for ${result.documentType} approved successfully.`,
        editRequest: result.updatedEditRequest
      });

  } catch (error) {
    console.error('Approve Edit Request Error:', error);
    // Handle specific errors thrown from transaction
    if (error.message === 'Edit request not found') {
         return res.status(404).json({ message: error.message });
    }
    if (error.message.startsWith('Request already')) {
         return res.status(400).json({ message: error.message });
    }
    if (error.message.startsWith('Invalid edit request')) {
        return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server Error approving edit request' });
  }
};

// Reject edit request (admin only)
export const rejectEditRequest = async (req, res) => {
  const { id } = req.params; // Edit request ID
  const { responseMessage } = req.body;
  const adminUserId = req.user.id;

  if (!id) {
    return res.status(400).json({ message: 'Edit Request ID is required.' });
  }
   if (!adminUserId) {
      return res.status(401).json({ message: 'Admin user must be logged in.'});
  }
  if (!responseMessage) {
       return res.status(400).json({ message: 'A rejection reason (responseMessage) is required.' });
  }

  try {
    // Find the request to ensure it exists and is pending
    const editRequest = await prisma.editRequest.findUnique({
        where: { id },
        select: {
            status: true,
            requestedById: true, // Needed for notification
            invoiceId: true,
            purchaseOrderId: true,
            stockRegisterId: true,
        }
    });

    if (!editRequest) {
      return res.status(404).json({ message: 'Edit request not found' });
    }
    if (editRequest.status !== 'PENDING') {
      return res.status(400).json({ message: `This request has already been ${editRequest.status.toLowerCase()}` });
    }

    // Update the edit request status
    const updatedEditRequest = await prisma.editRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        responseMessage,
        adminUserId: adminUserId,
        updatedAt: new Date() // Explicitly set update time
      },
       include: { // Include details for response and notification
          requestedBy: { select: { id: true, username: true } },
          adminUser: { select: { id: true, username: true } },
          invoice: { select: { id: true, companyName: true } },
          purchaseOrder: { select: { id: true, purchaseOrderNumber: true } },
          stockRegister: { select: { id: true, articleName: true } },
      }
    });

    // --- Emit Socket.IO event for real-time notification to the requester ---
     if (global.io && editRequest.requestedById) {
         let documentType = 'document';
          if(editRequest.invoiceId) documentType = 'invoice';
          else if(editRequest.purchaseOrderId) documentType = 'purchase order';
          else if(editRequest.stockRegisterId) documentType = 'stock register entry';

          global.io.emit(`edit-request-update-${id}`, {
                message: `Your edit request for ${documentType} (ID: ${editRequest.invoiceId || editRequest.purchaseOrderId || editRequest.stockRegisterId}) has been REJECTED. Reason: ${responseMessage}`,
                editRequest: updatedEditRequest,
                status: 'REJECTED'
            });
      }

    res.json({
      message: 'Edit request rejected',
      editRequest: updatedEditRequest
    });

  } catch (error) {
    console.error('Reject Edit Request Error:', error);
    res.status(500).json({ message: 'Server Error rejecting edit request' });
  }
};