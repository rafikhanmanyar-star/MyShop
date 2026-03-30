const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

let serverProcess = null;
let mainWindow = null;
let autoUpdater = null;
let updateCheckIntervalId = null;
let lastNotifiedUpdateVersion = null;
if (app.isPackaged) {
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (_) { }
}

function sendUpdateStatus(...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', ...args);
  }
}
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
      const msg = `[Server] ${data.toString().trim()}`;
      console.log(msg);
      fs.appendFileSync(path.join(path.dirname(app.getPath('exe')), 'server_logs.txt'), msg + '\n');
    });
    serverProcess.stderr.on('data', (data) => {
      const msg = `[Server ERROR] ${data.toString().trim()}`;
      console.error(msg);
      fs.appendFileSync(path.join(path.dirname(app.getPath('exe')), 'server_logs.txt'), msg + '\n');
    });
    serverProcess.on('error', (err) => {
      fs.appendFileSync(path.join(path.dirname(app.getPath('exe')), 'server_logs.txt'), `[Server Spawn Error] ${err}\n`);
      reject(err);
    });
    serverProcess.on('close', (code) => {
      if (code !== 0 && code !== null) {
        fs.appendFileSync(path.join(path.dirname(app.getPath('exe')), 'server_logs.txt'), `[Server] Exited with code ${code}\n`);
        console.error(`[Server] Exited with code ${code}`);
      }
    });

    const maxAttempts = 60;
    let attempts = 0;
    const checkReady = () => {
      attempts++;
      const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try { JSON.parse(body); resolve(); } catch { retryReady(); }
        });
      });
      req.on('error', retryReady);
      req.setTimeout(3000, () => { req.destroy(); retryReady(); });

      function retryReady() {
        if (attempts >= maxAttempts) {
          reject(new Error('Server failed to start in time'));
        } else {
          setTimeout(checkReady, 500);
        }
      }
    };
    setTimeout(checkReady, 1000);
  });
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    focusable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: preloadPath,
      backgroundThrottling: false,
    },
    show: false,
  });
  mainWindow = win;

  win.on('blur', () => {
    if (process.env.ELECTRON_FOCUS_DEBUG) console.log('[BrowserWindow] blur');
  });
  win.on('focus', () => {
    if (process.env.ELECTRON_FOCUS_DEBUG) console.log('[BrowserWindow] focus');
  });

  if (isCloud) {
    const clientPath = getClientDistPath();
    const indexPath = path.join(clientPath, 'index.html');
    // file:// loads must use relative asset URLs (./assets/...) from `npm run build:cloud`.
    // A plain client `vite build` emits /assets/... which resolves to the drive root and 404s.
    win.loadFile(indexPath);
  } else {
    win.loadURL(`http://localhost:${PORT}`);
  }

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    mainWindow = null;
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
  });
}

function printReceiptSilent(html, printerName) {
  return new Promise((resolve) => {
    const tmpFile = path.join(app.getPath('temp'), `receipt-${Date.now()}.html`);
    try {
      fs.writeFileSync(tmpFile, html, 'utf-8');
    } catch (err) {
      console.error('Failed to write temp receipt file:', err);
      return resolve(false);
    }

    const win = new BrowserWindow({
      width: 300,
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { fs.unlinkSync(tmpFile); } catch (_) { }
      // Hidden print window can steal keyboard focus from the main window; restore it.
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.focus();
      }
      resolve(result);
    };

    win.on('closed', () => finish(false));

    win.loadFile(tmpFile).then(() => {
      // Need enough time for Chromium to calculate layout before printing
      setTimeout(() => {
        const opts = {
          silent: true,
          printBackground: true,
          margins: { marginType: 'none' }, // Bypass default browser margins
          landscape: false,
          color: false,
        };
        // Ensure deviceName gets added properly if provided
        if (printerName && printerName.trim() !== '') {
          opts.deviceName = printerName.trim();
        }

        try {
          win.webContents.print(opts, (success, err) => {
            win.close();
            finish(success && !err);
          });
        } catch (printErr) {
          console.error("Print Error:", printErr);
          win.close();
          finish(false);
        }
      }, 1500);
    }).catch((err) => {
      console.error('Receipt load failed:', err);
      win.close();
      finish(false);
    });
  });
}

function setupUpdaterIPC() {
  ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('print-receipt-silent', (_event, { html, printerName }) =>
    printReceiptSilent(html, printerName || undefined)
  );
  ipcMain.handle('check-for-updates', async () => {
    if (!app.isPackaged || !autoUpdater) {
      sendUpdateStatus({ status: 'unavailable', message: 'Updates only work in the installed app.' });
      return;
    }
    try {
      sendUpdateStatus({ status: 'checking' });
      await autoUpdater.checkForUpdates();
    } catch (err) {
      sendUpdateStatus({ status: 'error', message: err && err.message ? err.message : String(err) });
    }
  });
  ipcMain.handle('start-update-download', () => {
    if (autoUpdater) return autoUpdater.downloadUpdate();
  });
  ipcMain.handle('quit-and-install', () => {
    if (autoUpdater) autoUpdater.quitAndInstall(false, true);
  });

  if (autoUpdater) {
    autoUpdater.autoDownload = false;
    autoUpdater.on('update-available', (info) => {
      sendUpdateStatus({ status: 'available', version: info.version });
      if (info.version && info.version !== lastNotifiedUpdateVersion) {
        lastNotifiedUpdateVersion = info.version;
        const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
        dialog.showMessageBox(win, {
          type: 'info',
          title: 'Update available',
          message: `MyShop ${info.version} is available.`,
          detail: 'Would you like to download and install it now?',
          buttons: ['Download and install', 'Later'],
          defaultId: 0,
          cancelId: 1,
        }).then(({ response }) => {
          if (response === 0) autoUpdater.downloadUpdate();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.focus();
            mainWindow.webContents.focus();
          }
        });
      }
    });
    autoUpdater.on('update-not-available', () => {
      sendUpdateStatus({ status: 'not-available' });
    });
    autoUpdater.on('download-progress', (p) => {
      sendUpdateStatus({ status: 'downloading', percent: p.percent });
    });
    autoUpdater.on('update-downloaded', () => {
      sendUpdateStatus({ status: 'downloaded' });
    });
    autoUpdater.on('error', (err) => {
      sendUpdateStatus({ status: 'error', message: err && err.message ? err.message : String(err) });
    });
  }
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
          const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
              try { JSON.parse(body); resolve(); } catch { retry(); }
            });
          });
          req.on('error', retry);
          req.setTimeout(3000, () => { req.destroy(); retry(); });

          function retry() {
            if (++attempts >= maxAttempts) reject(new Error('Server not ready. Run "npm run dev:server" first.'));
            else setTimeout(check, 500);
          }
        };
        setTimeout(check, 500);
      });
    }
    createWindow();
    setupUpdaterIPC();
    if (autoUpdater && app.isPackaged) {
      const oneMinuteMs = 60 * 1000;
      updateCheckIntervalId = setInterval(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          autoUpdater.checkForUpdates().catch(() => { });
        }
      }, oneMinuteMs);
    }
  } catch (err) {
    console.error('Failed to start:', err);
    const message = err && err.message ? err.message : String(err);
    dialog.showErrorBox('MyShop failed to start', message + '\n\nFrom project root run: npm run build then npm run electron');
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (updateCheckIntervalId) {
    clearInterval(updateCheckIntervalId);
    updateCheckIntervalId = null;
  }
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  app.quit();
});
