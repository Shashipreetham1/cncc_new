import { PrismaClient, DocumentType } from '@prisma/client'; // Import Enum if using it

const prisma = new PrismaClient();

/**
 * Helper function to escape CSV fields
 */
const escapeCsvField = (field) => {
  if (field === null || field === undefined) {
    return '';
  }
  const stringField = String(field);
  // If the field contains commas, quotes, or newlines, wrap it in quotes and double inner quotes
  if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  return stringField;
};

// --- Advanced Search Filter Builders ---

/** Build Invoice Filter */
const buildAdvancedInvoiceFilter = (params, userFilter = {}) => {
  const filter = { AND: [] };
  if (Object.keys(userFilter).length > 0) filter.AND.push(userFilter);

  const { dateFrom, dateTo, companyName, vendorName, orderOrSerialNumber, productName, productSerialNumber, minAmount, maxAmount } = params;

  if (dateFrom || dateTo) {
    const dateFilter = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo); // Ensure end of day if needed: new Date(dateTo + 'T23:59:59.999Z');
    filter.AND.push({ purchaseDate: dateFilter });
  }
  if (companyName) filter.AND.push({ companyName: { contains: companyName, mode: 'insensitive' } });
  if (vendorName) filter.AND.push({ vendorName: { contains: vendorName, mode: 'insensitive' } });
  if (orderOrSerialNumber) filter.AND.push({ orderOrSerialNumber: { contains: orderOrSerialNumber, mode: 'insensitive' } });

  if (minAmount || maxAmount) {
    const amountFilter = {};
    if (minAmount) amountFilter.gte = parseFloat(minAmount);
    if (maxAmount) amountFilter.lte = parseFloat(maxAmount);
    filter.AND.push({ totalAmount: amountFilter });
  }

  // Product filters (Match any product where EITHER name OR serial matches)
  if (productName || productSerialNumber) {
    const productOrConditions = [];
    if (productName) {
        productOrConditions.push({ productName: { contains: productName, mode: 'insensitive' } });
    }
    if (productSerialNumber) {
        productOrConditions.push({ serialNumber: { contains: productSerialNumber, mode: 'insensitive' } });
    }
     // Check if any conditions were added before pushing
     if(productOrConditions.length > 0) {
        filter.AND.push({ products: { some: { OR: productOrConditions } } });
     }
  }

  return filter.AND.length > (Object.keys(userFilter).length > 0 ? 1 : 0) ? filter : userFilter; // Return userFilter if only userFilter exists
};

/** Build Purchase Order Filter */
const buildAdvancedPurchaseOrderFilter = (params, userFilter = {}) => {
  const filter = { AND: [] };
   if (Object.keys(userFilter).length > 0) filter.AND.push(userFilter);

  const { dateFrom, dateTo, vendorName, purchaseOrderNumber, itemDescription, minAmount, maxAmount } = params;

  if (dateFrom || dateTo) {
    const dateFilter = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo); // End of day T23:59:59?
    filter.AND.push({ orderDate: dateFilter });
  }
  if (vendorName) filter.AND.push({ vendorName: { contains: vendorName, mode: 'insensitive' } });
  if (purchaseOrderNumber) filter.AND.push({ purchaseOrderNumber: { contains: purchaseOrderNumber, mode: 'insensitive' } });

  if (minAmount || maxAmount) {
    const amountFilter = {};
    if (minAmount) amountFilter.gte = parseFloat(minAmount);
    if (maxAmount) amountFilter.lte = parseFloat(maxAmount);
    filter.AND.push({ totalAmount: amountFilter });
  }

  if (itemDescription) {
    filter.AND.push({ items: { some: { description: { contains: itemDescription, mode: 'insensitive' } } } });
  }

   return filter.AND.length > (Object.keys(userFilter).length > 0 ? 1 : 0) ? filter : userFilter;
};

