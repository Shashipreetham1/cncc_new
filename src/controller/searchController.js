import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Helper function to escape CSV fields
 */
const escapeCsvField = (field) => {
  if (field === null || field === undefined) {
    return '';
  }
  
  const stringField = String(field);
  
  // If the field contains commas, quotes, or newlines, wrap it in quotes
  if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
    // Double up any quotes within the field
    return `"${stringField.replace(/"/g, '""')}"`;
  }
  
  return stringField;
};

/**
 * Helper function to build invoice filter for advanced search
 */
const buildAdvancedInvoiceFilter = (params, userFilter = {}) => {
  const filter = { AND: [] };
  
  // Add user filter
  if (Object.keys(userFilter).length > 0) {
    filter.AND.push(userFilter);
  }
  
  // Add search parameters
  const {
    dateFrom,
    dateTo,
    companyName,
    vendorName,
    orderOrSerialNumber,
    productName,
    productSerialNumber,
    minAmount,
    maxAmount
  } = params;
  
  // Date range filter
  if (dateFrom || dateTo) {
    const dateFilter = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo);
    filter.AND.push({ purchaseDate: dateFilter });
  }
  
  // Text filters
  if (companyName) filter.AND.push({ companyName: { contains: companyName, mode: 'insensitive' } });
  if (vendorName) filter.AND.push({ vendorName: { contains: vendorName, mode: 'insensitive' } });
  if (orderOrSerialNumber) filter.AND.push({ orderOrSerialNumber: { contains: orderOrSerialNumber, mode: 'insensitive' } });
  
  // Amount range filter
  if (minAmount || maxAmount) {
    const amountFilter = {};
    if (minAmount) amountFilter.gte = parseFloat(minAmount);
    if (maxAmount) amountFilter.lte = parseFloat(maxAmount);
    filter.AND.push({ totalAmount: amountFilter });
  }
  
  // Product filters
  if (productName || productSerialNumber) {
    const productFilter = { some: { OR: [] } };
    
    if (productName) {
      productFilter.some.OR.push({ productName: { contains: productName, mode: 'insensitive' } });
    }
    
    if (productSerialNumber) {
      productFilter.some.OR.push({ serialNumber: { contains: productSerialNumber, mode: 'insensitive' } });
    }
    
    filter.AND.push({ products: productFilter });
  }
  
  // If no filters were added, return empty object
  if (filter.AND.length === 0) {
    return {};
  }
  
  return filter;
};

/**
 * Helper function to build purchase order filter for advanced search
 */
const buildAdvancedPurchaseOrderFilter = (params, userFilter = {}) => {
  const filter = { AND: [] };
  
  // Add user filter
  if (Object.keys(userFilter).length > 0) {
    filter.AND.push(userFilter);
  }
  
  // Add search parameters
  const {
    dateFrom,
    dateTo,
    vendorName,
    purchaseOrderNumber,
    itemDescription,
    minAmount,
    maxAmount
  } = params;
  
  // Date range filter
  if (dateFrom || dateTo) {
    const dateFilter = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo);
    filter.AND.push({ orderDate: dateFilter });
  }
  
  // Text filters
  if (vendorName) filter.AND.push({ vendorName: { contains: vendorName, mode: 'insensitive' } });
  if (purchaseOrderNumber) filter.AND.push({ purchaseOrderNumber: { contains: purchaseOrderNumber, mode: 'insensitive' } });
  
  // Amount range filter
  if (minAmount || maxAmount) {
    const amountFilter = {};
    if (minAmount) amountFilter.gte = parseFloat(minAmount);
    if (maxAmount) amountFilter.lte = parseFloat(maxAmount);
    filter.AND.push({ totalAmount: amountFilter });
  }
  
  // Item description filter
  if (itemDescription) {
    filter.AND.push({
      items: {
        some: {
          description: { contains: itemDescription, mode: 'insensitive' }
        }
      }
    });
  }
  
  // If no filters were added, return empty object
  if (filter.AND.length === 0) {
    return {};
  }
  
  return filter;
};

/**
 * Helper function to build stock register filter for advanced search
 */
