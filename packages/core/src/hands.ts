// "Hands": the AI uses the computer like a person — it looks at the screen, moves the mouse, clicks and types.
// Each agent gets its own visible cursor (name + colour) drawn over the desktop by the desktop app, so you see who does what.
// Real input is one mouse and one keyboard: actions from several agents are queued, one at a time.
// Exposed to the AI CLIs as an MCP server over HTTP at /mcp/hands/<session token>.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, saveConfig } from './config.ts';
import { emit } from './events.ts';
import { assetCall, ensureBlender, generateModel, lookInBlender, runInBlender } from './blenderLive.ts';
import { getBoard, joinBoard, memberUpdate, planStatus, postNote, setPlan } from './crewBoard.ts';
import { previewFor } from './preview.ts';

// ---------- settings ----------
export const handsEnabled = () => (loadConfig() as any).hands?.enabled !== false; // on by default; still needs full control + a computer-use ask
export function setHandsEnabled(on: boolean) {
  const c = loadConfig() as any;
  c.hands = { ...(c.hands ?? {}), enabled: on };
  saveConfig();
}

const HANDS = /\b(computer\w*|komputer\w*|na [żz]ywo|live\b|kursor\w*|ruszaj\w* mysz\w*|mysz\w*|myszk\w*|kursor\w*|na (moim )?(ekranie|pulpicie|komputerze)|steruj\w*|klikaj\w*|kliknij|otw[óo]rz (program|aplikacj\w*)|blender\w*|photoshop\w*|gimp|figm\w*|excel\w*|word\b|paint\b|obs\b|davinci|premiere|after effects|unity|unreal|autocad|fusion 360|sketchup|on my (screen|desktop|computer)|mouse|cursor|control my|use my computer|click)/i;
/** Does this message ask the AI to operate apps on the screen? */
export const wantsHands = (msg: string) => HANDS.test(msg);
const NUM: Record<string, number> = { dwa: 2, dwoch: 2, dwóch: 2, dwaj: 2, two: 2, trzy: 3, trzech: 3, three: 3, cztery: 4, czterech: 4, four: 4 };
/** How many on-screen agents a chat message asks for (1 = just this one). */
export function crewSize(msg: string): number {
  const m = msg.match(/(?<![\p{L}\d])([2-4]|dwa|dw[oó]ch|dwaj|trzy|trzech|cztery|czterech|two|three|four)\s+(agent|ai\b|kursor|bot)/iu);
  if (m) return Number(m[1]) || NUM[m[1].toLowerCase()] || 1;
  return /(?<!\p{L})(zesp[oó][łl]\w*|team\b|crew\b|(kilku|kilka|paru|par[ęe]|wielu|several|multiple|few)\s+agent\w*|agent(ów|ow|ach|ami|ki)\b|agents\b|dzia[łl](y|ów|ow|em)?\b|wsp[oó][łl]prac\w*)/iu.test(msg) ? 3 : 1;
}

// ---------- sessions (one per AI run that may use the hands) ----------
export interface HandsSession {
  token: string;
  name: string;
  color: string;
  startedAt: number;
  action: string;
  abort: AbortController;
  /** The monitor this agent looks at (its last screenshot). */
  view?: { x0: number; y0: number; w: number; h: number; sw: number; sh: number; mon: number };
  /** Last known position of this agent's cursor (screen pixels). */
  x?: number;
  y?: number;
  /** Screen area this agent works in (real pixels); others keep out. */
  claim?: { x: number; y: number; x2: number; y2: number; label: string };
  /** How many board notes it has already been shown. */
  seen?: number;
  /** The crew (lead chat id) this agent belongs to; its board is shown in that chat. */
  crew?: string;
  conversationId?: string;
  lead?: boolean;
}
const sessions = new Map<string, HandsSession>();
const shown = new Set<string>();
const crewKey = (s: HandsSession) => s.crew ?? 't:' + s.token;
const notesOf = (s: HandsSession) => getBoard(crewKey(s)).notes;
const mates = (s: HandsSession) => [...sessions.values()].filter((o) => crewKey(o) === crewKey(s));

export function openHands(name: string, color: string, abort: AbortController, opts: { crew?: string; conversationId?: string; lead?: boolean } = {}): HandsSession {
  const s: HandsSession = { token: randomBytes(18).toString('base64url'), name, color, startedAt: Date.now(), action: '', abort, ...opts };
  sessions.set(s.token, s);
  if (s.crew) joinBoard(s.crew, { name, color, conversationId: opts.conversationId, lead: !!opts.lead });
  emit('hands.session', { token: s.token.slice(0, 8), name, color, open: true });
  return s;
}
export function closeHands(s: HandsSession) {
  if (!sessions.delete(s.token)) return;
  if (s.crew) memberUpdate(s.crew, s.name, { state: s.abort.signal.aborted ? 'stopped' : 'done', action: '' });
  emit('hands.session', { token: s.token.slice(0, 8), name: s.name, color: s.color, open: false });
}
export const handsSessions = () => [...sessions.values()].map((s) => ({ id: s.token.slice(0, 8), name: s.name, color: s.color, action: s.action, startedAt: s.startedAt }));

/** The big red button (overlay, title bar, Ctrl+Alt+Q): every agent lets go of the mouse. */
export function stopAllHands() {
  for (const s of sessions.values()) s.abort.abort();
  queue = Promise.resolve();
  emit('hands.stopped', {});
}

export const handsMcpUrl = (port: number, s: HandsSession) => `http://127.0.0.1:${port}/mcp/hands/${s.token}`;

