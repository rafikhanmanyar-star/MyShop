#!/usr/bin/env node

/**
 * MyShop Diagnostic Tool
 * Checks the current setup and database connectivity
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('\n🔍 MyShop Diagnostic Report\n');
console.log('='.repeat(50));

// Check Node.js
try {
  const nodeVersion = execSync('node --version').toString().trim();
  console.log('✅ Node.js:', nodeVersion);
} catch {
  console.log('❌ Node.js: Not found');
}

// Check npm
try {
  const npmVersion = execSync('npm --version').toString().trim();
  console.log('✅ npm:', npmVersion);
} catch {
  console.log('❌ npm: Not found');
}

// Check .env file
const serverEnvPath = path.join(__dirname, 'server', '.env');
if (fs.existsSync(serverEnvPath)) {
  console.log('✅ .env file exists');
  const envContent = fs.readFileSync(serverEnvPath, 'utf-8');
  
  // Check for DATABASE_URL
  if (envContent.includes('DATABASE_URL')) {
    const dbUrlMatch = envContent.match(/DATABASE_URL=(.+)/);
    if (dbUrlMatch) {
      const url = dbUrlMatch[1];
      const masked = url.replace(/:[^@]*@/, ':***@');
      console.log(`   Database: ${masked}`);
      
      if (url.includes('localhost') || url.includes('127.0.0.1')) {
        console.log('   Type: Local PostgreSQL');
      } else if (url.includes('render.com')) {
        console.log('   Type: Render Cloud Database');
      } else {
        console.log('   Type: Remote Database');
      }
    }
  } else {
    console.log('   ⚠️  No DATABASE_URL configured');
  }
  
  // Check for DISABLE_MIGRATIONS
  if (envContent.includes('DISABLE_MIGRATIONS=true')) {
    console.log('   ✅ Migrations disabled (test mode)');
  }
} else {
  console.log('❌ .env file not found');
  console.log('   Create server/.env from server/.env.local.example');
}

// Check build files
console.log('');
const serverDistPath = path.join(__dirname, 'server', 'dist', 'api', 'index.js');
if (fs.existsSync(serverDistPath)) {
  console.log('✅ Server built');
} else {
  console.log('❌ Server not built - run: npm run build:server');
}

const clientDistPath = path.join(__dirname, 'client', 'dist', 'index.html');
if (fs.existsSync(clientDistPath)) {
  console.log('✅ Client built');
} else {
  console.log('❌ Client not built - run: npm run build:client');
}

// Check dependencies
console.log('');
const serverNodeModules = path.join(__dirname, 'server', 'node_modules');
const clientNodeModules = path.join(__dirname, 'client', 'node_modules');

if (fs.existsSync(serverNodeModules)) {
  console.log('✅ Server dependencies installed');
} else {
  console.log('❌ Server dependencies missing - run: cd server && npm install');
}

if (fs.existsSync(clientNodeModules)) {
  console.log('✅ Client dependencies installed');
} else {
  console.log('❌ Client dependencies missing - run: cd client && npm install');
}

// Quick commands
console.log('\n' + '='.repeat(50));
console.log('\n📋 Quick Commands:\n');
console.log('Setup wizard:');
console.log('  node setup.js\n');

console.log('Build application:');
console.log('  npm run build\n');

console.log('Run Electron app:');
console.log('  npm run electron\n');

console.log('Development with hot reload:');
console.log('  npm run dev           # Both server and client');
console.log('  npm run dev:server    # API only');
console.log('  npm run dev:client    # Frontend only\n');

console.log('='.repeat(50) + '\n');
