const { app, BrowserWindow, ipcMain, shell, utilityProcess } = require('electron');
const path = require('node:path');
const { ExperimentManager } = require('./manager.cjs');
const observationServer = require('./observation-server.cjs');

const customData = process.argv.find((value) => value.startsWith('--lab-data-dir='));
if (customData) app.setPath('userData', path.resolve(customData.slice('--lab-data-dir='.length)));
let window;
let manager;
let server;
let quitting = false;
let boot;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(async () => {
    manager = new ExperimentManager({ dataDir: path.join(app.getPath('userData'), 'lab'),
      spawnNode: () => utilityProcess.fork(path.join(__dirname, 'node-worker.cjs'), [], { stdio: 'pipe', serviceName: '区块链实验节点' }) });
    manager.on('change', (state) => { if (window && !window.isDestroyed()) window.webContents.send('lab:state', state); });
    ipcMain.handle('lab:action', async (event, action, payload) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('无效操作来源');
      if (action === 'state') return manager.snapshot();
      if (action === 'openObservation') { if (manager.observationUrl) await shell.openExternal(manager.observationUrl); return manager.snapshot(); }
      if (action === 'openData') { await shell.openPath(manager.dataDir); return manager.snapshot(); }
      if (!['start', 'stop', 'connect', 'disconnect', 'add', 'mine'].includes(action)) throw new Error('不支持的操作');
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('操作参数无效');
      return manager.action(action, payload);
    });
    window = new BrowserWindow({ width: 1360, height: 920, minWidth: 920, minHeight: 660, title: '区块链教学控制台',
      backgroundColor: '#edf1f5', autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    await window.loadFile(path.join(__dirname, 'ui/index.html'));
    boot = (async () => {
      try {
        server = await observationServer(manager, path.join(__dirname, '../frontend/dist'));
        await manager.initialize();
      } catch (error) { manager.error = error.message; manager.ready = true; manager.changed(); }
    })();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void (async () => {
      await boot;
      await manager?.close();
      if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
      app.quit();
    })().catch((error) => { console.error(error.message); app.exit(1); });
  });
}