// ---------- the Windows driver: one PowerShell process with a small C# helper ----------
const HELPER = String.raw`
Add-Type -ReferencedAssemblies System.Drawing,System.Windows.Forms -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Drawing; using System.Drawing.Imaging; using System.Drawing.Drawing2D; using System.Windows.Forms; using System.Threading;
public static class AH {
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint n, INPUT[] i, int size);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] struct U { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public U u; }
  static void Send(INPUT i) { SendInput(1, new INPUT[] { i }, Marshal.SizeOf(typeof(INPUT))); }
  static void M(uint flags, uint data) { var i = new INPUT(); i.type = 0; i.u.mi.dwFlags = flags; i.u.mi.mouseData = data; Send(i); }
  static void K(ushort vk, ushort scan, uint flags) { var i = new INPUT(); i.type = 1; i.u.ki.wVk = vk; i.u.ki.wScan = scan; i.u.ki.dwFlags = flags; Send(i); }
  public static void Init() { SetProcessDPIAware(); }
  static Rectangle Mon(int i) { var all = System.Windows.Forms.Screen.AllScreens; return i >= 0 && i < all.Length ? all[i].Bounds : System.Windows.Forms.Screen.PrimaryScreen.Bounds; }
  public static string Screens() { var all = System.Windows.Forms.Screen.AllScreens; var o = new System.Text.StringBuilder(); for (int i = 0; i < all.Length; i++) { var b = all[i].Bounds; o.Append(i + ":" + b.X + ":" + b.Y + ":" + b.Width + ":" + b.Height + ":" + (all[i].Primary ? 1 : 0) + ";"); } return o.ToString(); }
  public static string Screen(int i) { var b = Mon(i); return b.X + " " + b.Y + " " + b.Width + " " + b.Height; }
  public static string Shot(int maxW, string path, int mon) {
    var b = Mon(mon);
    using (var full = new Bitmap(b.Width, b.Height)) {
      using (var g = Graphics.FromImage(full)) g.CopyFromScreen(b.X, b.Y, 0, 0, full.Size);
      double s = Math.Min(1.0, (double)maxW / b.Width);
      int w = (int)Math.Round(b.Width * s), h = (int)Math.Round(b.Height * s);
      using (var small = new Bitmap(w, h)) {
        using (var g = Graphics.FromImage(small)) { g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.DrawImage(full, 0, 0, w, h); }
        small.Save(path, ImageFormat.Jpeg);
      }
      return b.X + " " + b.Y + " " + b.Width + " " + b.Height + " " + w + " " + h;
    }
  }
  public static void Move(int x, int y) { SetCursorPos(x, y); }
  public static string Pos() { POINT p; GetCursorPos(out p); return p.X + " " + p.Y; }
  public static void Click(int x, int y, string btn, int n) {
    SetCursorPos(x, y); Thread.Sleep(30);
    uint d = btn == "right" ? 8u : btn == "middle" ? 0x20u : 2u, u = btn == "right" ? 0x10u : btn == "middle" ? 0x40u : 4u;
    for (int k = 0; k < n; k++) { M(d, 0); Thread.Sleep(20); M(u, 0); Thread.Sleep(60); }
  }
  public static void Drag(int x1, int y1, int x2, int y2) {
    SetCursorPos(x1, y1); Thread.Sleep(40); M(2, 0); Thread.Sleep(60);
    for (int k = 1; k <= 20; k++) { SetCursorPos(x1 + (x2 - x1) * k / 20, y1 + (y2 - y1) * k / 20); Thread.Sleep(12); }
    Thread.Sleep(40); M(4, 0);
  }
  public static void Scroll(int x, int y, int dy) { SetCursorPos(x, y); Thread.Sleep(20); M(0x800, (uint)(-dy * 120)); }
  public static void Type(string t) {
    foreach (char c in t) {
      if (c == '\n') { K(0x0D, 0, 0); K(0x0D, 0, 2); }
      else if (c == '\r') continue;
      else { K(0, c, 4); K(0, c, 6); }
      Thread.Sleep(8);
    }
  }
  public static void Keys(string list) {
    var parts = list.Split(','); var vks = new ushort[parts.Length];
    for (int k = 0; k < parts.Length; k++) vks[k] = Convert.ToUInt16(parts[k]);
    foreach (var v in vks) { K(v, 0, Ext(v)); Thread.Sleep(15); }
    for (int k = vks.Length - 1; k >= 0; k--) { K(vks[k], 0, Ext(vks[k]) | 2); Thread.Sleep(15); }
  }
  static uint Ext(ushort v) { return (v >= 0x21 && v <= 0x28) || v == 0x2D || v == 0x2E || v == 0x5B ? 1u : 0u; }
}
'@
[AH]::Init()
[Console]::Out.WriteLine('{"ready":true}')
while (($l = [Console]::In.ReadLine()) -ne $null) {
  try {
    $a = $l.Split(' ')
    $r = switch ($a[0]) {
      'shot'   { [AH]::Shot([int]$a[1], [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($a[2])), [int]$a[3]) }
      'screen' { [AH]::Screen([int]$a[1]) }
      'screens' { [AH]::Screens() }
      'pos'    { [AH]::Pos() }
      'move'   { [AH]::Move([int]$a[1], [int]$a[2]); 'ok' }
      'click'  { [AH]::Click([int]$a[1], [int]$a[2], $a[3], [int]$a[4]); 'ok' }
      'drag'   { [AH]::Drag([int]$a[1], [int]$a[2], [int]$a[3], [int]$a[4]); 'ok' }
      'scroll' { [AH]::Scroll([int]$a[1], [int]$a[2], [int]$a[3]); 'ok' }
      'type'   { [AH]::Type([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($a[1]))); 'ok' }
      'keys'   { [AH]::Keys($a[1]); 'ok' }
      default  { throw "unknown $($a[0])" }
    }
    [Console]::Out.WriteLine((@{ ok = $true; r = "$r" } | ConvertTo-Json -Compress))
  } catch {
    [Console]::Out.WriteLine((@{ ok = $false; error = "$($_.Exception.Message)" } | ConvertTo-Json -Compress))
  }
}
`;

let driver: { proc: ChildProcessWithoutNullStreams; ready: Promise<void>; waiters: ((line: string) => void)[]; buf: string } | null = null;

function ensureDriver() {
  if (process.platform !== 'win32') throw new Error('Using the mouse and keyboard works on Windows for now.');
  if (driver && driver.proc.exitCode === null) return driver;
  const dir = join(tmpdir(), 'alter-hands');
  mkdirSync(dir, { recursive: true });
  const script = join(dir, 'driver.ps1');
  writeFileSync(script, '\ufeff' + HELPER);
  const proc = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true });
  const d = { proc, waiters: [] as ((line: string) => void)[], buf: '', ready: Promise.resolve() };
  d.ready = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('The input helper did not start')), 30_000);
    d.waiters.push(() => {
      clearTimeout(t);
      resolve();
    });
  });
  proc.stdout.on('data', (b: Buffer) => {
    d.buf += b.toString();
    let i;
    while ((i = d.buf.indexOf('\n')) >= 0) {
      const line = d.buf.slice(0, i).trim();
      d.buf = d.buf.slice(i + 1);
      if (line.startsWith('{')) d.waiters.shift()?.(line);
    }
  });
  proc.on('exit', () => {
    for (const w of d.waiters.splice(0)) w(JSON.stringify({ ok: false, error: 'input helper stopped' }));
    if (driver === d) driver = null;
  });
  driver = d;
  return d;
}

