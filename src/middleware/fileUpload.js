import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Configure storage for different document types
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = '';
    
    // Determine upload path based on document type
    if (req.path.includes('invoice')) {
      uploadPath = path.join('uploads', 'invoices');
    } else if (req.path.includes('purchase-order')) {
      uploadPath = path.join('uploads', 'purchaseOrders');
    } else if (req.path.includes('stock-register')) {
      uploadPath = path.join('uploads', 'stockEntries');
    }
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Create unique filename: timestamp + original name
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExt = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + fileExt);
  }
});

// File filter to only allow specific file types
const fileFilter = (req, file, cb) => {
  const allowedFileTypes = [
    'application/pdf', 
    'image/jpeg', 
    'image/png', 
    'image/jpg',
    'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  
  if (allowedFileTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not supported. Please upload PDF, Image, Word, or Excel files.'), false);
  }
};

// Configure upload for different file fields
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB file size limit
});

export default upload;