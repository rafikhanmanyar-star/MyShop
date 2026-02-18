import express from 'express';
import { getAuthService } from '../../services/authService.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, username, password, companyName } = req.body;

    if (!name || !email || !username || !password) {
      return res.status(400).json({ error: 'Name, email, username, and password are required' });
    }

    const result = await getAuthService().register({ name, email, username, password, companyName });
    res.status(201).json(result);
  } catch (error: any) {
    console.error('[Auth] Registration error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await getAuthService().login({ username, password });
    res.json(result);
  } catch (error: any) {
    console.error('[Auth] Login error:', error.message);
    res.status(401).json({ error: error.message });
  }
});

router.post('/logout', async (req: any, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const jwt = await import('jsonwebtoken');
    const decoded: any = jwt.default.verify(token, process.env.JWT_SECRET!);
    await getAuthService().logout(decoded.userId, decoded.tenantId);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