async function drive(cmd: string): Promise<string> {
  const d = ensureDriver();
  await d.ready;
  const line = await new Promise<string>((resolve) => {
    d.waiters.push(resolve);
    d.proc.stdin.write(cmd + '\n');
  });
  const r = JSON.parse(line);
  if (!r.ok) throw new Error(r.error);
  return String(r.r ?? '');
}
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

// ---------- the screen as the AI sees it (scaled), and back ----------
interface View { x0: number; y0: number; w: number; h: number; sw: number; sh: number; mon: number }
const MAX_W = 1366;

async function screenshot(s: HandsSession, mon: number): Promise<{ png: string; view: View }> {
  const file = join(tmpdir(), 'alter-hands', `shot-${process.pid}-${Date.now()}.jpg`);
  const [x0, y0, w, h, sw, sh] = (await drive(`shot ${MAX_W} ${b64(file)} ${mon}`)).split(' ').map(Number);
  const png = readFileSync(file).toString('base64');
  rmSync(file, { force: true });
  s.view = { x0, y0, w, h, sw, sh, mon };
  return { png, view: s.view };
}

async function view(s: HandsSession): Promise<View> {
  if (s.view) return s.view;
  const [x0, y0, w, h] = (await drive('screen -1')).split(' ').map(Number);
  const k = Math.min(1, MAX_W / w);
  return (s.view = { x0, y0, w, h, sw: Math.round(w * k), sh: Math.round(h * k), mon: -1 });
}
/** Screenshot coordinates → real screen pixels. */
async function real(s: HandsSession, x: number, y: number) {
  const v = await view(s);
  return { x: Math.round(v.x0 + (x * v.w) / v.sw), y: Math.round(v.y0 + (y * v.h) / v.sh) };
}