const buildAdvancedStockRegisterFilter = (params, userFilter = {}) => {
  const filter = { AND: [] };
  
  // Add user filter
  if (Object.keys(userFilter).length > 0) {
    filter.AND.push(userFilter);
  }
  
  // Add search parameters
  const {
    entryDateFrom,
    entryDateTo,
    billingDateFrom,
    billingDateTo,
    articleName,
    companyName,
    voucherOrBillNumber,
    receiptNumber,
    minCostRate,
    maxCostRate,
    quantity,
    storageLocation,
    productDetails
  } = params;
  
  // Entry date range filter
  if (entryDateFrom || entryDateTo) {
    const dateFilter = {};
    if (entryDateFrom) dateFilter.gte = new Date(entryDateFrom);
    if (entryDateTo) dateFilter.lte = new Date(entryDateTo);
    filter.AND.push({ entryDate: dateFilter });
  }
  
  // Billing date range filter
  if (billingDateFrom || billingDateTo) {
    const dateFilter = {};
    if (billingDateFrom) dateFilter.gte = new Date(billingDateFrom);
    if (billingDateTo) dateFilter.lte = new Date(billingDateTo);
    filter.AND.push({ billingDate: dateFilter });
  }
  
  // Text filters
  if (articleName) filter.AND.push({ articleName: { contains: articleName, mode: 'insensitive' } });
  if (companyName) filter.AND.push({ companyName: { contains: companyName, mode: 'insensitive' } });
  if (voucherOrBillNumber) filter.AND.push({ voucherOrBillNumber: { contains: voucherOrBillNumber, mode: 'insensitive' } });
  if (receiptNumber) filter.AND.push({ receiptNumber: { contains: receiptNumber, mode: 'insensitive' } });
  if (productDetails) filter.AND.push({ productDetails: { contains: productDetails, mode: 'insensitive' } });
  if (storageLocation) filter.AND.push({ storageLocation: { contains: storageLocation, mode: 'insensitive' } });
  
  // Cost rate range filter
  if (minCostRate || maxCostRate) {
    const costFilter = {};
    if (minCostRate) costFilter.gte = parseFloat(minCostRate);
    if (maxCostRate) costFilter.lte = parseFloat(maxCostRate);
    filter.AND.push({ costRate: costFilter });
  }
  
  // Quantity filter
  if (quantity) {
    filter.AND.push({ quantity: parseInt(quantity) });
  }
  
  // If no filters were added, return empty object
  if (filter.AND.length === 0) {
    return {};
  }
  
  return filter;
};

/**
 * Helper function to generate CSV for different document types
 */
const generateCsvForDocumentType = (type, results) => {
  // CSV header row based on document type
  let csvHeader = '';
  let csvRows = [];
  
  switch (type.toLowerCase()) {
    case 'invoice':
      csvHeader = 'ID,Company Name,Vendor Name,Purchase Date,Total Amount,Order/Serial Number,Products\n';
      
      csvRows = results.map(invoice => {
        const productsString = invoice.products
          .map(p => `${p.productName} (${p.serialNumber})`)
          .join('; ');
          
        return [
          invoice.id,
          escapeCsvField(invoice.companyName),
          escapeCsvField(invoice.vendorName),
          invoice.purchaseDate ? new Date(invoice.purchaseDate).toISOString().split('T')[0] : '',
          invoice.totalAmount,
          escapeCsvField(invoice.orderOrSerialNumber || ''),
          escapeCsvField(productsString)
        ].join(',');
      });
      break;
      
    case 'purchaseorder':
    case 'purchase-order':
      csvHeader = 'ID,Vendor Name,Order Date,Purchase Order Number,Total Amount,Items\n';
      
      csvRows = results.map(po => {
        const itemsString = po.items
          .map(item => `${item.description} (Qty: ${item.quantity})`)
          .join('; ');
          
        return [
          po.id,
          escapeCsvField(po.vendorName),
          po.orderDate ? new Date(po.orderDate).toISOString().split('T')[0] : '',
          escapeCsvField(po.purchaseOrderNumber || ''),
          po.totalAmount,
          escapeCsvField(itemsString)
        ].join(',');
      });
      break;
      
    case 'stockregister':
    case 'stock-register':
      csvHeader = 'ID,Article Name,Company Name,Entry Date,Billing Date,Voucher/Bill Number,Receipt Number,Cost Rate,Quantity,Storage Location\n';
      
      csvRows = results.map(sr => {
        return [
          sr.id,
          escapeCsvField(sr.articleName),
          escapeCsvField(sr.companyName),
          sr.entryDate ? new Date(sr.entryDate).toISOString().split('T')[0] : '',
          sr.billingDate ? new Date(sr.billingDate).toISOString().split('T')[0] : '',
          escapeCsvField(sr.voucherOrBillNumber || ''),
          escapeCsvField(sr.receiptNumber || ''),
          sr.costRate,
          sr.quantity,
          escapeCsvField(sr.storageLocation || '')
        ].join(',');
      });
      break;
  }
  
  return csvHeader + csvRows.join('\n');
};

