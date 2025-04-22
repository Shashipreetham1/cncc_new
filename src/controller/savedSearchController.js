import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Save a search query for a user
 */
export const saveSearch = async (req, res) => {
  try {
    const { name, documentType, searchParams } = req.body;
    
    if (!name || !documentType || !searchParams) {
      return res.status(400).json({ 
        message: 'Search name, document type, and search parameters are required' 
      });
    }
    
    // Validate document type
    const validDocumentTypes = ['INVOICE', 'PURCHASE_ORDER', 'STOCK_REGISTER'];
    if (!validDocumentTypes.includes(documentType)) {
      return res.status(400).json({ 
        message: 'Invalid document type. Must be one of: ' + validDocumentTypes.join(', ') 
      });
    }
    
    // Create saved search
    const savedSearch = await prisma.savedSearch.create({
      data: {
        name,
        documentType,
        searchParams,
        userId: req.user.id
      }
    });
    
    res.status(201).json({
      message: 'Search saved successfully',
      savedSearch
    });
  } catch (error) {
    console.error('Save search error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

/**
 * Get all saved searches for current user
 * Can be filtered by document type to populate the dropdown
 */
export const getUserSavedSearches = async (req, res) => {
  try {
    const { documentType } = req.query;
    
    // Build the where clause
    const whereClause = {
      userId: req.user.id
    };
    
    // Add document type filter if provided
    if (documentType) {
      whereClause.documentType = documentType;
    }
    
    const savedSearches = await prisma.savedSearch.findMany({
      where: whereClause,
      orderBy: {
        updatedAt: 'desc'
      }
    });
    
    // Format the response for easy dropdown implementation
    const formattedSearches = savedSearches.map(search => ({
      id: search.id,
      label: search.name,
      value: search.id,
      documentType: search.documentType,
      searchParams: search.searchParams
    }));
    
    res.json({
      savedSearches: formattedSearches,
      count: formattedSearches.length
    });
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
    
    const savedSearch = await prisma.savedSearch.findUnique({
      where: {
        id
      }
    });
    
    // Check if search exists
    if (!savedSearch) {
      return res.status(404).json({ message: 'Saved search not found' });
    }
    
    // Check if user has permission
    if (savedSearch.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Not authorized to access this saved search' });
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
    const { name, documentType, searchParams } = req.body;
    
    // Find saved search
    const savedSearch = await prisma.savedSearch.findUnique({
      where: {
        id
      }
    });
    
    // Check if search exists
    if (!savedSearch) {
      return res.status(404).json({ message: 'Saved search not found' });
    }
    
    // Check if user has permission
    if (savedSearch.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Not authorized to update this saved search' });
    }
    
    // Update the saved search
    const updatedSearch = await prisma.savedSearch.update({
      where: {
        id
      },
      data: {
        name: name || savedSearch.name,
        documentType: documentType || savedSearch.documentType,
        searchParams: searchParams || savedSearch.searchParams
      }
    });
    
    res.json({
      message: 'Saved search updated successfully',
      savedSearch: updatedSearch
    });
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
    
    // Find saved search
    const savedSearch = await prisma.savedSearch.findUnique({
      where: {
        id
      }
    });
    
    // Check if search exists
    if (!savedSearch) {
      return res.status(404).json({ message: 'Saved search not found' });
    }
    
    // Check if user has permission
    if (savedSearch.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Not authorized to delete this saved search' });
    }
    
    // Delete the saved search
    await prisma.savedSearch.delete({
      where: {
        id
      }
    });
    
    res.json({ message: 'Saved search deleted successfully' });
  } catch (error) {
    console.error('Delete saved search error:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};