import express from 'express';
import {
  registerUser,
  loginUser,
  getUserProfile,
  promoteUser,
  getAllUsers
} from '../controller/userController.js';
import { auth, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// User routes
router.post('/register', auth, adminOnly, registerUser); // Only admin can register new users
router.post('/login', loginUser);                     // Public route for login
router.get('/profile', auth, getUserProfile);         // Authenticated users can get their own profile
router.put('/promote/:userId', auth, adminOnly, promoteUser); // Only admin can promote users
router.get('/', auth, adminOnly, getAllUsers);        // Only admin can list all users (consider adding pagination)

export default router;