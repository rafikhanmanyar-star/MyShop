const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let serverProcess = null;
const PORT = 3000;
const isDev = process.argv.includes('--dev');

function detectCloudMode() {
  if (process.argv.includes('--cloud')) return true;
  if (app.isPackaged) {
    const serverDistPath = path.join(process.resourcesPath, 'server', 'dist', 'api', 'index.js');
    return !fs.existsSync(serverDistPath);
  }
  return false;
}

const isCloud = detectCloudMode();

function getServerPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'server');
  }
  return path.join(app.getAppPath(), 'server');
}

function getClientDistPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'client', 'dist');
  }
  return path.join(app.getAppPath(), 'client', 'dist');
}

function loadEnv(...configPaths) {
  for (const configPath of configPaths) {
    const envPath = path.join(configPath, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      const env = {};
      content.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
          env[match[1].trim()] = match[2].trim();
        }
      });
      return env;
    }
  }
  return {};
}

function startServer() {
  return new Promise((resolve, reject) => {
    const serverPath = getServerPath();
    const clientDistPath = getClientDistPath();

    const serverMainPath = path.join(serverPath, 'dist', 'api', 'index.js');
    if (!fs.existsSync(serverMainPath)) {
      return reject(new Error('Server build not found. Run "npm run build" first.'));
    }

    const envPaths = app.isPackaged
      ? [path.join(app.getPath('userData'), 'myshop'), path.join(app.getPath('exe'), '..'), serverPath]
      : [serverPath];
    const loadedEnv = loadEnv(...envPaths);
    const env = {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'production',
      CORS_ORIGIN: `http://localhost:${PORT}`,
      CLIENT_DIST_PATH: clientDistPath,
      ...loadedEnv,
    };

    serverProcess = spawn('node', [serverMainPath], {
      cwd: serverPath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (data) => {
      console.log(`[Server] ${data.toString().trim()}`);
    });
    serverProcess.stderr.on('data', (data) => {
      console.error(`[Server] ${data.toString().trim()}`);
    });
    serverProcess.on('error', reject);
    serverProcess.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[Server] Exited with code ${code}`);
      }
    });

    const maxAttempts = 60;
    let attempts = 0;
    const checkReady = () => {
      attempts++;
      fetch(`http://localhost:${PORT}/api/health`)
        .then((res) => res.json())
        .then(() => resolve())
        .catch(() => {
          if (attempts >= maxAttempts) {
            reject(new Error('Server failed to start in time'));
          } else {
            setTimeout(checkReady, 500);
          }
        });
    };
    setTimeout(checkReady, 1000);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  if (isCloud) {
    const clientPath = getClientDistPath();
    const indexPath = path.join(clientPath, 'index.html');
    win.loadFile(indexPath);
  } else {
    win.loadURL(`http://localhost:${PORT}`);
  }

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
  });
}

app.whenReady().then(async () => {
  try {
    if (isCloud) {
      // Cloud mode: no local server, client talks directly to Render API
    } else if (!isDev) {
      await startServer();
    } else {
      await new Promise((resolve, reject) => {
        const maxAttempts = 60;
        let attempts = 0;
        const check = () => {
          fetch(`http://localhost:${PORT}/api/health`)
            .then((res) => res.json())
            .then(() => resolve())
            .catch(() => {
              if (++attempts >= maxAttempts) reject(new Error('Server not ready. Run "npm run dev:server" first.'));
              else setTimeout(check, 500);
            });
        };
        setTimeout(check, 500);
      });
    }
    createWindow();
  } catch (err) {
    console.error('Failed to start:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  app.quit();
});
