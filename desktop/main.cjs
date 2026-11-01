'use strict';
const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const gameURL = pathToFileURL(path.join(__dirname, 'index.html')).href;
function isGameDocument(target) {
  try { const url = new URL(target); url.hash = ''; url.search = ''; return url.href === gameURL; }
  catch (_) { return false; }
}

app.setName('Nine Realms');
let gameWindow = null;

function openGame() {
  gameWindow = new BrowserWindow({
    width: 1320,
    height: 960,
    minWidth: 420,
    minHeight: 680,
    title: '九境 · Nine Realms',
    backgroundColor: '#08151b',
    icon: path.join(__dirname, 'icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false
    }
  });
  gameWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Backup restore reloads only this exact bundled document; other navigation stays blocked.
  gameWindow.webContents.on('will-navigate', (event, url) => {
    if (!isGameDocument(url || event.url)) event.preventDefault();
  });
  gameWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  gameWindow.once('ready-to-show', () => gameWindow.show());
  gameWindow.on('closed', () => { gameWindow = null; });
  gameWindow.loadFile(path.join(__dirname, 'index.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!gameWindow) return;
    if (gameWindow.isMinimized()) gameWindow.restore();
    gameWindow.show();
    gameWindow.focus();
  });
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }));
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: '九境', submenu: [{ label: '退出游戏', role: 'quit' }] },
      { label: '视图', submenu: [
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { label: '实际大小', role: 'resetZoom' },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' }
      ] }
    ]));
    openGame();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openGame();
    });
  });
  app.on('window-all-closed', () => app.quit());
}
