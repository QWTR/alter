// Renders the ALTTER logo (apps/web/public/icon.svg) and the installer artwork with Electron's own
// Chromium, then writes PNG / ICO / BMP files into build/. Run: `electron scripts/render-art.cjs`.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'build');
const svg = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'public', 'icon.svg'), 'utf8');
const svgUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const page = (w, h, body) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:transparent}
  *{box-sizing:border-box}
  body{font-family:'Segoe UI Variable Display','Segoe UI',sans-serif;-webkit-font-smoothing:antialiased}
</style></head><body>${body}</body></html>`;

const icon = (s) => page(s, s, `<img src="${svgUri}" width="${s}" height="${s}" style="display:block">`);

// tray: the "A" mark only, no tile, so it reads on light and dark taskbars
const tray = (s) => page(s, s, `<svg viewBox="96 96 320 320" width="${s}" height="${s}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9d0ff"/><stop offset="1" stop-color="#8b74ff"/></linearGradient></defs>
  <path d="M146 384 L256 124 L366 384" fill="none" stroke="url(#g)" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="256" cy="304" r="40" fill="#5ad7ff"/></svg>`);

// phone notifications: Android draws the badge from its alpha only, so a white "A" on transparent
const badge = (s) => page(s, s, `<svg viewBox="96 96 320 320" width="${s}" height="${s}"><path d="M146 384 L256 124 L366 384" fill="none" stroke="#fff" stroke-width="60" stroke-linecap="round" stroke-linejoin="round"/><circle cx="256" cy="304" r="42" fill="#fff"/></svg>`);
const WEB = path.join(__dirname, '..', '..', 'web', 'public');

const bg = `background:radial-gradient(120% 70% at 20% 0%, #3a2a85 0%, transparent 60%),radial-gradient(90% 60% at 100% 100%, #0e5a7a 0%, transparent 60%),linear-gradient(170deg,#17122e,#0b0a12);`;

const sidebar = page(164, 314, `<div style="width:164px;height:314px;${bg}color:#fff;position:relative;padding:26px 18px">
  <img src="${svgUri}" width="64" height="64" style="display:block;border-radius:16px;box-shadow:0 12px 30px rgba(124,92,255,.55)">
  <div style="margin-top:18px;font-size:26px;font-weight:700;letter-spacing:-.5px">ALTTER</div>
  <div style="margin-top:6px;font-size:11.5px;line-height:1.45;color:#c9c3f0">AI · agents · memory</div>
  <div style="position:absolute;left:18px;right:18px;bottom:20px;height:1px;background:linear-gradient(90deg,#8b74ff,transparent)"></div>
  <div style="position:absolute;left:18px;bottom:30px;font-size:10px;color:#8c89a3">open source · AGPL-3.0</div>
</div>`);

const header = page(150, 57, `<div style="width:150px;height:57px;background:#fff;display:flex;align-items:center;justify-content:flex-end;padding-right:10px;gap:8px">
  <span style="font-size:17px;font-weight:700;color:#17122e;letter-spacing:-.3px">ALTTER</span>
  <img src="${svgUri}" width="38" height="38" style="border-radius:10px">
</div>`);

let n = 0;
async function render(html, w, h) {
  const win = new BrowserWindow({ width: w, height: h, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true } });
  let last = null;
  win.webContents.on('paint', (_e, _dirty, image) => (last = image));
  const file = path.join(require('node:os').tmpdir(), `alter-art-${process.pid}-${n++}.html`);
  fs.writeFileSync(file, html);
  await win.loadFile(file);
  fs.rmSync(file, { force: true });
  win.webContents.invalidate();
  const t0 = Date.now();
  while ((!last || Date.now() - t0 < 300) && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 50));
  if (!last) throw new Error('no frame painted');
  const img = last;
  win.destroy();
  return img.getSize().width === w ? img : img.resize({ width: w, height: h, quality: 'best' });
}

function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)]);
}

// 24-bit bottom-up BMP (what NSIS wants for installer images)
function bmp(img) {
  const { width: w, height: h } = img.getSize();
  const bgra = img.toBitmap();
  const row = Math.ceil((w * 3) / 4) * 4;
  const buf = Buffer.alloc(54 + row * h);
  buf.write('BM', 0);
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(w, 18);
  buf.writeInt32LE(h, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(row * h, 34);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = 54 + (h - 1 - y) * row + x * 3;
      buf[d] = bgra[s];
      buf[d + 1] = bgra[s + 1];
      buf[d + 2] = bgra[s + 2];
    }
  }
  return buf;
}

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {}); // keep going between renders
app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = [];
  for (const s of sizes) {
    let data = Buffer.alloc(0);
    for (let i = 0; i < 4 && !data.length; i++) data = (await render(icon(s), s, s)).toPNG(); // first capture can come back empty
    if (data.length) pngs.push({ size: s, data });
  }
  fs.writeFileSync(path.join(OUT, 'icon.ico'), ico(pngs));
  fs.writeFileSync(path.join(OUT, 'icon.png'), (await render(icon(512), 512, 512)).toPNG());
  fs.writeFileSync(path.join(OUT, 'tray.png'), (await render(tray(16), 16, 16)).toPNG());
  fs.writeFileSync(path.join(OUT, 'tray@2x.png'), (await render(tray(32), 32, 32)).toPNG());
  fs.writeFileSync(path.join(OUT, 'installerSidebar.bmp'), bmp(await render(sidebar, 164, 314)));
  fs.writeFileSync(path.join(OUT, 'uninstallerSidebar.bmp'), bmp(await render(sidebar, 164, 314)));
  fs.writeFileSync(path.join(OUT, 'installerHeader.bmp'), bmp(await render(header, 150, 57)));
  fs.writeFileSync(path.join(OUT, 'sidebar-preview.png'), (await render(sidebar, 164, 314)).toPNG());
  fs.writeFileSync(path.join(WEB, 'icon-192.png'), (await render(icon(192), 192, 192)).toPNG());
  fs.writeFileSync(path.join(WEB, 'icon-512.png'), (await render(icon(512), 512, 512)).toPNG());
  fs.writeFileSync(path.join(WEB, 'badge.png'), (await render(badge(96), 96, 96)).toPNG());
  console.log('artwork written to', OUT);
  app.quit();
}).catch((err) => {
  console.error(err);
  app.exit(1);
});
