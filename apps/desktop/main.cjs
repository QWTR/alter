// Alter desktop app: runs the Alter core inside the app (Electron ships Node 24 with SQLite, so
// users don't need Node installed), shows the UI in a window and lives in the system tray so
// agents keep working with the window closed. Starts with Windows (hidden) by default.
const { app, BrowserWindow, Tray, Menu, nativeImage, shell, Notification } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const PORT = Number(process.env.ALTER_PORT || 7420);
const URL = `http://localhost:${PORT}`;
const startHidden = process.argv.includes('--hidden');

let win = null;
let tray = null;
let core = null;
let quitting = false;
let hintShown = false;

const res = (...p) => (app.isPackaged ? path.join(process.resourcesPath, ...p) : null);

async function isUp() {
  try {
    const r = await fetch(`${URL}/api/health`);
    return r.ok && (await r.json()).name === 'alter';
  } catch {
    return false;
  }
}

async function startCore() {
  if (await isUp()) return; // another Alter (e.g. `npm start` in a terminal) already serves this port
  process.env.ALTER_WEB_DIR ??= res('web') ?? path.resolve(__dirname, '../web');
  process.env.ALTER_SKILLS_DIR ??= res('skills') ?? path.resolve(__dirname, '../../skills');
  const { start } = await import(pathToFileURL(path.join(__dirname, 'dist', 'core.mjs')).href);
  core = await start({ port: PORT, quiet: true });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 380,
    minHeight: 500,
    title: 'Alter',
    show: !startHidden,
    backgroundColor: '#0f0e13',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadURL(URL);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!hintShown && Notification.isSupported()) {
      hintShown = true;
      new Notification({ title: 'Alter is still running', body: 'Your agents keep working in the background. Open Alter from the tray icon.' }).show();
    }
  });
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function trayMenu() {
  const autostart = app.getLoginItemSettings().openAtLogin;
  return Menu.buildFromTemplate([
    { label: 'Open Alter', click: showWindow },
    { label: 'Open in browser', click: () => shell.openExternal(URL) },
    { type: 'separator' },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: autostart,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] });
        tray.setContextMenu(trayMenu());
      },
    },
    { type: 'separator' },
    { label: 'Quit Alter', click: () => { quitting = true; app.quit(); } },
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('Alter');
  tray.setContextMenu(trayMenu());
  tray.on('click', showWindow);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.setAppUserModelId('dev.alter.app');

  app.whenReady().then(async () => {
    try {
      await startCore();
    } catch (err) {
      const { dialog } = require('electron');
      dialog.showErrorBox('Alter could not start', String(err && err.stack ? err.stack : err));
      app.exit(1);
      return;
    }
    // First launch of the installed app: start with Windows, hidden in the tray.
    if (app.isPackaged && !process.env.ALTER_NO_AUTOSTART && !app.getLoginItemSettings().wasOpenedAtLogin && !require('node:fs').existsSync(path.join(app.getPath('userData'), '.configured'))) {
      app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
      require('node:fs').writeFileSync(path.join(app.getPath('userData'), '.configured'), new Date().toISOString());
    }
    createWindow();
    createTray();
  });

  app.on('window-all-closed', (e) => e.preventDefault()); // stay in the tray
  app.on('before-quit', () => {
    quitting = true;
    if (core) core.close();
  });
}
