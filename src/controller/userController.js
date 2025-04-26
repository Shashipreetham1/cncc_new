import { PrismaClient, Role } from '@prisma/client'; // Import Role enum
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// Ensure JWT_SECRET is loaded
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("FATAL ERROR: JWT_SECRET environment variable is not set.");
}
// Use JWT expiry from env or default
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '7d';

// Utility to exclude fields from an object (like password)
function exclude(user, keys) {
  return Object.fromEntries(
    Object.entries(user).filter(([key]) => !keys.includes(key))
  );
}


// Register a new user (protected by adminOnly middleware)
export const registerUser = async (req, res) => {
  const { username, password, role = 'USER' } = req.body; // Default role to USER

  // Basic input validation
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }
  if (password.length < 6) { // Example: enforce minimum password length
    return res.status(400).json({ message: 'Password must be at least 6 characters long' });
  }
   // Validate Role
  if (!Object.values(Role).includes(role)) {
     return res.status(400).json({ message: `Invalid role specified. Must be one of: ${Object.values(Role).join(', ')}` });
  }

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { username }
    });

    if (existingUser) {
      return res.status(400).json({ message: 'Username is already taken' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        role: role // Assign role from input (USER or ADMIN)
      }
    });

    // Return created user data (excluding password)
    const userWithoutPassword = exclude(user, ['password']);
    res.status(201).json(userWithoutPassword);

  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ message: 'Server Error during registration' });
  }
};

// Login user
export const loginUser = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    // Find user by username
    const user = await prisma.user.findUnique({
      where: { username }
    });

    if (!user) {
      // Use a generic message to avoid confirming valid usernames
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Create JWT payload
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role
    };

    // Sign JWT token with expiry from env or default
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });

    // Return essential user info and token
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      token
    });

  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ message: 'Server Error during login' });
  }
};

// Get current user profile (user identified by auth middleware)
export const getUserProfile = async (req, res) => {
  // req.user is populated by the 'auth' middleware
  if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Not authorized' }); // Should not happen if auth middleware ran
  }

  try {
    // Fetch fresh data for the authenticated user, excluding password
    const userProfile = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!userProfile) {
        // Should be rare if auth succeeded, but handle defensively
        return res.status(404).json({ message: 'User profile not found' });
    }

    res.json(userProfile);

  } catch (error) {
    console.error('Get Profile Error:', error);
    res.status(500).json({ message: 'Server Error retrieving profile' });
  }
};

// Promote user to admin (protected by adminOnly middleware)
export const promoteUser = async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
      return res.status(400).json({ message: 'User ID parameter is required' });
  }

  try {
    // Check if user exists before trying to promote
    const userToPromote = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!userToPromote) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent self-promotion/demotion via this route maybe? (optional check)
    // if (req.user.id === userId) {
    //   return res.status(400).json({ message: 'Cannot change your own role via this endpoint.' });
    // }

    // Update user role to admin
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role: 'ADMIN' },
      select: { // Select only non-sensitive data to return
        id: true,
        username: true,
        role: true,
        updatedAt: true
      }
    });

    res.json({
      message: `User ${updatedUser.username} promoted to admin successfully`,
      user: updatedUser
    });

  } catch (error) {
    console.error('Promotion Error:', error);
    res.status(500).json({ message: 'Server Error during promotion' });
  }
};

// Get all users (protected by adminOnly middleware) - Added Pagination
export const getAllUsers = async (req, res) => {
  const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  if (isNaN(pageNum) || pageNum < 1 || isNaN(limitNum) || limitNum < 1) {
    return res.status(400).json({ message: 'Invalid pagination parameters (page and limit must be positive integers)' });
  }

  const skip = (pageNum - 1) * limitNum;
  const validSortOrders = ['asc', 'desc'];
  const orderByField = ['username', 'role', 'createdAt', 'updatedAt'].includes(sortBy) ? sortBy : 'createdAt';
  const orderDirection = validSortOrders.includes(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : 'desc';


  try {
    const users = await prisma.user.findMany({
      select: { // Exclude password hash
        id: true,
        username: true,
        role: true,
        createdAt: true,
        updatedAt: true
      },
      skip: skip,
      take: limitNum,
      orderBy: {
          [orderByField]: orderDirection
      }
    });

    const totalUsers = await prisma.user.count(); // Get total count for pagination calculation
    const totalPages = Math.ceil(totalUsers / limitNum);

    res.json({
        users,
        currentPage: pageNum,
        totalPages: totalPages,
        totalUsers: totalUsers
    });

  } catch (error) {
    console.error('Get All Users Error:', error);
    res.status(500).json({ message: 'Server Error retrieving user list' });
  }
};