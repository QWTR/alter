// ALTTER desktop app: runs the ALTTER core inside the app (Electron ships Node 24 with SQLite, so
// users don't need Node installed), shows the UI in a window and lives in the system tray so
// agents keep working with the window closed. Starts with Windows (hidden) by default.
const { app, BrowserWindow, Tray, Menu, nativeImage, shell, Notification, ipcMain, screen, globalShortcut } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const PORT = Number(process.env.ALTER_PORT || 7420);
const URL = `http://localhost:${PORT}`;
const startHidden = process.argv.includes('--hidden');

let win = null;
let tray = null;
let core = null;
let coreApi = null;
let quitting = false;
let hintShown = false;

const res = (...p) => (app.isPackaged ? path.join(process.resourcesPath, ...p) : null);

// ---------- tiny UI strings for the tray + notifications ----------
const STRINGS = {
  en: { open: 'Open ALTTER', browser: 'Open in browser', data: 'Open data folder', autostart: 'Start with Windows', quit: 'Quit ALTTER', bgTitle: 'ALTTER is still running', bgBody: 'Your agents keep working in the background. Open ALTTER from the tray icon.', down: '{name} is down', up: '{name} is back up', done: '{name} finished', failed: '{name} ran into a problem' },
  pl: { open: 'Otwórz ALTTER-a', browser: 'Otwórz w przeglądarce', data: 'Otwórz folder z danymi', autostart: 'Uruchamiaj z Windows', quit: 'Zamknij ALTTER-a', bgTitle: 'ALTTER dalej działa', bgBody: 'Twoi agenci pracują w tle. Otwórz ALTTER-a z ikony w zasobniku.', down: '{name} nie działa', up: '{name} znów działa', done: '{name} skończył', failed: '{name} napotkał problem' },
  de: { open: 'ALTTER öffnen', browser: 'Im Browser öffnen', data: 'Datenordner öffnen', autostart: 'Mit Windows starten', quit: 'ALTTER beenden', bgTitle: 'ALTTER läuft weiter', bgBody: 'Deine Agenten arbeiten im Hintergrund weiter.', down: '{name} ist ausgefallen', up: '{name} läuft wieder', done: '{name} ist fertig', failed: '{name} hatte ein Problem' },
  es: { open: 'Abrir ALTTER', browser: 'Abrir en el navegador', data: 'Abrir carpeta de datos', autostart: 'Iniciar con Windows', quit: 'Salir de ALTTER', bgTitle: 'ALTTER sigue en marcha', bgBody: 'Tus agentes siguen trabajando en segundo plano.', down: '{name} no responde', up: '{name} vuelve a funcionar', done: '{name} terminó', failed: '{name} tuvo un problema' },
  fr: { open: 'Ouvrir ALTTER', browser: 'Ouvrir dans le navigateur', data: 'Ouvrir le dossier des données', autostart: 'Lancer avec Windows', quit: 'Quitter ALTTER', bgTitle: 'ALTTER tourne toujours', bgBody: 'Vos agents continuent en arrière-plan.', down: '{name} est en panne', up: '{name} fonctionne à nouveau', done: '{name} a terminé', failed: '{name} a rencontré un problème' },
  uk: { open: 'Відкрити ALTTER', browser: 'Відкрити в браузері', data: 'Відкрити теку з даними', autostart: 'Запускати з Windows', quit: 'Вийти з ALTTER', bgTitle: 'ALTTER працює далі', bgBody: 'Ваші агенти працюють у фоні.', down: '{name} не працює', up: '{name} знову працює', done: '{name} завершив', failed: '{name} має проблему' },
};
function s(key, vars = {}) {
  let lang = 'en';
  try {
    lang = coreApi?.loadConfig().language || 'en';
  } catch {}
  const text = (STRINGS[lang] || STRINGS.en)[key] || STRINGS.en[key];
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

// ---------- where the data lives ----------
// Installed app: next to the program, e.g. D:\ALTTER\data and D:\ALTTER\projects (the installer keeps
// both on update/uninstall). Falls back to ~/.alter when the install folder is not writable.
function setupDataDirs() {
  if (process.env.ALTER_HOME || !app.isPackaged) return;
  let base = path.dirname(process.execPath);
  // renamed to ALTTER: the installer may now put the app in <old folder>\ALTTER — keep using the data next to it
  const parent = path.dirname(base);
  if (!fs.existsSync(path.join(base, 'data', 'config.json')) && fs.existsSync(path.join(parent, 'data', 'config.json'))) base = parent;
  const data = path.join(base, 'data');
  try {
    fs.mkdirSync(data, { recursive: true });
    fs.accessSync(data, fs.constants.W_OK);
  } catch {
    return; // read-only location → default ~/.alter
  }
  // one-time migration from v0.1 (~/.alter)
  const legacy = path.join(os.homedir(), '.alter');
  if (!fs.existsSync(path.join(data, 'config.json')) && fs.existsSync(path.join(legacy, 'config.json'))) {
    try {
      fs.cpSync(legacy, data, { recursive: true, errorOnExist: false, force: false });
    } catch {}
  }
  process.env.ALTER_HOME = data;
  process.env.ALTER_PROJECTS_DIR ??= path.join(base, 'projects');
}

async function isUp() {
  try {
    const r = await fetch(`${URL}/api/health`);
    return r.ok && (await r.json()).name === 'alter';
  } catch {
    return false;
  }
}

async function startCore() {
  if (await isUp()) return; // another ALTTER (e.g. `npm start` in a terminal) already serves this port
  setupDataDirs();
  process.env.ALTER_WEB_DIR ??= res('web') ?? path.resolve(__dirname, '../web');
  process.env.ALTER_SKILLS_DIR ??= res('skills') ?? path.resolve(__dirname, '../../skills');
  process.env.ALTER_STUDIO_KIT_DIR ??= res('studio-kit') ?? path.resolve(__dirname, '../../studio-kit');
  process.env.ALTER_RELAY_DIR ??= res('relay') ?? path.resolve(__dirname, '../relay');
  coreApi = await import(pathToFileURL(path.join(__dirname, 'dist', 'core.mjs')).href);
  core = await coreApi.start({ port: PORT, quiet: true });
  coreApi.bus.on('event', onCoreEvent);
}

// ---------- native notifications (only while the window isn't in front) ----------
function notify(title, body, route) {
  if (!Notification.isSupported() || (win && win.isVisible() && win.isFocused())) return;
  const n = new Notification({ title, body: (body || '').slice(0, 200), icon: path.join(__dirname, 'build', 'icon.png') });
  n.on('click', () => {
    showWindow();
    if (route && /^\/[\w/-]*$/.test(route)) win?.webContents.executeJavaScript(`location.hash = ${JSON.stringify('#' + route)}`).catch(() => {});
  });
  n.show();
}
function onCoreEvent({ type, data }) {
  if (type.startsWith('hands.') && type !== 'hands.board') return toOverlay(type, data);
  // alerts (site down / back up / what the agent found) — the same the phones get, opens that chat on click
  if (type === 'notify' && !String(data.tag || '').startsWith('run-') && data.tag !== 'test') notify(data.title, data.body, data.url);
  if (type === 'run.finished' && data.trigger === 'schedule') {
    const plain = String(data.output || data.error || '').replace(/[#*_`>]/g, '').trim();
    notify(s(data.status === 'done' ? 'done' : 'failed', { name: data.agent_name }), plain);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 380,
    minHeight: 500,
    title: 'ALTTER',
    show: false,
    backgroundColor: '#0b0a12',
    autoHideMenuBar: true,
    // our own title bar (minimise / maximise / close) is drawn by the UI
    frame: false,
    thickFrame: true,
    roundedCorners: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, preload: path.join(__dirname, 'preload.cjs') },
  });
  win.loadURL(URL);
  const state = () => win && !win.isDestroyed() && win.webContents.send('win:state', { maximized: win.isMaximized(), fullscreen: win.isFullScreen(), focused: win.isFocused() });
  for (const ev of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'focus', 'blur']) win.on(ev, state);
  // the window only ever shows ALTTER itself; links open in the browser
  // (a shared-chat link opens in its own ALTTER window instead)
  const isShare = (url) => /^https?:\/\/[^#]+\/#\/[sw]\/[\w-]{10,}/.test(url);
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(URL)) {
      e.preventDefault();
      if (isShare(url)) ipcMain.emit('win:openSession', null, url);
      else shell.openExternal(url);
    }
  });
  win.once('ready-to-show', () => !startHidden && win.show()); // no white flash
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isShare(url)) ipcMain.emit('win:openSession', null, url);
    else shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!hintShown && Notification.isSupported()) {
      hintShown = true;
      new Notification({ title: s('bgTitle'), body: s('bgBody') }).show();
    }
  });
}