// ---------- one input at a time, with the agent's cursor shown moving there first ----------
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => {
  const p = queue.then(fn, fn);
  queue = p.catch(() => {});
  return p;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const show = (s: HandsSession, kind: string, extra: Record<string, unknown> = {}) => {
  s.action = String(extra.label ?? kind);
  if (s.crew) memberUpdate(s.crew, s.name, { action: String(extra.text ?? extra.label ?? kind).slice(0, 140) });
  emit('hands.action', { id: s.token.slice(0, 8), name: s.name, color: s.color, kind, x: s.x, y: s.y, ...extra });
};
const GLIDE = 420;

async function glide(s: HandsSession, x: number, y: number, kind: string, label: string) {
  s.x = x;
  s.y = y;
  show(s, kind, { label });
  await sleep(GLIDE);
}

const KEY: Record<string, number> = {
  ctrl: 0x11, control: 0x11, shift: 0x10, alt: 0x12, win: 0x5b, meta: 0x5b, cmd: 0x11, enter: 0x0d, return: 0x0d, esc: 0x1b, escape: 0x1b, tab: 0x09,
  backspace: 0x08, delete: 0x2e, del: 0x2e, insert: 0x2d, space: 0x20, up: 0x26, down: 0x28, left: 0x25, right: 0x27, home: 0x24, end: 0x23,
  pageup: 0x21, pagedown: 0x22, minus: 0xbd, '-': 0xbd, plus: 0xbb, '=': 0xbb, ',': 0xbc, comma: 0xbc, '.': 0xbe, period: 0xbe, '/': 0xbf, ';': 0xba, "'": 0xde, '[': 0xdb, ']': 0xdd, '\\': 0xdc, '`': 0xc0,
  numpad0: 0x60, numpad1: 0x61, numpad2: 0x62, numpad3: 0x63, numpad4: 0x64, numpad5: 0x65, numpad6: 0x66, numpad7: 0x67, numpad8: 0x68, numpad9: 0x69, printscreen: 0x2c,
};
function vks(combo: string): number[] {
  return combo.toLowerCase().split('+').map((k) => k.trim()).filter(Boolean).map((k) => {
    if (KEY[k] !== undefined) return KEY[k];
    if (/^f([1-9]|1[0-2])$/.test(k)) return 0x6f + Number(k.slice(1));
    if (/^[a-z0-9]$/.test(k)) return k.toUpperCase().charCodeAt(0);
    throw new Error(`Unknown key "${k}"`);
  });
}

// ---------- the tools the AI gets ----------
const num = { type: 'number' };
const TOOLS = [
  { name: 'screenshot', description: 'Look at the screen (the main monitor unless you pass monitor). Returns an image; all x/y you pass to other tools are pixels in THIS image. Take one before acting and after anything that changes the screen.', inputSchema: { type: 'object', properties: { monitor: num } } },
  { name: 'click', description: 'Move your cursor to x,y (screenshot pixels) and click. button: left|right|middle, clicks: 1 or 2 (double-click).', inputSchema: { type: 'object', properties: { x: num, y: num, button: { type: 'string', enum: ['left', 'right', 'middle'] }, clicks: num }, required: ['x', 'y'] } },
  { name: 'move', description: 'Move your cursor to x,y without clicking (hover).', inputSchema: { type: 'object', properties: { x: num, y: num }, required: ['x', 'y'] } },
  { name: 'drag', description: 'Press at x1,y1, drag to x2,y2 and release (move objects, select, sliders, rotate a 3D view).', inputSchema: { type: 'object', properties: { x1: num, y1: num, x2: num, y2: num }, required: ['x1', 'y1', 'x2', 'y2'] } },
  { name: 'scroll', description: 'Scroll at x,y. dy > 0 scrolls down, < 0 up (in notches, e.g. 3).', inputSchema: { type: 'object', properties: { x: num, y: num, dy: num }, required: ['x', 'y', 'dy'] } },
  { name: 'type', description: 'Type text. Pass x,y of the field to click it first in the same move (do this whenever other agents work too — nobody can steal the focus in between). \\n presses Enter.', inputSchema: { type: 'object', properties: { text: { type: 'string' }, x: num, y: num }, required: ['text'] } },
  { name: 'key', description: 'Press a key or shortcut, e.g. "enter", "ctrl+s", "alt+tab", "shift+a", "f12", "win". Blender: "tab", "g", "s", "r", "numpad1", "shift+a".', inputSchema: { type: 'object', properties: { keys: { type: 'string' }, x: num, y: num }, required: ['keys'] } },
  { name: 'open', description: 'Start an app or open a file/URL the Windows way, e.g. "blender", "notepad", "C:\\\\path\\\\file.blend", "https://…". Wait and take a screenshot afterwards.', inputSchema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } },
  { name: 'wait', description: 'Wait a moment for something to load (seconds, max 20).', inputSchema: { type: 'object', properties: { seconds: num }, required: ['seconds'] } },
  { name: 'say', description: 'Show a short bubble next to your cursor so the user sees what you are doing ("Adding the light").', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'team_note', description: 'Post a note to the shared board (the user sees it live in the chat, your teammates get it with their next action). to: an agent name for a direct message, or omit for everyone. status: "working" when you start your part, "done" when it is finished.', inputSchema: { type: 'object', properties: { text: { type: 'string' }, to: { type: 'string' }, status: { type: 'string', enum: ['working', 'done'] } }, required: ['text'] } },
  { name: 'team_plan', description: 'Lead only: put the plan on the board — who does which part. The user sees it as a checklist in the chat, every teammate reads it.', inputSchema: { type: 'object', properties: { tasks: { type: 'array', items: { type: 'object', properties: { who: { type: 'string' }, task: { type: 'string' } }, required: ['who', 'task'] } } }, required: ['tasks'] } },
  { name: 'wait_team', description: 'Wait (up to 90 s) until a teammate posts something new for you, then return it. Use it instead of idling while others work.', inputSchema: { type: 'object', properties: { seconds: num } } },
  { name: 'blender', description: 'Run Python (bpy) inside the ONE shared Blender window on the user\'s screen — it opens by itself the first time, visibly. Every agent of the team works in this same scene: the user watches the model grow. Your Python variables are your own (teammates have separate ones), the scene is shared: put your parts in your own collection (e.g. "Bolt – wheels") and never delete or rename teammates’ objects. Prefer bpy.data / bmesh; for operators that need the 3D view use `with view3d(): bpy.ops.…`. Write file paths with forward slashes (D:/folder/car.glb). Returns what you print(). Take a screenshot after bigger steps to check how it looks.', inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
  { name: 'blender_look', description: 'See the shared Blender scene from an angle as a clean picture (the user’s viewport turns there too): three_quarter (default), rear_three_quarter, front, back, left, right, top. Use it after every bigger step and judge it like an art director — silhouette, proportions, gaps, lumps — then fix.', inputSchema: { type: 'object', properties: { view: { type: 'string', enum: ['three_quarter', 'rear_three_quarter', 'front', 'back', 'left', 'right', 'top'] } } } },
  { name: 'find_asset', description: 'Search free asset libraries for the shared Blender: source "polyhaven" (CC0 HDRI studio lights, PBR textures, realistic props — no key needed), "sketchfab" or "polypizza" (ready 3D models; need a key in Settings). type for polyhaven: hdris | textures | models. Returns ids to pass to add_asset.', inputSchema: { type: 'object', properties: { source: { type: 'string', enum: ['polyhaven', 'sketchfab', 'polypizza'] }, query: { type: 'string' }, type: { type: 'string', enum: ['hdris', 'textures', 'models'] } }, required: ['source', 'query'] } },
  { name: 'add_asset', description: 'Download an asset found with find_asset straight into the shared Blender scene: a polyhaven HDRI becomes the world light (best way to make materials look real), a model is imported (size: largest dimension in metres), a texture is loaded as a PBR material (pass object to put it on that object).', inputSchema: { type: 'object', properties: { source: { type: 'string', enum: ['polyhaven', 'sketchfab', 'polypizza'] }, id: { type: 'string' }, type: { type: 'string', enum: ['hdris', 'textures', 'models'] }, resolution: { type: 'string', enum: ['1k', '2k', '4k'] }, size: num, object: { type: 'string' } }, required: ['source', 'id'] } },
  { name: 'generate_model', description: 'Generate a detailed, textured 3D model from a text description with AI (Hyper3D Rodin, 1–4 min; needs a Hyper3D or fal.ai key in config hands.hyper3dKey / hands.falKey — the shared free trial is often used up, then build it yourself) and import it into the shared Blender scene — far better looking than building complex organic or detailed shapes from primitives. Describe it concretely in English ("a sleek dark red sports coupé, low long bonnet, 5-spoke rims, no logos"). Then inspect it with blender_look, scale/position/rename it and improve materials and lighting.', inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, name: { type: 'string' } }, required: ['prompt'] } },
  { name: 'show_page', description: 'Show a web page you are building: opens it in the browser on the user\'s screen (first time) and in the live preview next to the chat. Pass the index.html path (or an http://localhost URL). Call it right after you create the first version, and again after changes (it refreshes the preview; press f5 in the browser too).', inputSchema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } },
  { name: 'team_board', description: 'Read the shared board: who else is working right now, which screen area each one claimed, and all notes.', inputSchema: { type: 'object', properties: {} } },
  { name: 'claim', description: 'Claim a screen area (a window, panel or layer list — screenshot pixels) as yours while you work in it, with a short label ("texts layer", "lighting"). It is outlined in your colour for the user; other agents will not click inside it. One claim per agent; a new claim replaces the old one.', inputSchema: { type: 'object', properties: { x: num, y: num, w: num, h: num, label: { type: 'string' } }, required: ['x', 'y', 'w', 'h'] } },
  { name: 'unclaim', description: 'Free your claimed area (when your part is done).', inputSchema: { type: 'object', properties: {} } },
  { name: 'hold', description: 'Take the mouse+keyboard for a few seconds (max 20) for a sequence that must not be interrupted (select → drag → type a value). Others wait meanwhile. Call release right after.', inputSchema: { type: 'object', properties: { seconds: num }, required: ['seconds'] } },
  { name: 'release', description: 'Give the mouse+keyboard back after hold.', inputSchema: { type: 'object', properties: {} } },
];

