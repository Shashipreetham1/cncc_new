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
router.post('/login', loginUser);
router.get('/profile', auth, getUserProfile);
router.put('/promote/:userId', auth, adminOnly, promoteUser); // Only admin can promote users
router.get('/', auth, adminOnly, getAllUsers); // Only admin can list all users

export default router;