ipcMain.on('win:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on('win:maximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) w.isMaximized() ? w.unmaximize() : w.maximize();
});
ipcMain.on('win:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.handle('win:isMaximized', (e) => !!BrowserWindow.fromWebContents(e.sender)?.isMaximized());

// ---------- joining someone else's shared chat / workspace: inside the main window (never a second one) ----------
// The web UI shows it in a sandboxed frame next to the sidebar (#/visit?u=…), so the other page gets no desktop bridge.
ipcMain.on('win:openSession', (_e, raw) => {
  let u;
  try { u = new globalThis.URL(raw); } catch { return; }
  if (!/^https?:$/.test(u.protocol) || !/^#\/[sw]\/[\w-]{10,}/.test(u.hash)) return;
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.webContents.executeJavaScript('location.hash = ' + JSON.stringify('#/visit?u=' + encodeURIComponent(u.href)), true).catch(() => {});
});

// ---------- agents on the screen: their cursors, drawn over every monitor ----------
let overlays = [];
let overlayClose = null;
function ensureOverlays() {
  clearTimeout(overlayClose);
  if (overlays.length) return;
  const primaryId = screen.getPrimaryDisplay().id;
  let lang = 'en';
  try { lang = coreApi?.loadConfig().language || 'en'; } catch {}
  for (const d of screen.getAllDisplays()) {
    const w = new BrowserWindow({
      x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
      transparent: true, frame: false, alwaysOnTop: true, focusable: false, skipTaskbar: true, hasShadow: false,
      resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false, show: false,
      backgroundColor: '#00000000',
      webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, preload: path.join(__dirname, 'overlay', 'overlay-preload.cjs') },
    });
    w.setIgnoreMouseEvents(true, { forward: true });
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setContentProtection(true); // the screenshots the agents take don't show their own cursors
    const o = { win: w, display: d, ready: false, queue: [] };
    w.webContents.once('did-finish-load', () => {
      o.ready = true;
      for (const m of o.queue.splice(0)) w.webContents.send('hands', m);
      w.showInactive();
    });
    w.loadFile(path.join(__dirname, 'overlay', 'overlay.html'), { query: { primary: d.id === primaryId ? '1' : '0', lang } });
    overlays.push(o);
  }
  globalShortcut.register('Control+Alt+Q', () => coreApi?.stopAllHands());
}
function closeOverlays() {
  for (const o of overlays) if (!o.win.isDestroyed()) o.win.destroy();
  overlays = [];
  globalShortcut.unregister('Control+Alt+Q');
}
const dip = (x, y) => (process.platform === 'win32' ? screen.screenToDipPoint({ x, y }) : { x, y });
function toOverlay(type, data) {
  if (type === 'hands.session' && !data.open) {
    // last agent done: the overlay fades away a moment later
    if (!coreApi.handsSessions().length) overlayClose = setTimeout(closeOverlays, 2500);
  } else ensureOverlays();
  const p = typeof data.x === 'number' ? dip(data.x, data.y) : null;
  const fr = typeof data.fromX === 'number' ? dip(data.fromX, data.fromY) : null;
  const p2 = typeof data.x2 === 'number' ? dip(data.x2, data.y2) : null;
  for (const o of overlays) {
    const b = o.display.bounds;
    const m = { type, ...data, w: b.width, h: b.height, lx: p ? p.x - b.x : undefined, ly: p ? p.y - b.y : undefined, lfromX: fr ? fr.x - b.x : undefined, lfromY: fr ? fr.y - b.y : undefined, lx2: p2 ? p2.x - b.x : undefined, ly2: p2 ? p2.y - b.y : undefined };
    if (o.ready) o.win.webContents.send('hands', m);
    else o.queue.push(m);
  }
}
ipcMain.on('overlay:interactive', (e, on) => BrowserWindow.fromWebContents(e.sender)?.setIgnoreMouseEvents(!on, { forward: true }));
ipcMain.on('overlay:stop', () => coreApi?.stopAllHands());

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function trayMenu() {
  const autostart = app.getLoginItemSettings().openAtLogin;
  return Menu.buildFromTemplate([
    { label: s('open'), click: showWindow },
    { label: s('browser'), click: () => shell.openExternal(URL) },
    { label: s('data'), click: () => shell.openPath(process.env.ALTER_HOME || path.join(os.homedir(), '.alter')) },
    { type: 'separator' },
    {
      label: s('autostart'),
      type: 'checkbox',
      checked: autostart,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] });
        tray.setContextMenu(trayMenu());
      },
    },
    { type: 'separator' },
    { label: s('quit'), click: () => { quitting = true; app.quit(); } },
  ]);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('ALTTER');
  tray.setContextMenu(trayMenu());
  tray.on('click', showWindow);
  // the language may change in Settings — rebuild the menu labels each time it opens
  tray.on('right-click', () => tray.setContextMenu(trayMenu()));
}

