import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the base uploads directory relative to the project root
const BASE_UPLOADS_PATH = path.resolve(__dirname, '..', '..', 'uploads');

// Helper function to parse file size string (e.g., "5mb") into bytes
const parseFileSize = (sizeString) => {
    if (!sizeString) return 5 * 1024 * 1024; // Default 5MB if not set

    const size = parseFloat(sizeString);
    const unit = sizeString.toLowerCase().replace(String(size), '');

    switch (unit) {
        case 'kb': return size * 1024;
        case 'mb': return size * 1024 * 1024;
        case 'gb': return size * 1024 * 1024 * 1024;
        default: return size; // Assume bytes if no unit
    }
};

// Use MAX_FILE_SIZE from environment or default to 5MB
const maxFileSize = parseFileSize(process.env.MAX_FILE_SIZE || '5mb');

// Configure storage for different document types
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let subDirectory = '';

    // Determine sub-directory based on the route path structure
    if (req.originalUrl.includes('/api/invoices')) {
      subDirectory = 'invoices';
    } else if (req.originalUrl.includes('/api/purchase-orders')) {
      subDirectory = 'purchaseOrders';
    } else if (req.originalUrl.includes('/api/stock-register')) {
      subDirectory = 'stockEntries';
    } else {
        // Default or error handling if route context is unknown
        console.warn(`Unknown route for file upload: ${req.originalUrl}. Defaulting upload path.`);
        subDirectory = 'others'; // Or return an error: cb(new Error('Invalid route for upload'));
    }

    const uploadPath = path.join(BASE_UPLOADS_PATH, subDirectory);

    // Ensure the directory exists
    fs.mkdir(uploadPath, { recursive: true }, (err) => {
        if (err) {
            console.error("Error creating upload directory:", err);
            return cb(err); // Pass error to Multer
        }
        cb(null, uploadPath); // Directory exists or created, proceed
    });
  },
  filename: (req, file, cb) => {
    // Sanitize original filename to prevent path traversal or other issues
    const originalName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExt = path.extname(originalName);
    // Use a safe base name derived from fieldname or a default
    const baseName = file.fieldname || 'file';
    cb(null, `${baseName}-${uniqueSuffix}${fileExt}`);
  }
});

// File filter to only allow specific MIME types
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'application/pdf',
    'image/jpeg', // jpg, jpeg
    'image/png',
    'image/gif',
    'application/msword', // .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.ms-excel', // .xls
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'text/plain', // .txt
    'text/csv', // .csv
    // Add other types if needed
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true); // Accept the file
  } else {
    console.warn(`Rejected file upload (${file.originalname}) due to unsupported MIME type: ${file.mimetype}`);
    // Reject the file with a specific error message for the client
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Unsupported file type. Allowed types: PDF, Images (JPEG, PNG, GIF), Word, Excel, TXT, CSV.'), false);
  }
};

// Configure Multer instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
      fileSize: maxFileSize // Use the calculated max size in bytes
  }
});

// Error handling middleware specific to Multer errors (optional, can be useful)
// Place this *after* Multer middleware in your route definitions if needed,
// or handle errors within the main app error handler in index.js
export const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Handle specific Multer errors
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: `File size limit exceeded. Maximum size is ${process.env.MAX_FILE_SIZE || '5mb'}.` });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
         // This catches the error message from fileFilter
        return res.status(400).json({ message: err.message || 'Unsupported file type.' });
    }
    // Handle other potential Multer errors
    console.error("Multer Error:", err);
    return res.status(400).json({ message: `File upload error: ${err.message}` });
  } else if (err) {
    // Handle non-Multer errors that might occur during upload process
    console.error("Non-Multer Upload Error:", err);
    return res.status(500).json({ message: `Internal server error during file upload: ${err.message}` });
  }
  // If no error, proceed
  next();
};


export default upload; // Export the configured Multer instance