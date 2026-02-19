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
- Use a local PostgreSQL server (recommended for development)
- Create a database on [Render](https://render.com)

**Important**: The default Render database might not be accessible from your location due to network/firewall restrictions.

### 2. Configure environment

Run the setup helper:
```bash
node setup.js
```

Or manually configure `server/.env`:

**Option A: Local PostgreSQL** (Recommended)
```env
DATABASE_URL=postgresql://myshop_local:localpass@localhost:5432/myshop_local
```

**Option B: Use Render Database**
```env
DATABASE_URL=postgresql://myshop_db_staging_user:PASSWORD@dpg-xxx-a.region-postgres.render.com/myshop_db_staging
```

**Option C: Disable Migrations (Test Mode)**
```env
DISABLE_MIGRATIONS=true
```

### 3. Install and run

```bash
npm install
npm run build
npm run electron
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

## Local frontend + Cloud server

To run the **client on localhost** while the **API and database run on the cloud** (e.g. Render):

### 1. Client (localhost)

1. In `client/`, create a `.env` or `.env.local` file with your cloud API URL (no trailing slash):

   ```env
   VITE_API_URL=https://your-api-service.onrender.com
   ```

   Replace with your actual Render API URL (e.g. from the Render dashboard).

2. Install and start the dev server:

   ```bash
   cd client
   npm install
   npm run dev
   ```

   The app will be at http://localhost:5173 and will call the cloud API.

### 2. Server (cloud)

- **CORS**: Your cloud API must allow requests from `http://localhost:5173`. In `render.yaml` the default is `CORS_ORIGIN: "*"`, so localhost is already allowed. If you override `CORS_ORIGIN` in the Render dashboard, add `http://localhost:5173` (and optionally `http://localhost:5174`).
- **Env**: Ensure the server on Render has `DATABASE_URL`, `JWT_SECRET`, and `NODE_ENV=production` set. No client-side config is needed on the server.

You do **not** need to run the server or PostgreSQL locally; only run the client with `VITE_API_URL` pointing to the cloud.

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

## Desktop App (Electron)

You can build MyShop as an installable desktop application for Windows.

### Option A: Cloud mode (API & DB on Render) — recommended

Connects to your deployed API and database on Render. No local server or Node.js needed on the target machine.

1. **Set your Render API URL**

   Copy `client/.env.cloud.example` to `client/.env.cloud` and set your API URL:

   ```
   VITE_API_URL=https://myshop-api-9pd4.onrender.com
   ```

   (Use your actual Render API URL from the Render dashboard.)

2. **Run the app**

   ```bash
   npm install
   npm run electron:cloud
   ```

3. **Create the installer**

   ```bash
   npm run dist:win:cloud
   ```

   The installer is in `release/` (e.g. `MyShop Setup 1.0.0.exe`).

### Option B: Standalone mode (local server + DB)

Runs the API server and PostgreSQL locally. Requires Node.js and PostgreSQL on the target machine.

1. Configure the server with your database (create `server/.env` from `.env.example`).

2. Build and run:

   ```bash
   npm install
   npm run build
   npm run electron
   ```

3. Create installer: `npm run dist:win`

### Development (with hot reload)

```bash
# Terminal 1: Start the API server
npm run dev:server

# Terminal 2: Start Electron (connects to running server)
npm run electron:dev
```

Or: `npm run electron:dev`

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

## Troubleshooting

### "Server failed to start in time" or "Connection terminated unexpectedly"

The application builds successfully but fails to start. This is usually a database connection issue.

**Cause**: The PostgreSQL database is not reachable from your network.

**Solutions** (in order of recommendation):

1. **Use Local PostgreSQL** (Recommended for development)
   ```bash
   # Install Docker (if not already installed)
   # Run PostgreSQL:
   docker run --name myshop-db -e POSTGRES_PASSWORD=localpass -p 5432:5432 -d postgres:15
   
   # Update server/.env:
   DATABASE_URL=postgresql://postgres:localpass@localhost:5432/postgres
   
   # Rebuild and run:
   npm run build
   npm run electron
   ```

2. **Disable Migrations** (Test mode - no database)
   ```bash
   # Edit server/.env:
   DISABLE_MIGRATIONS=true
   
   npm run build
   npm run electron
   ```

3. **Run Setup Helper**
   ```bash
   node setup.js
   ```
   Follow the interactive prompts to configure your database.

4. **Use Cloud Mode** (For production)
   ```bash
   npm run electron:cloud
   ```

See [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) for more detailed information.
