import express from 'express';
import { getPlatformAuthService } from '../../services/platformAuthService.js';
import {
  platformJwtMiddleware,
  type PlatformRequest,
} from '../../middleware/platformAdminMiddleware.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const result = await getPlatformAuthService().login(username, password);
    res.json(result);
  } catch (error: any) {
    res.status(401).json({ error: error.message || 'Login failed' });
  }
});

router.patch('/password', platformJwtMiddleware, async (req: PlatformRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!req.platformAdmin) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    await getPlatformAuthService().changePassword(
      req.platformAdmin.id,
      currentPassword,
      newPassword
    );
    res.json({ success: true, message: 'Password updated' });
  } catch (error: any) {
    const msg = error.message || 'Password change failed';
    const code = msg.includes('incorrect') ? 401 : 400;
    res.status(code).json({ error: msg });
  }
});

export default router;
