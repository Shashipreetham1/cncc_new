import { PrismaClient, DocumentType } from '@prisma/client'; // Use Enum

const prisma = new PrismaClient();

/**
 * Save a search query for the current user
 */
export const saveSearch = async (req, res) => {
  const { name, documentType, searchParams } = req.body;
  const userId = req.user.id; // From auth middleware

  // Validations
  if (!name || !documentType || !searchParams) {
    return res.status(400).json({ message: 'Search name, document type, and search parameters (searchParams) are required' });
  }
  if (typeof searchParams !== 'object' || searchParams === null) {
       return res.status(400).json({ message: 'Search parameters (searchParams) must be a valid JSON object' });
  }
  // Validate document type against Enum
   if (!Object.values(DocumentType).includes(documentType)) {
       return res.status(400).json({ message: `Invalid document type. Must be one of: ${Object.values(DocumentType).join(', ')}` });
   }


  try {
    // Check if user already has a saved search with the same name (optional, depends on requirements)
     const existingSearch = await prisma.savedSearch.findFirst({
        where: { name: name, userId: userId }
     });
     if (existingSearch) {
        // Option 1: Disallow duplicate names
        // return res.status(400).json({ message: `A saved search named '${name}' already exists. Please choose a unique name.` });
        // Option 2: Allow duplicate names (proceed)
     }


    // Create saved search
    const newSavedSearch = await prisma.savedSearch.create({
      data: {
        name,
        documentType, // Should match the Enum type (e.g., "INVOICE")
        searchParams, // Prisma handles JSON storage
        userId
      },
      include: { user: { select: { id: true, username: true }}} // Include user info if needed
    });

    res.status(201).json({
      message: 'Search saved successfully',
      savedSearch: newSavedSearch
    });

  } catch (error) {
    console.error('Save Search Error:', error);
    if (error.code === 'P2003') { // Foreign key constraint fails (e.g., invalid userId - unlikely if auth works)
         return res.status(400).json({ message: 'Failed to associate saved search with user.' });
    }
    res.status(500).json({ message: 'Server Error saving search', error: error.message });
  }
};

/**
 * Get all saved searches for the current user.
 * Can optionally filter by document type.
 */
export const getUserSavedSearches = async (req, res) => {
   const { documentType } = req.query;
   const userId = req.user.id;

   const whereClause = { userId };

   // Add document type filter if provided and valid
    if (documentType) {
         if (!Object.values(DocumentType).includes(documentType.toUpperCase())) {
            return res.status(400).json({ message: `Invalid document type filter. Must be one of: ${Object.values(DocumentType).join(', ')}` });
        }
        whereClause.documentType = documentType.toUpperCase();
    }

  try {
    const savedSearches = await prisma.savedSearch.findMany({
      where: whereClause,
      orderBy: { // Order by name or date
        name: 'asc' // Example: Order alphabetically
        // updatedAt: 'desc'
      }
    });

    // Optional: Format for dropdown if needed, or return raw data
    // const formattedSearches = savedSearches.map(search => ({
    //   id: search.id,
    //   label: search.name, // For dropdown label
    //   value: search.id, // For dropdown value
    //   documentType: search.documentType,
    //   searchParams: search.searchParams
    // }));

    res.json({
       savedSearches: savedSearches, // Return the full search objects
       count: savedSearches.length
    });

  } catch (error) {
    console.error('Get User Saved Searches Error:', error);
    res.status(500).json({ message: 'Server Error retrieving saved searches', error: error.message });
  }
};

/**
 * Get a specific saved search by ID.
 */
export const getSavedSearchById = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id; // Ensure user can only get their own searches

  try {
    const savedSearch = await prisma.savedSearch.findUnique({
      where: {
        id: id
      }
      // Optionally include user if needed, but ID is sufficient for ownership check
      // include: { user: { select: { id: true, username: true }}}
    });

    // Check if search exists
    if (!savedSearch) {
      return res.status(404).json({ message: 'Saved search not found' });
    }

    // Verify ownership (Admins potentially bypass, depending on reqs)
    if (savedSearch.userId !== userId && req.user.role !== 'ADMIN') { // Allow admin to see any? Check reqs. Let's restrict to owner.
        return res.status(403).json({ message: 'Not authorized to access this saved search' });
    }
    // if (savedSearch.userId !== userId) {
    //    return res.status(403).json({ message: 'Not authorized to access this saved search' });
    // }


    res.json(savedSearch);

  } catch (error) {
    console.error('Get Saved Search By ID Error:', error);
    res.status(500).json({ message: 'Server Error retrieving saved search', error: error.message });
  }
};

