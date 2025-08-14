const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const GIFEncoder = require('gifencoder');
const { createCanvas, loadImage } = require('canvas');
const sharp = require('sharp');

let Store;

(async () => {
  Store = (await import('electron-store')).default;
  startApp();
})();

function startApp() {
  const store = new Store();
  let mainWindow;

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      frame: false,
      roundedCorners: true,
      icon: path.join(__dirname, process.platform === 'win32' ? 'logo.ico' : 'logo.icns'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
      },
    });

    if (process.env.NODE_ENV === 'development') {
      mainWindow.loadURL('http://localhost:3000');
    } else {
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
  }

  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });


  ipcMain.handle('load-session', () => {
    return store.get('sessionsData');
  });

  ipcMain.handle('save-session', (_e, data) => {
    store.set('sessionsData', data);
    return true;
  });

  ipcMain.handle('reset-app', () => {
    store.clear();
    mainWindow.webContents.send('reset-blobs');
    return true;
  });

  ipcMain.handle('open-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    return canceled ? null : filePaths[0];
  });

  // Export Animated GIF
  ipcMain.handle('export-gif', async (_e, tabId, frames) => {
    try {
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Save Animated GIF',
        defaultPath: 'sprite.gif',
        filters: [{ name: 'GIF Files', extensions: ['gif'] }]
      });
      if (canceled || !filePath) return { canceled: true };

      // Load images, find max dimensions
      let maxW = 0, maxH = 0;
      const images = [];
      for (const f of frames) {
        const img = await loadImage(f.path);
        images.push(img);
        maxW = Math.max(maxW, img.width);
        maxH = Math.max(maxH, img.height);
      }

      const encoder = new GIFEncoder(maxW, maxH);
      const out = fs.createWriteStream(filePath);
      encoder.createReadStream().pipe(out);

      encoder.start();
      encoder.setRepeat(0);
      encoder.setDelay(100);
      encoder.setQuality(10);

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const canvas = createCanvas(maxW, maxH);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        encoder.addFrame(ctx);

        const progress = Math.round(((i + 1) / images.length) * 100);
        mainWindow.webContents.send('export-progress', { tabId, progress });
      }

      encoder.finish();
      await new Promise(r => out.on('finish', r));
      return { filePath };
    } catch (err) {
      console.error(err);
      return { error: err.message || String(err) };
    }
  });

  // Export PNG spritesheet (side-by-side)
  const MAX_SHEET_SIZE = 1024;

  ipcMain.handle('export-png', async (_e, tabId, framePaths) => {
    try {
      const outputFolder = await dialog.showOpenDialog({
        title: 'Select Folder to Save Spritesheets',
        properties: ['openDirectory'],
      });

      if (outputFolder.canceled || !Array.isArray(outputFolder.filePaths) || outputFolder.filePaths.length === 0) {
        return { canceled: true };
      }

      const folderPath = outputFolder.filePaths[0];
      const generatedPaths = [];
      const firstFrame = await loadImage(framePaths[0]);
      let frameWidth = firstFrame.width;
      let frameHeight = firstFrame.height;

      let resized = false;
      if (frameWidth > MAX_SHEET_SIZE || frameHeight > MAX_SHEET_SIZE) {
        resized = true;
        const scaleFactor = Math.min(
          MAX_SHEET_SIZE / frameWidth,
          MAX_SHEET_SIZE / frameHeight
        );
        frameWidth = Math.floor(frameWidth * scaleFactor);
        frameHeight = Math.floor(frameHeight * scaleFactor);

        framePaths = await Promise.all(
          framePaths.map(async (framePath) => {
            const resizedPath = path.join(folderPath, `resized_${path.basename(framePath)}`);
            await sharp(framePath)
              .resize(frameWidth, frameHeight, { fit: 'inside' })
              .toFile(resizedPath);
            return resizedPath;
          })
        );

        mainWindow.webContents.send('resize-warning', { tabId });
      }

      const maxCols = Math.floor(MAX_SHEET_SIZE / frameWidth);
      const maxRows = Math.floor(MAX_SHEET_SIZE / frameHeight);
      const framesPerSheet = maxCols * maxRows;

      if (framesPerSheet === 0) {
        return { error: 'Frame size too large for 1024×1024 limit.' };
      }

      const numSheets = Math.ceil(framePaths.length / framesPerSheet);

      for (let sheetIndex = 0; sheetIndex < numSheets; sheetIndex++) {
        const startFrame = sheetIndex * framesPerSheet;
        const endFrame = Math.min(startFrame + framesPerSheet, framePaths.length);
        const currentFrames = framePaths.slice(startFrame, endFrame);

        const cols = Math.min(maxCols, currentFrames.length);
        const rows = Math.ceil(currentFrames.length / cols);

        const sheetWidth = cols * frameWidth;
        const sheetHeight = rows * frameHeight;
        const canvas = createCanvas(sheetWidth, sheetHeight);
        const ctx = canvas.getContext('2d');

        for (let i = 0; i < currentFrames.length; i++) {
          const frame = await loadImage(currentFrames[i]);
          const x = (i % cols) * frameWidth;
          const y = Math.floor(i / cols) * frameHeight;
          ctx.drawImage(frame, x, y);

          // Send progress update
          const progress = Math.round(((sheetIndex * framesPerSheet + i + 1) / framePaths.length) * 100);
          mainWindow.webContents.send('export-progress', { tabId, progress });
        }

        const fileName = `${startFrame}-${endFrame - 1}.png`;
        const filePath = path.join(folderPath, fileName);
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(filePath, buffer);

        generatedPaths.push(filePath);
      }

      return {
        folderPath,
        resized,
        numSheets,
        frameWidth,
        frameHeight,
        filePaths: generatedPaths,
      };
    } catch (err) {
      console.error(err);
      return { error: err.message || String(err) };
    }
  });

  ipcMain.on('window-minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.restore();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('window-close', () => {
    mainWindow.close();
  });

  ipcMain.handle('load-app-state', () => {
    return store.get('appState', {
      showOutput: false,
      showHistory: false,
      historyFilterDate: null,
      outputLogs: [],
    });
  });

  ipcMain.handle('save-app-state', (_e, state) => {
    store.set('appState', state);
    return true;
  });

  ipcMain.handle('list-user-assets', async (_ev, creatorId, limit, cookie) => {
    const https = require('https');
    return new Promise((resolve, reject) => {
      const opts = {
        method: 'GET',
        hostname: 'itemconfiguration.roblox.com',
        path: `/v1/creations/get-assets?assetType=Image&userId=${creatorId}&sortOrder=Asc&limit=${limit}`,
        headers: { Cookie: `.ROBLOSECURITY=${cookie}` },
      };
      const req = https.request(opts, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const json = JSON.parse(data);
              const ids = json.data.map(a => a.assetId); // Extract asset IDs
              resolve(ids);
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error(`List assets failed (${res.statusCode}): ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
  });
}