// ---------- teamwork on one screen: claimed areas, short exclusive holds, direct notes ----------
let holder: { token: string; until: number } | null = null;
async function waitTurn(s: HandsSession) {
  for (let i = 0; i < 160; i++) {
    if (!holder || holder.token === s.token || holder.until < Date.now() || !sessions.has(holder.token)) return;
    if (i === 0) show(s, 'wait', { label: 'wait', seconds: Math.ceil((holder.until - Date.now()) / 1000) });
    await sleep(150);
  }
}
/** Someone else's claimed area under this real-screen point. */
function ownerAt(s: HandsSession, x: number, y: number): HandsSession | undefined {
  return [...sessions.values()].find((o) => o !== s && o.claim && x >= o.claim.x && y >= o.claim.y && x <= o.claim.x2 && y <= o.claim.y2);
}
const blocked = (o: HandsSession) => ({ content: [{ type: 'text', text: `That spot is inside ${o.name}'s area ("${o.claim!.label}"). Work in your own area, or ask ${o.name} with team_note (to: "${o.name}"). Pass force: true only if ${o.name} handed it to you.` }], isError: true });
/** Notes for this agent it has not seen yet (direct ones and broadcasts from others). */
function inbox(s: HandsSession): string {
  const notes = notesOf(s);
  const fresh = notes.slice(s.seen ?? 0).filter((n) => n.name !== s.name && (!n.to || n.to.toLowerCase() === s.name.toLowerCase()));
  s.seen = notes.length;
  return fresh.length ? `\n📬 ${fresh.map((n) => `${n.name}${n.to ? ' → you' : ''}: ${n.text}`).join('\n📬 ')}` : '';
}

async function callTool(s: HandsSession, name: string, a: any): Promise<{ content: any[]; isError?: boolean }> {
  if (s.abort.signal.aborted) return { content: [{ type: 'text', text: 'The user stopped you. Stop now and say so in one line.' }], isError: true };
  if (['click', 'move', 'drag', 'scroll', 'type', 'key'].includes(name)) await waitTurn(s);
  const r = await callTool0(s, name, a);
  const mail = name === 'team_board' ? '' : inbox(s);
  if (mail) {
    const last = r.content[r.content.length - 1];
    if (last?.type === 'text') last.text += mail;
    else r.content.push({ type: 'text', text: mail.trim() });
  }
  return r;
}