// a separate Electron profile lets a test build run next to the installed app
if (process.env.ALTER_USER_DATA) app.setPath('userData', process.env.ALTER_USER_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // altter://join?u=<invite link> — "Open in the app" on an invite page, or a link someone sent
  const fromArgs = (argv) => {
    const raw = (argv || []).find((a) => /^altter:\/\//i.test(String(a)));
    if (!raw) return false;
    try {
      const link = new globalThis.URL(raw).searchParams.get('u');
      if (link) { app.whenReady().then(() => { showWindow(); ipcMain.emit('win:openSession', null, link); }); return true; }
    } catch {}
    return false;
  };
  if (process.defaultApp) app.setAsDefaultProtocolClient('altter', process.execPath, [path.resolve(process.argv[1])]);
  else app.setAsDefaultProtocolClient('altter');
  app.on('second-instance', (_e, argv) => { if (!fromArgs(argv)) showWindow(); });
  app.on('open-url', (e, url) => { e.preventDefault(); fromArgs([url]); });
  if (process.argv.some((a) => /^altter:\/\//i.test(a))) setTimeout(() => fromArgs(process.argv), 2500);
  app.setAppUserModelId('dev.alter.app');

  app.whenReady().then(async () => {
    try {
      await startCore();
    } catch (err) {
      const { dialog } = require('electron');
      dialog.showErrorBox('ALTTER could not start', String(err && err.stack ? err.stack : err));
      app.exit(1);
      return;
    }
    // First launch of the installed app: start with Windows, hidden in the tray.
    if (app.isPackaged && !process.env.ALTER_NO_AUTOSTART && !app.getLoginItemSettings().wasOpenedAtLogin && !fs.existsSync(path.join(app.getPath('userData'), '.configured'))) {
      app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
      fs.writeFileSync(path.join(app.getPath('userData'), '.configured'), new Date().toISOString());
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
