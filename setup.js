#!/usr/bin/env node

/**
 * MyShop Setup Helper
 * This script helps configure the application for local development
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  console.log('\n🛠️  MyShop Application Setup\n');
  console.log('This script will help you configure the application for development.\n');

  const serverEnvPath = path.join(__dirname, 'server', '.env');
  const envExists = fs.existsSync(serverEnvPath);

  if (envExists) {
    const current = fs.readFileSync(serverEnvPath, 'utf-8');
    console.log('Current .env file found in server/');
    console.log('');
  }

  console.log('Database Configuration Options:\n');
  console.log('1. Use Render Cloud Database (current - may not be accessible)');
  console.log('2. Use Local PostgreSQL (recommended for heavy development)');
  console.log('3. Use SQLite (best for standalone/offline - no server needed)');
  console.log('4. Disable Migrations (test mode - no database)');
  console.log('5. Keep Current Configuration');
  console.log('');

  const choice = await question('Select option (1-5): ');

  let envContent = '';

  switch (choice) {
    case '1':
      envContent = `# Render Cloud Database
DATABASE_URL=postgresql://myshop_db_staging_user:1svMSUH15ssv1LA0AVYPVJSHaWy2lfEj@dpg-d6aqlkumcj7s73ekis60-a.oregon-postgres.render.com/myshop_db_staging
JWT_SECRET=myshop-dev-secret-change-in-production
PORT=3000
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
NODE_ENV=development
`;
      console.log('✓ Configured for Render Cloud Database');
      break;

    case '2':
      const dbHost = await question('Database Host (default: localhost): ') || 'localhost';
      const dbPort = await question('Database Port (default: 5432): ') || '5432';
      const dbUser = await question('Database User (default: myshop_local): ') || 'myshop_local';
      const dbPass = await question('Database Password: ');
      const dbName = await question('Database Name (default: myshop_local): ') || 'myshop_local';

      envContent = `# Local PostgreSQL Configuration
DATABASE_URL=postgresql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${dbName}
JWT_SECRET=myshop-dev-secret-change-in-production
PORT=3000
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
NODE_ENV=development
`;
      console.log('✓ Configured for Local PostgreSQL');
      break;

    case '3':
      const dbFile = await question('Database file path (default: myshop.db): ') || 'myshop.db';
      envContent = `# SQLite Local Configuration
DATABASE_URL=sqlite://${dbFile}
JWT_SECRET=myshop-dev-secret-change-in-production
PORT=3000
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
NODE_ENV=development
`;
      console.log('✓ Configured for SQLite Local');
      break;

    case '4':
      envContent = `# Development Mode - Migrations Disabled
DATABASE_URL=postgresql://localhost/myshop_local
DISABLE_MIGRATIONS=true
JWT_SECRET=myshop-dev-secret-change-in-production
PORT=3000
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
NODE_ENV=development
`;
      console.log('✓ Configured for Test Mode (No Database)');
      break;

    case '5':
      console.log('Keeping current configuration');
      rl.close();
      return;

    default:
      console.log('Invalid option');
      rl.close();
      return;
  }

  try {
    fs.writeFileSync(serverEnvPath, envContent);
    console.log(`✓ .env file updated at ${serverEnvPath}\n`);
    console.log('Next steps:');
    console.log('1. npm run build     # Rebuild the application');
    console.log('2. npm run electron  # Start the app\n');
  } catch (error) {
    console.error('Error writing .env file:', error.message);
  }

  rl.close();
}

main().catch((error) => {
  console.error('Setup error:', error);
  rl.close();
  process.exit(1);
});
