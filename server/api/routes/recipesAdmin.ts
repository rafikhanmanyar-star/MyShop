import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { checkRole } from '../../middleware/roleMiddleware.js';
import { getRecipeService } from '../../services/recipeService.js';

const recipeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|pjpeg|png|webp|gif)$/i.test(file.mimetype);
    cb(null, ok);
  },
});

const router = express.Router();

router.get('/categories', checkRole(['admin']), async (req: any, res) => {
  try {
    const list = await getRecipeService().listCategories(req.tenantId);
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/categories', checkRole(['admin']), async (req: any, res) => {
  try {
    const { name, image_url } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const id = await getRecipeService().createCategory(req.tenantId, name, image_url ?? null);
    res.status(201).json({ id });
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (/unique|duplicate/i.test(msg)) return res.status(400).json({ error: 'Category name already exists' });
    res.status(500).json({ error: msg });
  }
});

router.put('/categories/:id', checkRole(['admin']), async (req: any, res) => {
  try {
    await getRecipeService().updateCategory(req.tenantId, req.params.id, {
      name: req.body?.name,
      image_url: req.body?.image_url,
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/categories/:id', checkRole(['admin']), async (req: any, res) => {
  try {
    await getRecipeService().deleteCategory(req.tenantId, req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/', checkRole(['admin']), async (req: any, res) => {
  try {
    const { search, category_id, is_active, limit, offset } = req.query;
    let activeFilter: boolean | undefined = undefined;
    if (is_active === 'true') activeFilter = true;
    if (is_active === 'false') activeFilter = false;
    const result = await getRecipeService().listAdminRecipes(req.tenantId, {
      search: search as string,
      category_id: category_id as string,
      is_active: activeFilter,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/upload-image', checkRole(['admin']), (req, res, next) => {
  recipeUpload.single('image')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    if (err) return res.status(500).json({ error: err.message });
    try {
      const file = (req as any).file as { buffer: Buffer } | undefined;
      if (!file?.buffer?.length) {
        return res.status(400).json({ error: 'No image (use JPEG, PNG, WebP, or GIF).' });
      }
      const uploadDir = path.resolve(process.cwd(), 'uploads/recipe');
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      const filename = `recipe-${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
      const outPath = path.join(uploadDir, filename);
      await sharp(file.buffer)
        .rotate()
        .resize(1400, 1400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 88 })
        .toFile(outPath);
      const imageUrl = `/uploads/recipe/${filename}`;
      res.json({ imageUrl });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Upload failed' });
    }
  });
});

router.get('/:id', checkRole(['admin']), async (req: any, res) => {
  try {
    const data = await getRecipeService().getAdminRecipe(req.tenantId, req.params.id);
    if (!data) return res.status(404).json({ error: 'Recipe not found' });
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', checkRole(['admin']), async (req: any, res) => {
  try {
    const id = await getRecipeService().createRecipe(req.tenantId, req.userId ?? null, req.body);
    res.status(201).json({ id });
  } catch (e: any) {
    const msg = String(e?.message || '');
    const status = /required|already exists|not found|must be linked/i.test(msg) ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

router.put('/:id', checkRole(['admin']), async (req: any, res) => {
  try {
    await getRecipeService().updateRecipe(req.tenantId, req.params.id, req.body);
    res.json({ ok: true });
  } catch (e: any) {
    const msg = String(e?.message || '');
    const status = /required|already exists|not found|must be linked/i.test(msg) ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

router.delete('/:id', checkRole(['admin']), async (req: any, res) => {
  try {
    await getRecipeService().deleteRecipe(req.tenantId, req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