/**
 * Search across invoices, purchase orders, and stock register entries
 */
export const searchDocuments = async (req, res) => {
  try {
    const { query, type, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    if (!query || query.trim() === '') {
      return res.status(400).json({ message: 'Search query is required' });
    }
    
    // Filter by user role (admin can see all, users can see only their own)
    const userFilter = req.user.role === 'ADMIN' ? {} : { userId: req.user.id };
    
    // Initialize results
    let results = [];
    let total = 0;
    
    // Search based on document type
    switch (type?.toLowerCase()) {
      case 'invoice':
        // Search invoices
        const invoices = await prisma.invoice.findMany({
          where: {
            ...userFilter,
            OR: [
              { companyName: { contains: query, mode: 'insensitive' } },
              { vendorName: { contains: query, mode: 'insensitive' } },
              { orderOrSerialNumber: { contains: query, mode: 'insensitive' } },
              { additionalDetails: { contains: query, mode: 'insensitive' } },
              { address: { contains: query, mode: 'insensitive' } }
            ]
          },
          include: {
            products: true,
            user: {
              select: { id: true, username: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit)
        });
        
        total = await prisma.invoice.count({
          where: {
            ...userFilter,
            OR: [
              { companyName: { contains: query, mode: 'insensitive' } },
              { vendorName: { contains: query, mode: 'insensitive' } },
              { orderOrSerialNumber: { contains: query, mode: 'insensitive' } },
              { additionalDetails: { contains: query, mode: 'insensitive' } },
              { address: { contains: query, mode: 'insensitive' } }
            ]
          }
        });
        
        results = invoices.map(invoice => ({
          ...invoice,
          documentType: 'invoice'
        }));
        break;
        
      case 'purchaseorder':
      case 'purchase-order':
        // Search purchase orders
        const purchaseOrders = await prisma.purchaseOrder.findMany({
          where: {
            ...userFilter,
            OR: [
              { vendorName: { contains: query, mode: 'insensitive' } },
              { purchaseOrderNumber: { contains: query, mode: 'insensitive' } },
              { fromAddress: { contains: query, mode: 'insensitive' } }
            ]
          },
          include: {
            items: true,
            user: {
              select: { id: true, username: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit)
        });
        
        total = await prisma.purchaseOrder.count({
          where: {
            ...userFilter,
            OR: [
              { vendorName: { contains: query, mode: 'insensitive' } },
              { purchaseOrderNumber: { contains: query, mode: 'insensitive' } },
              { fromAddress: { contains: query, mode: 'insensitive' } }
            ]
          }
        });
        
        results = purchaseOrders.map(po => ({
          ...po,
          documentType: 'purchaseOrder'
        }));
        break;
        
      case 'stockregister':
      case 'stock-register':
        // Search stock register entries
        const stockRegisters = await prisma.stockRegister.findMany({
          where: {
            ...userFilter,
            OR: [
              { articleName: { contains: query, mode: 'insensitive' } },
              { voucherOrBillNumber: { contains: query, mode: 'insensitive' } },
              { companyName: { contains: query, mode: 'insensitive' } },
              { productDetails: { contains: query, mode: 'insensitive' } },
              { receiptNumber: { contains: query, mode: 'insensitive' } }
            ]
          },
          include: {
            user: {
              select: { id: true, username: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit)
        });
        
        total = await prisma.stockRegister.count({
          where: {
            ...userFilter,
            OR: [
              { articleName: { contains: query, mode: 'insensitive' } },
              { voucherOrBillNumber: { contains: query, mode: 'insensitive' } },
              { companyName: { contains: query, mode: 'insensitive' } },
              { productDetails: { contains: query, mode: 'insensitive' } },
              { receiptNumber: { contains: query, mode: 'insensitive' } }
            ]
          }
        });
        
        results = stockRegisters.map(sr => ({
          ...sr,
          documentType: 'stockRegister'
        }));
        break;
        
      default:
        // Search across all document types if no specific type is provided
        const [invoicesAll, purchaseOrdersAll, stockRegistersAll] = await Promise.all([
          // Search invoices
          prisma.invoice.findMany({
            where: {
              ...userFilter,
              OR: [
                { companyName: { contains: query, mode: 'insensitive' } },
                { vendorName: { contains: query, mode: 'insensitive' } },
                { orderOrSerialNumber: { contains: query, mode: 'insensitive' } },
                { additionalDetails: { contains: query, mode: 'insensitive' } },
                { address: { contains: query, mode: 'insensitive' } }
              ]
            },
            include: {
              products: true,
              user: {
                select: { id: true, username: true }
              }
            },
            orderBy: { createdAt: 'desc' }
          }),
          
          // Search purchase orders
          prisma.purchaseOrder.findMany({
            where: {
              ...userFilter,
              OR: [
                { vendorName: { contains: query, mode: 'insensitive' } },
                { purchaseOrderNumber: { contains: query, mode: 'insensitive' } },
                { fromAddress: { contains: query, mode: 'insensitive' } }
              ]
            },
            include: {
              items: true,
              user: {
                select: { id: true, username: true }
              }
            },
            orderBy: { createdAt: 'desc' }
          }),
          
          // Search stock register entries
          prisma.stockRegister.findMany({
            where: {
              ...userFilter,
              OR: [
                { articleName: { contains: query, mode: 'insensitive' } },
                { voucherOrBillNumber: { contains: query, mode: 'insensitive' } },
                { companyName: { contains: query, mode: 'insensitive' } },
                { productDetails: { contains: query, mode: 'insensitive' } },
                { receiptNumber: { contains: query, mode: 'insensitive' } }
              ]
            },
            include: {
              user: {
                select: { id: true, username: true }
              }
            },
            orderBy: { createdAt: 'desc' }
          })
        ]);
        
        // Combine results with document type indicator
        const allResults = [
          ...invoicesAll.map(invoice => ({ ...invoice, documentType: 'invoice' })),
          ...purchaseOrdersAll.map(po => ({ ...po, documentType: 'purchaseOrder' })),
          ...stockRegistersAll.map(sr => ({ ...sr, documentType: 'stockRegister' }))
        ];
        
        // Sort by created date (most recent first)
        allResults.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        // Apply manual pagination
        total = allResults.length;
        results = allResults.slice(skip, skip + parseInt(limit));
        
        break;
    }
    
    res.json({
      results,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/**
 * Advanced search for invoices with multiple criteria
 */
export const advancedInvoiceSearch = async (req, res) => {
  try {
    const {
      dateFrom,
      dateTo,
      companyName,
      vendorName,
      orderOrSerialNumber,
      productName,
      productSerialNumber,
      minAmount,
      maxAmount,
      page = 1,
      limit = 10
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Filter by user role (admin can see all, users can see only their own)
    const userFilter = req.user.role === 'ADMIN' ? {} : { userId: req.user.id };
    
    // Build filter using helper function
    const whereConditions = buildAdvancedInvoiceFilter(req.query, userFilter);
    
    // Execute search query
    const invoices = await prisma.invoice.findMany({
      where: whereConditions,
      include: {
        products: true,
        user: {
          select: { id: true, username: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit)
    });
    
    // Get total count for pagination
    const total = await prisma.invoice.count({ where: whereConditions });
    
    res.json({
      results: invoices,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Advanced invoice search error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/**
 * Advanced search for purchase orders with multiple criteria
 */
export const advancedPurchaseOrderSearch = async (req, res) => {
  try {
    const {
      dateFrom,
      dateTo,
      vendorName,
      purchaseOrderNumber,
      itemDescription,
      minAmount,
      maxAmount,
      page = 1,
      limit = 10
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Filter by user role (admin can see all, users can see only their own)
    const userFilter = req.user.role === 'ADMIN' ? {} : { userId: req.user.id };
    
    // Build filter using helper function
    const whereConditions = buildAdvancedPurchaseOrderFilter(req.query, userFilter);
    
    // Execute search query
    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: whereConditions,
      include: {
        items: true,
        user: {
          select: { id: true, username: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit)
    });
    
    // Get total count for pagination
    const total = await prisma.purchaseOrder.count({ where: whereConditions });
    
    res.json({
      results: purchaseOrders,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Advanced purchase order search error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/**
 * Advanced search for stock register entries with multiple criteria
 */
export const advancedStockRegisterSearch = async (req, res) => {
  try {
    const {
      entryDateFrom,
      entryDateTo,
      billingDateFrom,
      billingDateTo,
      articleName,
      companyName,
      voucherOrBillNumber,
      receiptNumber,
      minCostRate,
      maxCostRate,
      quantity,
      storageLocation,
      productDetails,
      sortBy = 'entryDate',
      sortOrder = 'desc',
      page = 1,
      limit = 10
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Filter by user role (admin can see all, users can see only their own)
    const userFilter = req.user.role === 'ADMIN' ? {} : { userId: req.user.id };
    
    // Build filter using helper function
    const whereConditions = buildAdvancedStockRegisterFilter(req.query, userFilter);
    
    // Handle sorting
    const orderBy = {};
    orderBy[sortBy] = sortOrder.toLowerCase();
    
    // Execute search query
    const stockRegisters = await prisma.stockRegister.findMany({
      where: whereConditions,
      include: {
        user: {
          select: { id: true, username: true }
        }
      },
      orderBy,
      skip,
      take: parseInt(limit)
    });
    
    // Get total count for pagination
    const total = await prisma.stockRegister.count({ where: whereConditions });
    
    res.json({
      results: stockRegisters,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Advanced stock register search error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/**
 * Validate document ID to ensure uniqueness before creation
 */
export const validateUniqueId = async (req, res) => {
  try {
    const { id, type } = req.body;
    
    if (!id || !type) {
      return res.status(400).json({ message: 'ID and document type are required' });
    }
    
    let exists = false;
    
    switch (type.toLowerCase()) {
      case 'invoice':
        exists = await prisma.invoice.findUnique({ where: { id } });
        break;
      case 'purchaseorder':
      case 'purchase-order':
        exists = await prisma.purchaseOrder.findUnique({ where: { id } });
        break;
      case 'stockregister':
      case 'stock-register':
        exists = await prisma.stockRegister.findUnique({ where: { id } });
        break;
      default:
        return res.status(400).json({ message: 'Invalid document type' });
    }
    
    res.json({ 
      isUnique: !exists,
      message: exists ? 'ID already exists' : 'ID is available'
    });
  } catch (error) {
    console.error('ID validation error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/**
 * Export search results to CSV
 */
export const exportSearchResults = async (req, res) => {
  try {
    const { type, format = 'csv', ...searchParams } = req.query;
    
    if (!type || !['invoice', 'purchaseorder', 'stockregister'].includes(type.toLowerCase())) {
      return res.status(400).json({ message: 'Valid document type is required (invoice, purchaseorder, stockregister)' });
    }
    
    // Filter by user role (admin can see all, users can see only their own)
    const userFilter = req.user.role === 'ADMIN' ? {} : { userId: req.user.id };
    let results = [];
    
    // Get all results without pagination
    switch (type.toLowerCase()) {
      case 'invoice':
        // Build filter using helper function
        const whereConditionsInvoice = buildAdvancedInvoiceFilter(searchParams, userFilter);
        
        const invoices = await prisma.invoice.findMany({
          where: whereConditionsInvoice,
          include: {
            products: true,
            user: {
              select: { id: true, username: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        });
        
        results = invoices;
        break;
        
      case 'purchaseorder':
        // Build filter using helper function
        const whereConditionsPO = buildAdvancedPurchaseOrderFilter(searchParams, userFilter);
        
        const purchaseOrders = await prisma.purchaseOrder.findMany({
          where: whereConditionsPO,
          include: {
            items: true,
            user: {
              select: { id: true, username: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        });
        
        results = purchaseOrders;
        break;
        
      case 'stockregister':
        // Build filter using helper function
        const whereConditionsSR = buildAdvancedStockRegisterFilter(searchParams, userFilter);
        
        const sortBy = searchParams.sortBy || 'entryDate';
        const sortOrder = searchParams.sortOrder || 'desc';
        const orderBy = {};
        orderBy[sortBy] = sortOrder.toLowerCase();
        
        const stockRegisters = await prisma.stockRegister.findMany({
          where: whereConditionsSR,
          include: {
            user: {
              select: { id: true, username: true }
            }
          },
          orderBy
        });
        
        results = stockRegisters;
        break;
    }
    
    // Generate CSV content
    if (format.toLowerCase() === 'csv' && results.length > 0) {
      const csv = generateCsvForDocumentType(type, results);
      
      // Set headers for CSV download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${type}_export_${new Date().toISOString().split('T')[0]}.csv`);
      
      // Send CSV response
      return res.send(csv);
    }
    
    // Default response if not generating CSV
    res.json({ results });
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/**
 * Save a search query for later use
 */
export const saveSearch = async (req, res) => {
  try {
    const { name, searchType, searchParams } = req.body;
    const userId = req.user.id;
    
    if (!name || !searchType || !searchParams) {
      return res.status(400).json({ message: 'Name, search type, and search parameters are required' });
    }
    
    // Create the saved search
    const savedSearch = await prisma.savedSearch.create({
      data: {
        name,
        searchType,
        searchParams,
        userId
      }
    });
    
    res.status(201).json(savedSearch);
  } catch (error) {
    console.error('Save search error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/**
 * Get all saved searches for the current user
 */
export const getSavedSearches = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const savedSearches = await prisma.savedSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(savedSearches);
  } catch (error) {
    console.error('Get saved searches error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/**
 * Get a specific saved search by ID
 */
export const getSavedSearchById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const savedSearch = await prisma.savedSearch.findFirst({
      where: {
        id,
        userId
      }
    });
    
    if (!savedSearch) {
      return res.status(404).json({ message: 'Saved search not found' });
    }
    
    res.json(savedSearch);
  } catch (error) {
    console.error('Get saved search error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/**
 * Update a saved search
 */
export const updateSavedSearch = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, searchType, searchParams } = req.body;
    const userId = req.user.id;
    
    // Check if the saved search exists and belongs to the user
    const existingSavedSearch = await prisma.savedSearch.findFirst({
      where: {
        id,
        userId
      }
    });
    
    if (!existingSavedSearch) {
      return res.status(404).json({ message: 'Saved search not found or you do not have permission' });
    }
    
    // Update the saved search
    const updatedSavedSearch = await prisma.savedSearch.update({
      where: { id },
      data: {
        name,
        searchType,
        searchParams
      }
    });
    
    res.json(updatedSavedSearch);
  } catch (error) {
    console.error('Update saved search error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/**
 * Delete a saved search
 */
export const deleteSavedSearch = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Check if the saved search exists and belongs to the user
    const existingSavedSearch = await prisma.savedSearch.findFirst({
      where: {
        id,
        userId
      }
    });
    
    if (!existingSavedSearch) {
      return res.status(404).json({ message: 'Saved search not found or you do not have permission' });
    }
    
    // Delete the saved search
    await prisma.savedSearch.delete({
      where: { id }
    });
    
    res.json({ message: 'Saved search deleted successfully' });
  } catch (error) {
    console.error('Delete saved search error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};