async function callTool0(s: HandsSession, name: string, a: any): Promise<{ content: any[]; isError?: boolean }> {
  const text = (t: string) => ({ content: [{ type: 'text', text: t }] });
  switch (name) {
    case 'screenshot': {
      show(s, 'look', { label: 'look' });
      const mon = a.monitor === undefined ? (s.view?.mon ?? -1) : Number(a.monitor);
      const { png, view } = await serial(() => screenshot(s, mon));
      const mons = (await drive('screens')).split(';').filter(Boolean);
      const note = mons.length > 1 ? ` Monitors: ${mons.map((m) => { const [i, , , w, h, p] = m.split(':'); return `${i} (${w}×${h}${p === '1' ? ', main' : ''})`; }).join(', ')} — this is ${view.mon < 0 ? 'the main one' : view.mon}; pass monitor to look at another.` : '';
      return { content: [{ type: 'image', data: png, mimeType: 'image/jpeg' }, { type: 'text', text: `Screen ${view.sw}×${view.sh}.${note} Your cursor is drawn by ALTTER, not in the image.` }] };
    }
    case 'click': case 'move': {
      const p = await real(s, Number(a.x), Number(a.y));
      const o = name === 'click' && !a.force ? ownerAt(s, p.x, p.y) : undefined;
      if (o) return blocked(o);
      const clicks = Math.max(1, Math.min(3, Number(a.clicks ?? 1)));
      await serial(async () => {
        await glide(s, p.x, p.y, name === 'move' ? 'move' : 'aim', name);
        if (name === 'move') await drive(`move ${p.x} ${p.y}`);
        else {
          await drive(`click ${p.x} ${p.y} ${a.button ?? 'left'} ${clicks}`);
          show(s, 'click', { label: clicks > 1 ? 'double-click' : (a.button ?? 'left') === 'right' ? 'right-click' : 'click', button: a.button ?? 'left', clicks });
        }
      });
      return text('done');
    }
    case 'drag': {
      const p1 = await real(s, Number(a.x1), Number(a.y1));
      const p2 = await real(s, Number(a.x2), Number(a.y2));
      const o = a.force ? undefined : ownerAt(s, p1.x, p1.y) ?? ownerAt(s, p2.x, p2.y);
      if (o) return blocked(o);
      await serial(async () => {
        await glide(s, p1.x, p1.y, 'aim', 'drag');
        s.x = p2.x;
        s.y = p2.y;
        show(s, 'drag', { label: 'drag', fromX: p1.x, fromY: p1.y });
        await drive(`drag ${p1.x} ${p1.y} ${p2.x} ${p2.y}`);
      });
      return text('done');
    }
    case 'scroll': {
      const p = await real(s, Number(a.x), Number(a.y));
      await serial(async () => {
        await glide(s, p.x, p.y, 'aim', 'scroll');
        show(s, 'scroll', { label: 'scroll', dy: Number(a.dy) });
        await drive(`scroll ${p.x} ${p.y} ${Math.round(Number(a.dy) || 1)}`);
      });
      return text('done');
    }
    case 'type': {
      const t = String(a.text ?? '');
      const at = a.x !== undefined && a.y !== undefined ? await real(s, Number(a.x), Number(a.y)) : null;
      const o = at && !a.force ? ownerAt(s, at.x, at.y) : undefined;
      if (o) return blocked(o);
      await serial(async () => {
        if (at) {
          await glide(s, at.x, at.y, 'aim', 'click');
          await drive(`click ${at.x} ${at.y} left 1`);
          show(s, 'click', { label: 'click', button: 'left', clicks: 1 });
          await sleep(120);
        }
        show(s, 'type', { label: 'type', text: t.slice(0, 80) });
        await drive(`type ${b64(t)}`);
      });
      return text('typed');
    }
    case 'key': {
      const list = vks(String(a.keys ?? ''));
      const at = a.x !== undefined && a.y !== undefined ? await real(s, Number(a.x), Number(a.y)) : null;
      const o = at && !a.force ? ownerAt(s, at.x, at.y) : undefined;
      if (o) return blocked(o);
      await serial(async () => {
        if (at) {
          await glide(s, at.x, at.y, 'aim', 'click');
          await drive(`click ${at.x} ${at.y} left 1`);
          await sleep(100);
        }
        show(s, 'key', { label: String(a.keys), keys: String(a.keys) });
        await drive(`keys ${list.join(',')}`);
      });
      return text('pressed');
    }
    case 'open': {
      const target = String(a.target ?? '').trim();
      if (!target) return { ...text('Nothing to open'), isError: true };
      if (/^blender(\.exe)?$/i.test(target) || /blender\.exe"?$/i.test(target)) {
        const st = await ensureBlender();
        return text(st === 'running' ? 'The shared Blender is already open — work in it (blender tool for Python, mouse/keys for the view).' : 'Opened the shared Blender. Use the blender tool to build with Python; everyone on the team works in this same window.');
      }
      show(s, 'open', { label: 'open', text: target });
      await new Promise<void>((resolve) => {
        const p = spawn('cmd.exe', ['/d', '/s', '/c', 'start', '""', target.includes(' ') ? `"${target}"` : target], { windowsHide: true, detached: true, stdio: 'ignore', windowsVerbatimArguments: true });
        p.on('error', () => resolve());
        p.unref();
        setTimeout(resolve, 300);
      });
      return text(`Started "${target}". Wait a few seconds, then take a screenshot.`);
    }
    case 'wait': {
      const sec = Math.max(0.2, Math.min(20, Number(a.seconds) || 1));
      show(s, 'wait', { label: 'wait', seconds: sec });
      await sleep(sec * 1000);
      return text('waited');
    }
    case 'say': {
      show(s, 'say', { label: 'say', text: String(a.text ?? '').slice(0, 140) });
      return text('shown');
    }
    case 'claim': {
      const p1 = await real(s, Number(a.x), Number(a.y));
      const p2 = await real(s, Number(a.x) + Math.max(10, Number(a.w)), Number(a.y) + Math.max(10, Number(a.h)));
      const label = String(a.label ?? '').slice(0, 40) || s.name;
      const clash = [...sessions.values()].find((o) => o !== s && o.claim && p1.x < o.claim.x2 && p2.x > o.claim.x && p1.y < o.claim.y2 && p2.y > o.claim.y);
      if (clash) return { content: [{ type: 'text', text: `Overlaps ${clash.name}'s area ("${clash.claim!.label}"). Pick a different area or agree with ${clash.name} on team_note.` }], isError: true };
      s.claim = { x: p1.x, y: p1.y, x2: p2.x, y2: p2.y, label };
      emit('hands.action', { id: s.token.slice(0, 8), name: s.name, color: s.color, kind: 'claim', label, x: p1.x, y: p1.y, x2: p2.x, y2: p2.y });
      postNote(crewKey(s), { name: s.name, color: s.color, text: `claimed "${label}"`, at: Date.now() });
      return text('claimed');
    }
    case 'unclaim': {
      s.claim = undefined;
      emit('hands.action', { id: s.token.slice(0, 8), name: s.name, color: s.color, kind: 'unclaim', label: 'unclaim' });
      return text('freed');
    }
    case 'hold': {
      await waitTurn(s);
      holder = { token: s.token, until: Date.now() + Math.max(1, Math.min(20, Number(a.seconds) || 8)) * 1000 };
      show(s, 'hold', { label: 'hold' });
      return text('You have the mouse and keyboard — do the sequence, then release.');
    }
    case 'release': {
      if (holder?.token === s.token) holder = null;
      return text('released');
    }
    case 'team_note': {
      const t = String(a.text ?? '').slice(0, 600);
      const to = typeof a.to === 'string' && a.to.trim() ? a.to.trim() : undefined;
      postNote(crewKey(s), { name: s.name, color: s.color, text: t, at: Date.now(), to });
      if (a.status === 'working' || a.status === 'done') planStatus(crewKey(s), s.name, a.status);
      show(s, 'say', { label: 'note', text: t.slice(0, 140) });
      return text('posted');
    }
    case 'team_plan': {
      const tasks = Array.isArray(a.tasks) ? a.tasks.filter((x: any) => x?.who && x?.task) : [];
      if (!tasks.length) return { ...text('Give tasks: [{who, task}]'), isError: true };
      setPlan(crewKey(s), tasks);
      postNote(crewKey(s), { name: s.name, color: s.color, text: 'Plan: ' + tasks.map((x: any) => `${x.who} → ${x.task}`).join(' | '), at: Date.now() });
      show(s, 'say', { label: 'plan', text: 'Plan is on the board' });
      return text('The plan is on the board.');
    }
    case 'wait_team': {
      const sec = Math.max(5, Math.min(90, Number(a.seconds) || 60));
      const until = Date.now() + sec * 1000;
      show(s, 'say', { label: 'wait', text: 'waiting for the team', seconds: sec });
      while (Date.now() < until && !s.abort.signal.aborted) {
        const notes = notesOf(s);
        if (notes.slice(s.seen ?? 0).some((n) => n.name !== s.name && (!n.to || n.to.toLowerCase() === s.name.toLowerCase()))) break;
        if (!mates(s).some((o) => o !== s)) break;
        await sleep(1000);
      }
      const mail = inbox(s);
      const who = mates(s).filter((o) => o !== s).map((o) => `${o.name}: ${o.action || 'working'}`).join(', ');
      return text((mail ? mail.trim() : 'Nothing new yet.') + (who ? `\nStill working: ${who}` : '\nNobody else is working any more.'));
    }
    case 'blender': {
      const code = String(a.code ?? '');
      if (!code.trim()) return { ...text('Pass code'), isError: true };
      show(s, 'say', { label: 'blender', text: 'Blender: ' + (code.match(/^#\s*(.+)/m)?.[1] ?? 'building').slice(0, 100) });
      const r = await runInBlender(code, s.name);
      const head = r.started ? 'Blender was opened on the screen (shared by the whole team). ' : '';
      if (!r.ok) return { ...text(`${head}Python error in Blender:\n${r.error ?? ''}${r.out ? '\nOutput:\n' + r.out : ''}`), isError: true };
      return text(`${head}OK.${r.out ? '\n' + r.out : ''}`);
    }
    case 'blender_look': {
      const view = String(a.view ?? 'three_quarter');
      show(s, 'look', { label: 'look', text: 'Blender: ' + view });
      const r = await lookInBlender(view);
      if (!r.png) return { ...text('Could not take the picture: ' + (r.error ?? '')), isError: true };
      return { content: [{ type: 'image', data: r.png, mimeType: 'image/png' }, { type: 'text', text: `Blender scene, ${view} view.` }] };
    }
    case 'find_asset': {
      const src = String(a.source ?? 'polyhaven');
      const q = String(a.query ?? '').trim();
      show(s, 'say', { label: 'assets', text: `Searching ${src}: ${q}`.slice(0, 100) });
      try {
        const r = src === 'polyhaven' ? await assetCall('search_polyhaven_assets', { asset_type: a.type || 'all', query: q || undefined, limit: 12 }, s.name)
          : src === 'sketchfab' ? await assetCall('search_sketchfab_models', { query: q, count: 12, downloadable: true }, s.name)
          : await assetCall('search_polypizza_models', { query: q, limit: 12 }, s.name);
        if (r && typeof r === 'object' && r.error) return { ...text(String(r.error)), isError: true };
        const list = r && typeof r === 'object' ? (Array.isArray(r) ? r : r.assets ?? r.results ?? r.models ?? null) : null;
        const items = Array.isArray(list) ? list : list && typeof list === 'object' ? Object.entries(list).map(([id, v]: [string, any]) => ({ id, ...v })) : null;
        if (items) {
          if (!items.length) return text(`Nothing found for "${q}" — try a simpler English word.`);
          const pick = (o: any) => ({ id: o.id ?? o.uid ?? o.model_id, name: o.name ?? o.title, category: o.category, license: o.license?.label ?? o.license ?? o.licence, faces: o.faceCount ?? o.face_count, author: Array.isArray(o.authors) ? o.authors[0] : o.user?.username ?? o.creator });
          return text(`Use add_asset with source "${src}" and one id:\n` + items.slice(0, 12).map((o) => JSON.stringify(pick(o))).join('\n'));
        }
        return text(JSON.stringify(r, null, 1).slice(0, 6000));
      } catch (e) { return { ...text('Search failed: ' + (e as Error).message), isError: true }; }
    }
    case 'add_asset': {
      const src = String(a.source ?? 'polyhaven');
      const id = String(a.id ?? '').trim();
      if (!id) return { ...text('Pass id from find_asset'), isError: true };
      show(s, 'say', { label: 'assets', text: `Downloading ${id}`.slice(0, 100) });
      const size = Number(a.size) > 0 ? Number(a.size) : 0;
      try {
        let r: any;
        if (src === 'polyhaven') {
          const type = String(a.type ?? 'models');
          r = await assetCall('download_polyhaven_asset', { asset_id: id, asset_type: type, resolution: a.resolution || (type === 'hdris' ? '2k' : '1k') }, s.name);
          if (type === 'textures' && a.object && !(r && r.success === false) && !r?.error) r = { downloaded: r, applied: await assetCall('set_texture', { object_name: String(a.object), texture_id: id }, s.name) };
        } else if (src === 'sketchfab') r = await assetCall('download_sketchfab_model', { uid: id, normalize_size: !!size, target_size: size || 1 }, s.name);
        else r = await assetCall('download_polypizza_model', { model_id: id, normalize_size: !!size, target_size: size || 1 }, s.name);
        const bad = r && typeof r === 'object' && (r.error || r.success === false);
        return bad ? { ...text(JSON.stringify(r).slice(0, 1500)), isError: true } : text('Added to the shared scene. ' + JSON.stringify(r).slice(0, 1500) + '\nCheck it with blender_look.');
      } catch (e) { return { ...text('Download failed: ' + (e as Error).message), isError: true }; }
    }
    case 'generate_model': {
      const prompt = String(a.prompt ?? '').trim();
      if (!prompt) return { ...text('Pass prompt'), isError: true };
      const name = String(a.name ?? '').trim() || prompt.split(/\s+/).slice(0, 3).join('_').replace(/[^\w-]/g, '') || 'Generated';
      show(s, 'say', { label: 'generate', text: 'Generating 3D: ' + prompt.slice(0, 80) });
      try {
        const r = await generateModel(prompt, name, s.name, (st) => show(s, 'say', { label: 'generate', text: `Generating 3D (${st})` }));
        return text(`Model "${name}" is in the shared scene. ${r}\nNow look at it with blender_look, set its scale/position (real-world metres), rename parts and refine materials/lighting.`);
      } catch (e) { return { ...text('Generation failed: ' + (e as Error).message + ' — build it with the blender tool instead.'), isError: true }; }
    }
    case 'show_page': {
      const target = String(a.target ?? '').trim();
      if (!target) return { ...text('Pass the page path or URL'), isError: true };
      const isUrl = /^https?:\/\//i.test(target);
      const p = isUrl ? { url: target, file: '', root: '' } : previewFor(target);
      if (!p) return { ...text(`No page at ${target} yet — write it first.`), isError: true };
      const chat = s.crew ?? s.conversationId;
      if (chat) emit('crew.preview', { conversationId: chat, preview: p });
      const key = isUrl ? target : p.root + '|' + target;
      if (!shown.has(key)) {
        shown.add(key);
        show(s, 'open', { label: 'open', text: target });
        const p2 = spawn('cmd.exe', ['/d', '/s', '/c', 'start', '""', `"${target}"`], { windowsHide: true, detached: true, stdio: 'ignore', windowsVerbatimArguments: true });
        p2.on('error', () => {});
        p2.unref();
        return text('Opened in the browser on the screen and in the chat preview. After changes call show_page again and press f5 in the browser window.');
      }
      return text('Preview refreshed in the chat. Refresh the browser window too (click it, key f5).');
    }
    case 'team_board': {
      const notes = notesOf(s);
      s.seen = notes.length;
      const plan = getBoard(crewKey(s)).plan;
      const planText = plan.length ? `Plan:\n${plan.map((p) => `- [${p.status}] ${p.who}: ${p.task}`).join('\n')}\n\n` : '';
      const who = mates(s).map((x) => `${x.name}${x === s ? ' (you)' : ''}: ${x.action || 'starting'}${x.claim ? ` · area "${x.claim.label}"` : ''}`).join('\n');
      const board = notes.filter((n) => !n.to || n.to.toLowerCase() === s.name.toLowerCase() || n.name === s.name).map((n) => `[${n.name}${n.to ? ` → ${n.to}` : ''}] ${n.text}`).join('\n') || '(no notes yet)';
      return text(`${planText}Working now:\n${who}\n\nBoard:\n${board}`);
    }
  }
  return { ...text(`Unknown tool ${name}`), isError: true };
}

// ---------- MCP over HTTP (JSON-RPC, JSON responses) ----------
export async function handleHandsMcp(req: IncomingMessage, res: ServerResponse, token: string) {
  const s = sessions.get(token);
  const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  if (!s) return reply(404, { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Session ended' } });
  if (req.method === 'GET') return reply(405, undefined, { allow: 'POST' });
  if (req.method === 'DELETE') return reply(200, {});
  const raw = await new Promise<string>((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b));
  });
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return reply(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  const handle = async (m: any) => {
    if (m.id === undefined) return null; // notification
    const ok = (result: unknown) => ({ jsonrpc: '2.0', id: m.id, result });
    switch (m.method) {
      case 'initialize':
        return ok({ protocolVersion: m.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'alter-hands', version: '1.0.0' }, instructions: 'Use the computer like a person: screenshot → act → screenshot to verify.' });
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({ tools: TOOLS });
      case 'tools/call':
        try {
          return ok(await callTool(s, m.params?.name, m.params?.arguments ?? {}));
        } catch (e) {
          return ok({ content: [{ type: 'text', text: `Error: ${(e as Error).message}` }], isError: true });
        }
      default:
        return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Unknown method ${m.method}` } };
    }
  };
  const out = Array.isArray(msg) ? (await Promise.all(msg.map(handle))).filter(Boolean) : await handle(msg);
  if (out === null || (Array.isArray(out) && !out.length)) return reply(202, undefined);
  reply(200, out, { 'mcp-session-id': token.slice(0, 12) });
}

// ---------- what the AI is told ----------
/** The chat asked for the screen/Blender/crews, but its access is not "Full control": the AI must not pretend it has no such tools. */
export const HANDS_NEEDS_FULL = `## ALTTER hands (mouse, keyboard, screen, the shared live Blender, on-screen crews of agents)
ALTTER CAN do this: agents with their own visible cursors on this computer, several agents working in one live Blender window, screenshots, apps. These tools are switched off in THIS chat only because its access is not "Full control". Never say you lack computer use, a Blender tool or the ability to run several agents. Answer in one or two lines, in the user's language: say it is ready to go and that they only need to switch this chat to "Full control" (the access button under the message box) and send the message again — then you start right away. You may add a one-line plan of what you will do. End the answer with this exact line on its own: [[altter:needs-full]] (the app shows a button that switches and continues).`;

export const HANDS_GUIDE = `## You can use this computer (mouse, keyboard, screen) — tools from the "alter_hands" MCP server
The user watches: your cursor with your name is drawn on their screen, so work calmly and visibly.
Loop: screenshot → decide → one action (click/type/key/drag/scroll) → screenshot to check. Coordinates are pixels in the latest screenshot.
- EVERYTHING happens visibly on this screen — the user wants to watch it. Never run apps in the background or headless (no blender --background, no hidden browsers, no "build first, show later").
- Good-looking 3D fast: for a detailed object (car, character, furniture, product) first try generate_model (AI text→3D, textured) or find_asset/add_asset (ready models) and then refine it in the blender tool — scale to real size, fix materials, add details. ALWAYS light the scene with a Poly Haven studio HDRI (find_asset polyhaven "studio" type hdris → add_asset) plus a ground plane; that alone makes a model look professional. Build from scratch only when nothing fits or the user wants it hand-made.
- Blender: use the blender tool — Python runs inside the ONE shared Blender window (opened for you the first time), so the model grows in front of the user and teammates build into the same scene. Never start blender.exe yourself. After each bigger step check it with blender_look (three_quarter, left, front, top) and judge it critically: smooth clean surfaces, no lumps, holes or stretched faces, believable proportions. Fix what looks wrong before you report done — at least 3 look → fix rounds for a model; a quick blocky draft is never "done". If the shared scene still holds objects from an earlier, different job, the lead clears them first (delete objects and orphan meshes/materials with bpy.data) — unless the user wants to continue that model.
- Web pages: write the first version early, then show_page(path) — it opens in the browser on screen and in the chat preview — and show_page again after changes.
- Other apps: open("notepad") (or the Start menu via key "win" + type the name + "enter"), then wait 2–6 s and screenshot.
- Prefer keyboard shortcuts when you know them (Blender: shift+a add, g/r/s move/rotate/scale, tab edit mode, numpad keys views, ctrl+s save). For exact values type them.
- Before a longer stretch, say("…") one short line about what you are doing.
- Other agents may work on the same screen at the same time (each has its own cursor and colour). Team rules:
  1. team_board first. If you lead: split the job into clear parts of the SAME result (e.g. one builds the car body, another the wheels and lights in the same Blender scene, a third the page) and post it with team_plan. Talk to each other with team_note (to: "Name") — ask, hand over, say what you need; use wait_team instead of idling.
  2. claim the area you work in (a window, a panel, a layer) — it is outlined in your colour; never click inside someone else's area (the tools refuse it).
  3. Type with type(text, x, y) / key(keys, x, y) so the click that focuses your field and the typing happen as one move.
  4. For an uninterrupted sequence (select → drag → type a value) use hold(seconds) … release.
  5. Notes addressed to you show up after your actions (📬) — answer them with team_note(to: "Name"). team_note(status: "done") when your part is finished, then unclaim.
- Never type passwords or payment details, never confirm purchases, deletions of user data or sending messages — stop and ask the user instead.
- When done, take a final screenshot, then tell the user in a few sentences what you did.`;
