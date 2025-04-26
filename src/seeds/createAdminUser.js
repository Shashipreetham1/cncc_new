import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables to access DATABASE_URL if needed directly
// although PrismaClient usually handles this.
dotenv.config();

const prisma = new PrismaClient();

// Default credentials - WARNING: Extremely insecure for production
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123'; // CHANGE THIS IMMEDIATELY AFTER FIRST USE

// Function to create an admin user if one doesn't exist
const createAdminUser = async () => {
  try {
    // Check if admin user already exists
    const adminCount = await prisma.user.count({
      where: {
        role: 'ADMIN'
      }
    });

    // If no admin exists, create one
    if (adminCount === 0) {
      console.log('No admin user found. Creating default admin...');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, salt);

      const newUser = await prisma.user.create({
        data: {
          username: DEFAULT_ADMIN_USERNAME,
          password: hashedPassword,
          role: 'ADMIN'
        }
      });

      console.log(`Admin user created successfully! Username: ${newUser.username}`);
      console.log(`Password: ${DEFAULT_ADMIN_PASSWORD} - !!! SECURITY WARNING: PLEASE CHANGE THIS PASSWORD IMMEDIATELY !!!`);
    } else {
      console.log('Admin user already exists. Seed script skipped admin creation.');
    }
  } catch (error) {
    console.error('Error during admin user seed:', error);
    // Optionally re-throw the error if calling function needs to handle it
    // throw error;
  } finally {
    // Ensure prisma client disconnects regardless of success/failure
    // Avoid disconnecting if called from main app index.js
    if (isMainModuleExecution()) {
        await prisma.$disconnect();
        console.log('Prisma client disconnected.');
    }
  }
};

// Helper function to check if the script is run directly
const isMainModuleExecution = () => {
  const currentFilePath = fileURLToPath(import.meta.url);
  // process.argv[1] holds the path of the script being executed
  return process.argv[1] === currentFilePath;
};


// Execute if this file is run directly (e.g., `node src/seeds/createAdminUser.js`)
if (isMainModuleExecution()) {
  console.log('Running admin user seed script directly...');
  createAdminUser()
    .then(() => console.log('Admin seed script completed.'))
    .catch(e => {
        console.error('Admin seed script failed:', e);
        process.exit(1); // Exit with error code if seeding fails when run directly
    });
}

export default createAdminUser; // Export function for use in index.js