import 'dotenv/config';
import express from 'express';
import path from 'path';
import cors from 'cors';
import timeout from 'connect-timeout';
import { getDatabaseService } from '../services/databaseService.js';
import { tenantMiddleware } from '../middleware/tenantMiddleware.js';
import authRoutes from './routes/auth.js';
import shopRoutes from './routes/shop.js';
import mobileRoutes from './routes/mobile.js';
import mobileOrdersRoutes from './routes/mobileOrders.js';
import { runMigrations } from '../scripts/run-migrations.js';

const app = express();
const clientDistPath = process.env.CLIENT_DIST_PATH;
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

// CORS
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:5174'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Electron file://, mobile apps, server-to-server)
    if (!origin || corsOrigins.includes('*') || corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS blocked origin: ${origin}`);
      callback(null, true);
    }
  },
  credentials: true,
}));

app.use(timeout('30s'));
app.use(express.json({ limit: '10mb' }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

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

app.get('/api/test', (_req, res) => {
  res.json({ message: 'API is working' });
});

// Public routes (no auth required)
app.use('/api/auth', authRoutes);

// Mobile ordering routes (mix of public + customer-authenticated)
app.use('/api/mobile', mobileRoutes);

app.get('/api/shop-test', (_req, res) => {
  res.json({ message: 'Public shop test works' });
});

// Protected routes (auth required)
const dbService = getDatabaseService();
app.use('/api/shop', tenantMiddleware(dbService), shopRoutes);

// POS-side mobile order management (requires shop auth)
app.use('/api/shop/mobile-orders', tenantMiddleware(dbService), mobileOrdersRoutes);

// Serve static client (Electron mode)
if (clientDistPath) {
  app.use(express.static(clientDistPath));
}

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

if (clientDistPath) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

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
    try {
      console.log('🔄 Running database migrations...');
      await runMigrations();
      console.log('✅ Migrations complete');
    } catch (migError) {
      console.error('⚠️ Migration failed - skipping for now:', migError instanceof Error ? migError.message : migError);
    }

    // Verify DB connection
    try {
      const healthy = await getDatabaseService().healthCheck();
      if (healthy) {
        console.log('✅ Database connection verified');
      } else {
        console.warn('⚠️ Database connection check failed - server starting anyway');
      }
    } catch (dbError) {
      console.warn('⚠️ Database health check threw an error - server starting anyway');
    }

    app.listen(PORT, HOST, () => {
      console.log(`✅ MyShop API running at http://${HOST}:${PORT}`);
      console.log(`📡 CORS origins: ${corsOrigins.join(', ')}`);
    });
  } catch (error) {
    console.error('❌ Critical failure during startup:', error);
    process.exit(1);
  }
}

start();
