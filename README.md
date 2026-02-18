# MyShop - POS & Inventory Management

Standalone shop application with Point of Sale, Inventory Management, Loyalty Programs, Multi-Store support, and Business Analytics.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS v4
- **Backend**: Express, PostgreSQL (cloud on Render)
- **Auth**: JWT-based, independent authentication
- **Multi-tenant**: Row Level Security (RLS) for tenant isolation

## Project Structure

```
MyShop/
  ├── client/          # React frontend (Vite)
  │   ├── src/
  │   │   ├── components/   # Shop UI components
  │   │   ├── context/      # Auth context
  │   │   ├── pages/        # Page components
  │   │   ├── services/     # API client & shopApi
  │   │   └── App.tsx       # Main app with routing
  │   └── package.json
  ├── server/          # Express API server
  │   ├── api/
  │   │   ├── index.ts      # Server entry point
  │   │   └── routes/       # Auth & Shop routes
  │   ├── services/         # DB, Auth, Shop services
  │   ├── middleware/       # Tenant middleware
  │   ├── migrations/       # PostgreSQL schema
  │   └── package.json
  ├── render.yaml      # Render deployment config
  └── .env.example     # Environment template
```

## Quick Start (Local Development)

### 1. Set up the database

You need a PostgreSQL database. Either:
- Use a local PostgreSQL server
- Create a free database on [Render](https://render.com)

### 2. Configure environment

```bash
# In the server/ directory
cp ../.env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET
```

### 3. Start the API server

```bash
cd server
npm install
npm run dev
```

The server starts on http://localhost:3000 and auto-runs migrations.

### 4. Start the frontend

```bash
cd client
npm install
npm run dev
```

The frontend starts on http://localhost:5173 with API proxy to port 3000.

### 5. Register an account

Open http://localhost:5173, click "Create one", and register your first account. This creates a tenant with an admin user.

## Deployment to Render

### Option 1: Blueprint (render.yaml)

1. Push this repo to GitHub
2. Go to Render Dashboard -> "New" -> "Blueprint"
3. Connect your GitHub repo
4. Render reads `render.yaml` and creates the database + services

### Option 2: Manual Setup

1. **Create PostgreSQL Database**: Render -> New -> PostgreSQL
   - Copy the **External Database URL**

2. **Create Web Service** (API):
   - Connect your repo
   - Build: `cd server && npm install && npm run build`
   - Start: `cd server && npm start`
   - Set env vars: `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`

3. **Create Static Site** (Frontend):
   - Build: `cd client && npm install && npm run build`
   - Publish: `client/dist`
   - Set env: `VITE_API_URL=https://your-api.onrender.com`

## Copying Shop Components from PBooksPro

The placeholder pages can be replaced with the full shop components from PBooksPro. Copy these directories:

```
PBooksPro/components/shop/*  ->  MyShop/client/src/components/shop/
PBooksPro/context/POSContext.tsx  ->  MyShop/client/src/context/
PBooksPro/context/InventoryContext.tsx  ->  MyShop/client/src/context/
PBooksPro/context/LoyaltyContext.tsx  ->  MyShop/client/src/context/
PBooksPro/context/MultiStoreContext.tsx  ->  MyShop/client/src/context/
```

Then update imports from `../../services/api/shopApi` to `../../services/shopApi` and wire the components into `App.tsx` routes.