/** Build Stock Register Filter */
const buildAdvancedStockRegisterFilter = (params, userFilter = {}) => {
  const filter = { AND: [] };
   if (Object.keys(userFilter).length > 0) filter.AND.push(userFilter);

  const {
    entryDateFrom, entryDateTo, billingDateFrom, billingDateTo,
    articleName, companyName, voucherOrBillNumber, receiptNumber, productDetails,
    minCostRate, maxCostRate
    // Removed 'quantity', 'storageLocation' as they are not in the schema
  } = params;

  if (entryDateFrom || entryDateTo) {
    const dateFilter = {};
    if (entryDateFrom) dateFilter.gte = new Date(entryDateFrom);
    if (entryDateTo) dateFilter.lte = new Date(entryDateTo);
    filter.AND.push({ entryDate: dateFilter });
  }
  if (billingDateFrom || billingDateTo) {
    const dateFilter = {};
    if (billingDateFrom) dateFilter.gte = new Date(billingDateFrom);
    if (billingDateTo) dateFilter.lte = new Date(billingDateTo);
    filter.AND.push({ billingDate: dateFilter });
  }

  if (articleName) filter.AND.push({ articleName: { contains: articleName, mode: 'insensitive' } });
  if (companyName) filter.AND.push({ companyName: { contains: companyName, mode: 'insensitive' } });
  if (voucherOrBillNumber) filter.AND.push({ voucherOrBillNumber: { contains: voucherOrBillNumber, mode: 'insensitive' } });
  if (receiptNumber) filter.AND.push({ receiptNumber: { contains: receiptNumber, mode: 'insensitive' } });
  if (productDetails) filter.AND.push({ productDetails: { contains: productDetails, mode: 'insensitive' } });
  // Add other text fields as needed from the schema

  if (minCostRate || maxCostRate) {
    const costFilter = {};
    if (minCostRate) costFilter.gte = parseFloat(minCostRate);
    if (maxCostRate) costFilter.lte = parseFloat(maxCostRate);
    filter.AND.push({ costRate: costFilter });
  }

  // Removed quantity and storageLocation filters

   return filter.AND.length > (Object.keys(userFilter).length > 0 ? 1 : 0) ? filter : userFilter;
};


/**
 * Generate CSV string for different document types
 */
const generateCsvForDocumentType = (type, results) => {
  if (!results || results.length === 0) {
    return ''; // Return empty string if no results
  }

  let csvHeader = '';
  let csvRows = [];

  try {
      switch (type.toLowerCase()) {
        case 'invoice':
          csvHeader = 'ID,Company Name,Vendor Name,Purchase Date,Order/Serial Number,Total Amount,Products\n';
          csvRows = results.map(invoice => [
              invoice.id,
              escapeCsvField(invoice.companyName),
              escapeCsvField(invoice.vendorName),
              invoice.purchaseDate ? new Date(invoice.purchaseDate).toISOString().split('T')[0] : '',
              escapeCsvField(invoice.orderOrSerialNumber),
              invoice.totalAmount ?? '',
              escapeCsvField(invoice.products?.map(p => `${p.productName}(SN:${p.serialNumber ?? 'N/A'},Qty:${p.quantity})`).join('; ') ?? '')
            ].join(',')
          );
          break;

        case 'purchaseorder':
        case 'purchase-order':
           csvHeader = 'ID,Vendor Name,Order Date,Purchase Order Number,Total Amount,Items\n';
          csvRows = results.map(po => [
              po.id,
              escapeCsvField(po.vendorName),
              po.orderDate ? new Date(po.orderDate).toISOString().split('T')[0] : '',
              escapeCsvField(po.purchaseOrderNumber),
              po.totalAmount ?? '',
              escapeCsvField(po.items?.map(item => `${item.description}(Qty:${item.quantity})`).join('; ') ?? '')
            ].join(',')
          );
          break;

        case 'stockregister':
        case 'stock-register':
          csvHeader = 'ID,Article Name,Entry Date,Billing Date,Company Name,Voucher/Bill Number,Cost Rate,CGST,SGST,Total Rate,Receipt Number,Page Number\n';
          csvRows = results.map(sr => [
              sr.id,
              escapeCsvField(sr.articleName),
              sr.entryDate ? new Date(sr.entryDate).toISOString().split('T')[0] : '',
              sr.billingDate ? new Date(sr.billingDate).toISOString().split('T')[0] : '',
              escapeCsvField(sr.companyName),
              escapeCsvField(sr.voucherOrBillNumber),
              sr.costRate ?? '',
              sr.cgst ?? '',
              sr.sgst ?? '',
              sr.totalRate ?? '',
              escapeCsvField(sr.receiptNumber),
              sr.pageNumber ?? ''
            ].join(',')
          );
          break;

        default:
            console.error(`CSV generation failed: Unknown document type "${type}"`);
            return ''; // Return empty string or throw error for unknown type
    }
  } catch (error) {
      console.error(`Error during CSV generation for type ${type}:`, error);
      return 'Error generating CSV data'; // Provide error feedback in CSV content
  }


  return csvHeader + csvRows.join('\n');
};


