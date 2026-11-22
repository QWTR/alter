// Alter desktop shell: keeps the core running in the background (so agents work even with the
// window closed), shows the UI in a native window and lives in the system tray.
const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = Number(process.env.ALTER_PORT || 7420);
const URL = `http://localhost:${PORT}`;
const CORE = path.resolve(__dirname, '../../packages/core/src/cli.ts');

let core = null;
let win = null;
let tray = null;
let quitting = false;

async function isUp() {
  try {
    const r = await fetch(`${URL}/api/health`);
    return r.ok;
  } catch {
    return false;
  }
}

async function ensureCore() {
  if (await isUp()) return; // already running (e.g. `npm start` in a terminal)
  // v0.1 uses the system Node (>= 24, already required by the AI CLIs). Packaged builds will bundle it.
  core = spawn('node', [CORE, 'start', '--port', String(PORT)], { stdio: 'inherit', windowsHide: true, shell: process.platform === 'win32' });
  for (let i = 0; i < 50; i++) {
    if (await isUp()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Alter core did not start');
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 380,
    title: 'Alter',
    backgroundColor: '#0f0e13',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadURL(URL);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide(); // keep agents running in the background
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/svg+xml;base64,' +
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M16 2 30 16 16 30 2 16Z" fill="#8b7bff"/></svg>').toString('base64'),
  );
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('Alter');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Alter', click: () => win.show() },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } },
    ]),
  );
  tray.on('click', () => win.show());
}

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => win && win.show());

app.whenReady().then(async () => {
  await ensureCore();
  createWindow();
  createTray();
});

app.on('before-quit', () => {
  quitting = true;
  if (core) core.kill();
});
