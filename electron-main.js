const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const { getSessions } = require('./index');

const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

function loadState() {
  try   { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { width: 140, height: 200 }; }
}

function saveState(win) {
  const [width, height] = win.getSize();
  const [x, y]          = win.getPosition();
  fs.writeFileSync(STATE_FILE, JSON.stringify({ x, y, width, height }));
}

let win;

function createWindow() {
  const s = loadState();

  win = new BrowserWindow({
    x: s.x, y: s.y,
    width:  s.width,
    height: s.height,
    minWidth:  120,
    minHeight: 200,
    frame:       false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable:   true,
    hasShadow:   false,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  win.loadFile('renderer.html');

  win.on('close',   () => saveState(win));
  win.on('moved',   () => saveState(win));
  win.on('resized', () => saveState(win));

  // Push sessions every 3 s
  const push = () => {
    if (!win.isDestroyed()) win.webContents.send('sessions', getSessions());
  };
  push();
  const timer = setInterval(push, 3000);
  win.on('closed', () => clearInterval(timer));
}

ipcMain.on('setIgnoreMouseEvents', (_, ignore) =>
  win.setIgnoreMouseEvents(ignore, { forward: true })
);

ipcMain.on('setAlwaysOnTop', (_, flag) => {
  win.setAlwaysOnTop(flag, 'floating');
});

ipcMain.on('close',    () => win.close());
ipcMain.on('minimize', () => win.minimize());

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