// --- API Route Handlers ---

/**
 * Basic Search across specified document types (or all if type omitted).
 * WARNING: Searching 'all' fetches everything then filters - inefficient for large datasets.
 */
export const searchDocuments = async (req, res) => {
  const { query, type, page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  if (!query || query.trim() === '') {
    return res.status(400).json({ message: 'Search query parameter is required' });
  }

  // Filter by user unless admin
  const userFilter = req.user.role === 'ADMIN' ? {} : { userId: req.user.id };

  let results = [];
  let total = 0;
  let documentTypeLabel = type ? type.toLowerCase() : 'all';

  try {
    switch (documentTypeLabel) {
        case 'invoice':
        const invoiceWhere = { ...userFilter, OR: [
            { companyName: { contains: query, mode: 'insensitive' } },
            { vendorName: { contains: query, mode: 'insensitive' } },
            { orderOrSerialNumber: { contains: query, mode: 'insensitive' } },
            { additionalDetails: { contains: query, mode: 'insensitive' } },
            { products: { some: { productName: { contains: query, mode: 'insensitive' } } } }, // Search product names
            { products: { some: { serialNumber: { contains: query, mode: 'insensitive' } } } } // Search product serials
        ]};
        const [invoices, invoiceCount] = await prisma.$transaction([
            prisma.invoice.findMany({ where: invoiceWhere, include: { products: true, user: { select: { id: true, username: true } } }, orderBy: { createdAt: 'desc' }, skip, take: parseInt(limit) }),
            prisma.invoice.count({ where: invoiceWhere })
        ]);
        results = invoices.map(doc => ({ ...doc, documentType: 'invoice' }));
        total = invoiceCount;
        break;

        case 'purchaseorder':
        case 'purchase-order':
        const poWhere = { ...userFilter, OR: [
            { vendorName: { contains: query, mode: 'insensitive' } },
            { purchaseOrderNumber: { contains: query, mode: 'insensitive' } },
            { fromAddress: { contains: query, mode: 'insensitive' } },
            { items: { some: { description: { contains: query, mode: 'insensitive' } } } } // Search item descriptions
        ]};
         const [purchaseOrders, poCount] = await prisma.$transaction([
             prisma.purchaseOrder.findMany({ where: poWhere, include: { items: true, user: { select: { id: true, username: true } } }, orderBy: { createdAt: 'desc' }, skip, take: parseInt(limit) }),
             prisma.purchaseOrder.count({ where: poWhere })
         ]);
        results = purchaseOrders.map(doc => ({ ...doc, documentType: 'purchaseOrder' }));
        total = poCount;
        break;

      case 'stockregister':
      case 'stock-register':
        const srWhere = { ...userFilter, OR: [
            { articleName: { contains: query, mode: 'insensitive' } },
            { voucherOrBillNumber: { contains: query, mode: 'insensitive' } },
            { companyName: { contains: query, mode: 'insensitive' } },
            { productDetails: { contains: query, mode: 'insensitive' } },
            { receiptNumber: { contains: query, mode: 'insensitive' } }
        ]};
        const [stockRegisters, srCount] = await prisma.$transaction([
             prisma.stockRegister.findMany({ where: srWhere, include: { user: { select: { id: true, username: true } } }, orderBy: { createdAt: 'desc' }, skip, take: parseInt(limit) }),
             prisma.stockRegister.count({ where: srWhere })
         ]);
        results = stockRegisters.map(doc => ({ ...doc, documentType: 'stockRegister' }));
        total = srCount;
        break;

      case 'all':
        // INEFFICIENCY WARNING: Fetches all results then sorts/pages in memory.
        // Consider separate API calls or a dedicated search service for large scale 'all' search.
        console.warn("Executing 'search all' query - may be slow with large datasets.");
        const [invoicesAll, poAll, srAll] = await Promise.all([
             prisma.invoice.findMany({ where: { ...userFilter, OR: [ /* include OR conditions from above */ { companyName: { contains: query, mode: 'insensitive' } }, { vendorName: { contains: query, mode: 'insensitive' } }, {products: { some: { productName: { contains: query, mode: 'insensitive' } } }} ] }, include: { products: true, user: { select: { id: true, username: true } } } }),
             prisma.purchaseOrder.findMany({ where: { ...userFilter, OR: [ /* include OR conditions */ { vendorName: { contains: query, mode: 'insensitive' } }, {items: { some: { description: { contains: query, mode: 'insensitive' } } }} ] }, include: { items: true, user: { select: { id: true, username: true } } } }),
             prisma.stockRegister.findMany({ where: { ...userFilter, OR: [ /* include OR conditions */ { articleName: { contains: query, mode: 'insensitive' } }, { voucherOrBillNumber: { contains: query, mode: 'insensitive' } } ] }, include: { user: { select: { id: true, username: true } } } }),
        ]);
        const combinedResults = [
            ...invoicesAll.map(doc => ({ ...doc, documentType: 'invoice' })),
            ...poAll.map(doc => ({ ...doc, documentType: 'purchaseOrder' })),
            ...srAll.map(doc => ({ ...doc, documentType: 'stockRegister' }))
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Sort combined by date

        total = combinedResults.length;
        results = combinedResults.slice(skip, skip + parseInt(limit)); // Manual pagination
        break;

      default:
        return res.status(400).json({ message: 'Invalid search type specified. Use invoice, purchaseOrder, stockRegister, or omit for all.' });
    }

    res.json({
      results,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      totalResults: total,
      searchType: documentTypeLabel
    });

  } catch (error) {
    console.error(`Search Error (Type: ${documentTypeLabel}):`, error);
    res.status(500).json({ message: 'Server Error during search', error: error.message });
  }
};

/** Advanced search for invoices */
export const advancedInvoiceSearch = async (req, res) => {
   const { page = 1, limit = 10 } = req.query;
   const skip = (parseInt(page) - 1) * parseInt(limit);
   const userFilter = req.user.role === 'ADMIN' ? {} : { userId: req.user.id };

   try {
      const whereConditions = buildAdvancedInvoiceFilter(req.query, userFilter);
      const [invoices, total] = await prisma.$transaction([
            prisma.invoice.findMany({ where: whereConditions, include: { products: true, user: { select: { id: true, username: true } } }, orderBy: { createdAt: 'desc' }, skip, take: parseInt(limit) }),
            prisma.invoice.count({ where: whereConditions })
        ]);

        res.json({
            results: invoices,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            totalResults: total
        });
   } catch (error) {
        console.error('Advanced Invoice Search Error:', error);
        res.status(500).json({ message: 'Server Error during advanced invoice search', error: error.message });
   }
};

/** Advanced search for purchase orders */
export const advancedPurchaseOrderSearch = async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
   const skip = (parseInt(page) - 1) * parseInt(limit);
   const userFilter = req.user.role === 'ADMIN' ? {} : { userId: req.user.id };

    try {
        const whereConditions = buildAdvancedPurchaseOrderFilter(req.query, userFilter);
        const [purchaseOrders, total] = await prisma.$transaction([
            prisma.purchaseOrder.findMany({ where: whereConditions, include: { items: true, user: { select: { id: true, username: true } } }, orderBy: { createdAt: 'desc' }, skip, take: parseInt(limit) }),
            prisma.purchaseOrder.count({ where: whereConditions })
        ]);

         res.json({
            results: purchaseOrders,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            totalResults: total
        });
   } catch (error) {
        console.error('Advanced PO Search Error:', error);
        res.status(500).json({ message: 'Server Error during advanced purchase order search', error: error.message });
   }
};

/** Advanced search for stock register */
export const advancedStockRegisterSearch = async (req, res) => {
   const { page = 1, limit = 10, sortBy = 'entryDate', sortOrder = 'desc' } = req.query;
   const skip = (parseInt(page) - 1) * parseInt(limit);
   const userFilter = req.user.role === 'ADMIN' ? {} : { userId: req.user.id };

    // Build sorting
    const validSortOrders = ['asc', 'desc'];
    const orderByField = ['articleName', 'entryDate', 'billingDate', 'voucherOrBillNumber', 'costRate', 'totalRate', 'createdAt', 'updatedAt'].includes(sortBy) ? sortBy : 'createdAt';
    const orderDirection = validSortOrders.includes(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : 'desc';
    const orderBy = { [orderByField]: orderDirection };

    try {
       const whereConditions = buildAdvancedStockRegisterFilter(req.query, userFilter);
       const [stockRegisters, total] = await prisma.$transaction([
           prisma.stockRegister.findMany({ where: whereConditions, include: { user: { select: { id: true, username: true } } }, orderBy, skip, take: parseInt(limit) }),
           prisma.stockRegister.count({ where: whereConditions })
       ]);

         res.json({
            results: stockRegisters,
            totalPages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page),
            totalResults: total
        });
   } catch (error) {
        console.error('Advanced Stock Register Search Error:', error);
        res.status(500).json({ message: 'Server Error during advanced stock register search', error: error.message });
   }
};

/** Validate document ID uniqueness */
export const validateUniqueId = async (req, res) => {
  const { id, type } = req.body; // Changed 'documentType' to 'type' based on route file

  if (!id || !type) {
    return res.status(400).json({ message: 'ID and document type are required' });
  }

  let model;
  switch (type.toLowerCase()) {
      case 'invoice':           model = prisma.invoice; break;
      case 'purchaseorder':     /* falls through */
      case 'purchase-order':    model = prisma.purchaseOrder; break;
      case 'stockregister':     /* falls through */
      case 'stock-register':    model = prisma.stockRegister; break;
      default:                  return res.status(400).json({ message: 'Invalid document type for validation' });
  }

  try {
      const exists = await model.findUnique({ where: { id }, select: { id: true } }); // Only select ID for efficiency
      res.json({
        isUnique: !exists,
        message: exists ? `ID '${id}' already exists for type '${type}'` : `ID '${id}' is available for type '${type}'`
      });
  } catch (error) {
    console.error('ID Validation Error:', error);
    res.status(500).json({ message: 'Server Error validating ID', error: error.message });
  }
};

/** Export search results */
export const exportSearchResults = async (req, res) => {
   const { type, format = 'csv', ...searchParams } = req.query;

   if (!type) {
        return res.status(400).json({ message: 'Document type parameter (type) is required for export' });
    }

    const normalizedType = type.toLowerCase();
    const allowedTypes = ['invoice', 'purchaseorder', 'stockregister', 'purchase-order', 'stock-register'];
    if (!allowedTypes.includes(normalizedType)) {
        return res.status(400).json({ message: `Invalid document type '${type}'. Allowed types: invoice, purchaseOrder, stockRegister` });
    }

    const userFilter = req.user.role === 'ADMIN' ? {} : { userId: req.user.id };
    let results = [];

    try {
        // Fetch ALL matching results (no pagination)
        switch (normalizedType) {
          case 'invoice':
            const whereInv = buildAdvancedInvoiceFilter(searchParams, userFilter);
            results = await prisma.invoice.findMany({ where: whereInv, include: { products: true }, orderBy: { createdAt: 'desc' } });
            break;
          case 'purchaseorder':
          case 'purchase-order':
             const wherePO = buildAdvancedPurchaseOrderFilter(searchParams, userFilter);
             results = await prisma.purchaseOrder.findMany({ where: wherePO, include: { items: true }, orderBy: { createdAt: 'desc' } });
            break;
          case 'stockregister':
          case 'stock-register':
             const whereSR = buildAdvancedStockRegisterFilter(searchParams, userFilter);
              // Handle sorting for export consistency
              const sortBy = searchParams.sortBy || 'entryDate';
              const sortOrder = searchParams.sortOrder || 'desc';
              const orderByField = ['articleName', 'entryDate', 'billingDate', 'voucherOrBillNumber', 'costRate', 'totalRate', 'createdAt', 'updatedAt'].includes(sortBy) ? sortBy : 'createdAt';
              const orderDirection = ['asc', 'desc'].includes(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : 'desc';
              const orderBy = { [orderByField]: orderDirection };
             results = await prisma.stockRegister.findMany({ where: whereSR, orderBy });
            break;
        }

         // Generate CSV content if requested and results exist
        if (format.toLowerCase() === 'csv') {
             if (results.length === 0) {
                // Optionally return an empty CSV or a message
                res.setHeader('Content-Type', 'text/plain');
                return res.status(200).send("No matching records found to export.");
            }

            const csvData = generateCsvForDocumentType(normalizedType.replace('-',''), results); // Use simplified type for helper

            // Set headers for CSV download
            const timestamp = new Date().toISOString().split('T')[0];
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=${normalizedType}_export_${timestamp}.csv`);
            return res.status(200).send(csvData);
        } else {
            // Default to JSON response if format is not CSV or not specified
            return res.json({ count: results.length, results });
        }

    } catch (error) {
        console.error(`Export Error (Type: ${type}):`, error);
        res.status(500).json({ message: 'Server Error during export', error: error.message });
    }
};


// NOTE: Saved Search functions (saveSearch, getSavedSearches, etc.)
// should be imported from savedSearchController.js and handled by the corresponding routes
// They have been removed from this file to avoid duplication.