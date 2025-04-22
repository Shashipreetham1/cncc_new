import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();

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
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('admin123', salt); // Change default password in production

      await prisma.user.create({
        data: {
          username: 'admin',
          password: hashedPassword,
          role: 'ADMIN'
        }
      });

      console.log('Admin user created successfully! Username: admin, Password: admin123');
      console.log('IMPORTANT: Please change the default password after first login.');
    } else {
      console.log('Admin user already exists. No new user created.');
    }
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await prisma.$disconnect();
  }
};

// Execute if this file is run directly (ES modules equivalent of require.main === module)
const currentFilePath = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] === currentFilePath;

if (isMainModule) {
  createAdminUser()
    .then(() => console.log('Seed completed'))
    .catch(e => console.error('Seed failed:', e));
}

export default createAdminUser;