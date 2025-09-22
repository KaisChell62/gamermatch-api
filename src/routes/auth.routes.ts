import express from 'express';
import { 
  register, 
  login, 
  logout, 
  getProfile 
} from '../controllers/auth.controller';
import { auth } from '../middleware/auth';

const router = express.Router();

// Routes publiques
router.post('/register', register);
router.post('/login', login);

// Routes protégées
router.use(auth);
router.post('/logout', logout);
router.get('/profile', getProfile);

export default router; 