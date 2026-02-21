# MyShop Scripts & Deployment Guide

This document explains how to use the various scripts defined in the root `package.json` for developing, running, and packaging the MyShop application.

## 🛠 Prerequisites

Ensure you have the following installed:
*   [Node.js](https://nodejs.org/) (v18 or higher recommended)
*   [Git](https://git-scm.com/)
*   A running PostgreSQL database (or access to the Render staging DB)

---

## 💻 Development Scripts

### 1. Web-only Development
If you just want to work on the web interface without Electron:
```bash
npm run dev
```
*   **What it does**: Starts both the backend API (port 3000) and the frontend Vite server (port 5173).
*   **URL**: http://localhost:5173

### 2. Electron Development (Local API)
To run the Desktop application while developing, using your local server:
```bash
npm run electron:dev
```
*   **What it does**: Starts the local server, waits for it to be healthy, and then launches the Electron window pointing to the local dev server.

### 3. Electron Development (Cloud API)
To run the Desktop application while developing, but connecting to the production/staging API on Render:
```bash
npm run electron:cloud
```

---

## 📦 Building and Packaging

### 1. Creating an Installable (Windows EXE)
To generate a full installer that users can run to install MyShop on their machine:
```bash
npm run dist:win
```
*   **Output**: Look in the `release/` folder for a `.exe` setup file (e.g., `MyShop Setup 1.0.0.exe`).
*   **Configurations**: This uses the default local settings.

### 2. Creating a Cloud-Connected Installable
If you want to build an installer that points directly to the cloud API (no local server required for the client):
```bash
npm run dist:win:cloud
```

### 3. Portable/Packaged Directory (No Installer)
To just package the app into a folder without creating an installer:
```bash
npm run pack
```
*   **Output**: `release/win-unpacked/`

---

## 📜 Full Scripts Reference Table

| Script | Purpose |
| :--- | :--- |
| `npm run dev` | Runs Web Client + API Server concurrently for browser development. |
| `npm run electron:dev` | Runs API Server + Electron Desktop for local development. |
| `npm run electron:cloud` | Runs Electron Desktop connected to the cloud API. |
| `npm run build` | Builds both backend (TS) and frontend (Vite) for production. |
| `npm run dist:win` | **Main Packaging Choice**: Creates a Windows Installer (.exe). |
| `npm run dist:win:cloud` | Creates a Windows Installer configured for cloud use. |
| `npm run build:server` | Compiles the TypeScript server into the `server/dist` folder. |
| `npm run build:client` | Compiles the React client into the `client/dist` folder. |

---

## 📋 Troubleshooting Tip
If you encounter permission issues or missing dependencies when packaging, try a clean install at the root:
```bash
npm install
```
This will automatically trigger the `postinstall` script to install dependencies in both `/server` and `/client` directories.