/**
 * Update a saved search. User must be owner.
 */
export const updateSavedSearch = async (req, res) => {
   const { id } = req.params;
   const { name, documentType, searchParams } = req.body; // Fields allowed to update
   const userId = req.user.id;

   // Basic validation on payload
   if (!name && !documentType && !searchParams) {
       return res.status(400).json({ message: 'No fields provided for update (name, documentType, searchParams).' });
   }
   if (documentType && !Object.values(DocumentType).includes(documentType)) {
      return res.status(400).json({ message: `Invalid document type. Must be one of: ${Object.values(DocumentType).join(', ')}` });
   }
    if (searchParams && (typeof searchParams !== 'object' || searchParams === null)) {
       return res.status(400).json({ message: 'Search parameters (searchParams) must be a valid JSON object' });
   }


  try {
    // Find the search and verify ownership first
    const savedSearch = await prisma.savedSearch.findUnique({
        where: { id: id }
    });

    if (!savedSearch) {
        return res.status(404).json({ message: 'Saved search not found' });
    }

    if (savedSearch.userId !== userId) {
        // No admin override typically needed for user's saved searches
        return res.status(403).json({ message: 'Not authorized to update this saved search' });
    }


     // Check for duplicate name if updating name (optional check, depends on requirements)
     if (name && name !== savedSearch.name) {
         const existingSearchWithNewName = await prisma.savedSearch.findFirst({
            where: { name: name, userId: userId, id: { not: id } } // Exclude current record
         });
         if (existingSearchWithNewName) {
            // Option 1: Disallow duplicate names
            // return res.status(400).json({ message: `A saved search named '${name}' already exists. Please choose a unique name.` });
         }
     }

    // Update the saved search with provided fields
    const updatedSearch = await prisma.savedSearch.update({
      where: {
        id: id // Primary key for update
        // Ensure ownership again just in case (can be omitted if initial check is sufficient)
        // AND: { userId: userId } - Prisma doesn't directly support AND in where unique update, check above is needed
      },
      data: {
        // Update fields only if they are provided in the request body
        ...(name && { name }),
        ...(documentType && { documentType }),
        ...(searchParams && { searchParams }),
      }
    });

    res.json({
      message: 'Saved search updated successfully',
      savedSearch: updatedSearch
    });

  } catch (error) {
    console.error('Update Saved Search Error:', error);
     if (error.code === 'P2025') { // Record to update not found (should be caught earlier)
         return res.status(404).json({ message: 'Saved search not found.' });
     }
    res.status(500).json({ message: 'Server Error updating saved search', error: error.message });
  }
};

/**
 * Delete a saved search. User must be owner.
 */
export const deleteSavedSearch = async (req, res) => {
   const { id } = req.params;
   const userId = req.user.id;

  try {
      // Find the search and verify ownership first
      const savedSearch = await prisma.savedSearch.findUnique({
          where: { id: id }
      });

      if (!savedSearch) {
          return res.status(404).json({ message: 'Saved search not found' });
      }

      if (savedSearch.userId !== userId) {
          return res.status(403).json({ message: 'Not authorized to delete this saved search' });
      }


    // Delete the saved search
    await prisma.savedSearch.delete({
      where: {
        id: id
        // No need for userId here as primary key 'id' is unique
      }
    });

    res.status(200).json({ message: 'Saved search deleted successfully' });

  } catch (error) {
    console.error('Delete Saved Search Error:', error);
    if (error.code === 'P2025') { // Record to delete not found
         return res.status(404).json({ message: 'Saved search not found.' });
     }
    res.status(500).json({ message: 'Server Error deleting saved search', error: error.message });
  }
};