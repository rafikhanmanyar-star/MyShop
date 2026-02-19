# MyShop Application - Troubleshooting Guide

## Issue: "Server failed to start in time" or "Connection terminated unexpectedly"

Your application is built and installed correctly, but it's failing to start because it cannot connect to the PostgreSQL database on Render.

### Root Cause
The app is configured to use a PostgreSQL database hosted on Render (`dpg-d6aqlkumcj7s73ekis60-a.oregon-postgres.render.com`), but this database is not reachable from your current network location. This could be due to:

1. **Network/Firewall blocking** - Your ISP or firewall is blocking the connection
2. **Database offline** - The Render database service might be down or have issues
3. **Connection limits exceeded** - The database might have reached its connection limit
4. **Invalid credentials** - The database password might have changed or been reset

---

## Solutions

### Solution 1: Use a Local PostgreSQL Database (Recommended for Development)

1. **Install PostgreSQL locally** (if not already installed):
   - Windows: Download from https://www.postgresql.org/download/windows/
   - Or use Windows Subsystem for Linux (WSL): `wsl --install`
   - Or use Docker: `docker run --name myshop-db -e POSTGRES_PASSWORD=localpass -p 5432:5432 postgres:15`

2. **Create a local database**:
   ```sql
   CREATE USER myshop_local WITH PASSWORD 'localpass';
   CREATE DATABASE myshop_local OWNER myshop_local;
   ```

3. **Update the .env file** in `server/.env`:
   ```
   DATABASE_URL=postgresql://myshop_local:localpass@localhost:5432/myshop_local
   ```

4. **Rebuild and restart**:
   ```
   npm run build
   npm run electron
   ```

### Solution 2: Disable Migrations (Temporary Workaround)

If you just need to test the app without database functionality:

1. **Edit `server/.env`**:
   ```
   DISABLE_MIGRATIONS=true
   ```

2. **Rebuild and restart**:
   ```
   npm run build
   npm run electron
   ```

**Note**: The app will start but database features won't work without proper migrations.

### Solution 3: Test Render Database Connectivity

To verify if the database is actually reachable:

```powershell
# Install psql (PostgreSQL client) if you don't have it
# Then test the connection:
psql "postgresql://myshop_db_staging_user:1svMSUH15ssv1LA0AVYPVJSHaWy2lfEj@dpg-d6aqlkumcj7s73ekis60-a.oregon-postgres.render.com:5432/myshop_db_staging"
```

If this command times out, your network cannot reach the Render database.

### Solution 4: Use Render's Cloud Mode

If you're deploying to production, use the cloud mode:

```powershell
npm run electron:cloud
```

This bypasses local server startup and connects directly to the Render API.

---

## Environment Variable Reference

Edit `server/.env` to change these settings:

```env
# Database connection
DATABASE_URL=postgresql://user:password@host:port/database

# JWT secret for authentication
JWT_SECRET=your-secret-key-change-this

# Server port
PORT=3000

# Allowed CORS origins
CORS_ORIGIN=http://localhost:5173,http://localhost:5174

# Environment
NODE_ENV=development

# Skip migrations (optional)
DISABLE_MIGRATIONS=true
```

---

## Quick Start - Local Development Setup

1. **Install PostgreSQL** (Docker is easiest):
   ```powershell
   docker run --name myshop-db -e POSTGRES_PASSWORD=localpass -p 5432:5432 -d postgres:15
   ```

2. **Create database**:
   ```powershell
   docker exec -it myshop-db psql -U postgres -c "CREATE USER myshop_local WITH PASSWORD 'localpass'; CREATE DATABASE myshop_local OWNER myshop_local;"
   ```

3. **Update .env**:
   ```env
   DATABASE_URL=postgresql://myshop_local:localpass@localhost:5432/myshop_local
   ```

4. **Run the app**:
   ```powershell
   npm run electron
   ```

---

## What We've Fixed

- ✅ Improved database connection error messages with diagnostics
- ✅ Added better timeout handling in Electron startup
- ✅ Included .env file in the build package
- ✅ Added migration disable option for development
- ✅ Improved environment variable loading

The application build and installation are working perfectly now. You just need to configure database access!
