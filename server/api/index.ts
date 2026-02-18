import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import timeout from 'connect-timeout';
import { getDatabaseService } from '../services/databaseService.js';
import { tenantMiddleware } from '../middleware/tenantMiddleware.js';
import authRoutes from './routes/auth.js';
import shopRoutes from './routes/shop.js';
import { runMigrations } from '../scripts/run-migrations.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

// CORS
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:5174'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || corsOrigins.includes(origin) || corsOrigins.includes('*')) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS blocked origin: ${origin}`);
      callback(null, true); // Allow in dev, tighten in production
    }
  },
  credentials: true,
}));

app.use(timeout('30s'));
app.use(express.json({ limit: '10mb' }));

// Health check (public)
app.get('/api/health', async (_req, res) => {
  try {
    const dbHealthy = await getDatabaseService().healthCheck();
    res.json({
      status: dbHealthy ? 'healthy' : 'degraded',
      database: dbHealthy ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', database: 'error' });
  }
});

// Public routes (no auth required)
app.use('/api/auth', authRoutes);

// Protected routes (auth required)
const pool = getDatabaseService().getPool();
app.use('/api/shop', tenantMiddleware(pool), shopRoutes);

// Error handling
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  try {
    console.log('🚀 Starting MyShop API Server...');
    console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);

    // Run migrations
    console.log('🔄 Running database migrations...');
    await runMigrations();
    console.log('✅ Migrations complete');

    // Verify DB connection
    const healthy = await getDatabaseService().healthCheck();
    if (healthy) {
      console.log('✅ Database connection verified');
    } else {
      console.warn('⚠️ Database connection check failed - server starting anyway');
    }

    app.listen(PORT, HOST, () => {
      console.log(`✅ MyShop API running at http://${HOST}:${PORT}`);
      console.log(`📡 CORS origins: ${corsOrigins.join(', ')}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();
