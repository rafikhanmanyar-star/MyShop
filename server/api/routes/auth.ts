import express from 'express';
import { getAuthService } from '../../services/authService.js';

const router = express.Router();

/** Public: all tenants for login company picker */
router.get('/organizations', async (_req, res) => {
  try {
    const list = await getAuthService().listPublicOrganizations();
    res.json(list);
  } catch (error: any) {
    console.error('[Auth] List organizations error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/** Public: organization (and optional branch) label for login page */
router.get('/organization', async (req, res) => {
  try {
    const orgId =
      (typeof req.query.org_id === 'string' && req.query.org_id) ||
      (typeof req.query.org === 'string' && req.query.org) ||
      '';
    const branchId =
      typeof req.query.branch_id === 'string'
        ? req.query.branch_id
        : typeof req.query.branch === 'string'
          ? req.query.branch
          : '';

    const trimmed = orgId.trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'org_id or org query parameter is required' });
    }

    const info = await getAuthService().getPublicOrganizationInfo(trimmed, branchId.trim() || null);
    if (!info) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    res.json(info);
  } catch (error: any) {
    console.error('[Auth] Public organization error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

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
    const { username, password, org_id: orgId, pos_client: posClientRaw } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const posClient = posClientRaw === true || posClientRaw === 'true' || posClientRaw === 1;
    const result = await getAuthService().login({ username, password, orgId, posClient });
    res.json(result);
  } catch (error: any) {
    console.error('[Auth] Login error:', error.message);
    const msg = error?.message || '';
    const isAlreadyLoggedIn = msg.includes('Already logged in');
    const isPosTerminalLimit =
      msg.includes('No POS terminals are configured') || msg.includes('All POS terminals are in use');
    const status = isPosTerminalLimit ? 403 : isAlreadyLoggedIn ? 409 : 401;
    res.status(status).json({ error: msg });
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
