// One shared, VISIBLE Blender for every agent: ALTTER opens Blender with a tiny bridge inside it,
// and the agents send Python to that window — the user watches the model grow, and a crew builds
// one scene together (one does the wheels, another the body) instead of each running its own copy.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadConfig } from './config.ts';

const PORT = 7429;

const BRIDGE = String.raw`
import bpy, socket, threading, queue, json, io, os, traceback, contextlib, sys, importlib.util
PORT = __PORT__
ADDON = '__ADDON__'
_jobs = queue.Queue()
# no splash screen over the agents' work (the user's own setting comes back a moment later)
try:
    _splash = bpy.context.preferences.view.show_splash
    bpy.context.preferences.view.show_splash = False
    def _splash_back():
        bpy.context.preferences.view.show_splash = _splash
    bpy.app.timers.register(_splash_back, first_interval=4.0)
except Exception:
    pass
_mcp = None
def mcp(cmd, **params):
    """Asset libraries + 3D generation (blender-mcp, MIT, Siddharth Ahuja): mcp('search_polyhaven_assets', asset_type='hdris', query='studio')"""
    global _mcp
    if _mcp is None:
        spec = importlib.util.spec_from_file_location('alter_blendermcp', ADDON)
        m = importlib.util.module_from_spec(spec)
        sys.modules['alter_blendermcp'] = m
        spec.loader.exec_module(m)
        S, P = bpy.types.Scene, bpy.props
        for k in ('polyhaven', 'hyper3d', 'sketchfab', 'polypizza'):
            if not hasattr(S, 'blendermcp_use_' + k):
                setattr(S, 'blendermcp_use_' + k, P.BoolProperty(default=True))
        if not hasattr(S, 'blendermcp_use_hunyuan3d'):
            S.blendermcp_use_hunyuan3d = P.BoolProperty(default=False)
        if not hasattr(S, 'blendermcp_hyper3d_mode'):
            S.blendermcp_hyper3d_mode = P.EnumProperty(items=[('MAIN_SITE', 'hyper3d.ai', ''), ('FAL_AI', 'fal.ai', '')], default='MAIN_SITE')
        if not hasattr(S, 'blendermcp_hyper3d_api_key'):
            S.blendermcp_hyper3d_api_key = P.StringProperty(default='')
        _mcp = m.BlenderMCPServer(port=0)
        _mcp._m = m
    sc = bpy.context.scene
    if os.environ.get('ALTER_HYPER3D_FAL'):
        sc.blendermcp_hyper3d_mode = 'FAL_AI'
    elif not os.environ.get('BLENDERMCP_HYPER3D_API_KEY'):
        sc.blendermcp_hyper3d_api_key = _mcp._m.RODIN_FREE_TRIAL_KEY
    r = _mcp._execute_command_internal({'type': cmd, 'params': params})
    if r.get('status') != 'success':
        raise RuntimeError(r.get('message') or str(r))
    return r.get('result')
def view3d():
    """with view3d(): bpy.ops.… — runs an operator as if in the 3D viewport."""
    for w in bpy.context.window_manager.windows:
        for a in w.screen.areas:
            if a.type == 'VIEW_3D':
                r = [x for x in a.regions if x.type == 'WINDOW'][0]
                return bpy.context.temp_override(window=w, area=a, region=r)
    return contextlib.nullcontext()
_spaces = {}
def _ns(who):
    if who not in _spaces:
        _spaces[who] = {'bpy': bpy, 'view3d': view3d, 'mcp': mcp, '__name__': '__alter__'}
    return _spaces[who]
def _client(conn):
    try:
        buf = b''
        while b'\n' not in buf:
            chunk = conn.recv(1 << 16)
            if not chunk:
                return
            buf += chunk
        req = json.loads(buf.split(b'\n', 1)[0].decode('utf-8'))
        box = {}
        done = threading.Event()
        _jobs.put((req.get('code', ''), req.get('who', ''), box, done))
        done.wait(600)
        conn.sendall((json.dumps(box or {'ok': False, 'error': 'timeout'}) + '\n').encode('utf-8'))
    except Exception as e:
        try:
            conn.sendall((json.dumps({'ok': False, 'error': str(e)}) + '\n').encode('utf-8'))
        except Exception:
            pass
    finally:
        conn.close()
def _serve():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.bind(('127.0.0.1', PORT))
    srv.listen(16)
    while True:
        conn, _ = srv.accept()
        threading.Thread(target=_client, args=(conn,), daemon=True).start()
def _tick():
    while not _jobs.empty():
        code, who, box, done = _jobs.get()
        out = io.StringIO()
        try:
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
                exec(compile(code, '<alter>', 'exec'), _ns(who))
            box.update(ok=True, out=out.getvalue()[-6000:])
        except Exception:
            box.update(ok=False, out=out.getvalue()[-3000:], error=traceback.format_exc()[-3000:])
        finally:
            try:
                for w in bpy.context.window_manager.windows:
                    for a in w.screen.areas:
                        a.tag_redraw()
            except Exception:
                pass
            done.set()
    return 0.1
threading.Thread(target=_serve, daemon=True).start()
bpy.app.timers.register(_tick, first_interval=0.5, persistent=True)
print('ALTTER live bridge on port', PORT)
`;

/** blender-mcp's add-on (MIT) ships with the built-in skills: Poly Haven, Sketchfab, Poly Pizza, Hyper3D. */
function addonPath(): string {
  const dir = process.env.ALTER_SKILLS_DIR ?? resolve(import.meta.dirname, '../../../skills');
  return join(dir, 'vendor', 'blender-mcp', 'addon.py').split('\\').join('/');
}

/** Optional keys for the asset libraries (config "hands"), handed to Blender as env vars. */
function assetKeys(): Record<string, string> {
  const h = (loadConfig() as any).hands ?? {};
  const out: Record<string, string> = {};
  if (h.sketchfabKey) out.BLENDERMCP_SKETCHFAB_API_KEY = h.sketchfabKey;
  if (h.polypizzaKey) out.BLENDERMCP_POLYPIZZA_API_KEY = h.polypizzaKey;
  if (h.hyper3dKey) out.BLENDERMCP_HYPER3D_API_KEY = h.hyper3dKey;
  if (h.falKey) { out.BLENDERMCP_HYPER3D_API_KEY = h.falKey; out.ALTER_HYPER3D_FAL = '1'; }
  return out;
}

/** blender.exe: Settings value, then the newest one in Program Files, then PATH. */
export function blenderExe(): string {
  const set = (loadConfig() as any).hands?.blender;
  if (set && existsSync(set)) return set;
  for (const root of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean) as string[]) {
    const base = join(root, 'Blender Foundation');
    if (!existsSync(base)) continue;
    const found = readdirSync(base)
      .filter((d) => existsSync(join(base, d, 'blender.exe')))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (found.length) return join(base, found[found.length - 1], 'blender.exe');
  }
  return 'blender';
}

function send(code: string, timeoutMs: number, who = ''): Promise<{ ok: boolean; out?: string; error?: string }> {
  return new Promise((resolve, reject) => {
    const sock = connect(PORT, '127.0.0.1');
    let buf = '';
    const t = setTimeout(() => { sock.destroy(); reject(new Error('Blender did not answer in time (it may still be working — take a screenshot).')); }, timeoutMs);
    sock.on('connect', () => sock.write(JSON.stringify({ code, who }) + '\n'));
    sock.on('data', (d) => {
      buf += d.toString('utf8');
      const i = buf.indexOf('\n');
      if (i >= 0) {
        clearTimeout(t);
        sock.end();
        try { resolve(JSON.parse(buf.slice(0, i))); } catch (e) { reject(e); }
      }
    });
    sock.on('error', (e) => { clearTimeout(t); reject(e); });
  });
}

/** Is the shared Blender there? (only checks that its port answers — it may be busy running someone's code) */
const alive = () => new Promise<boolean>((resolve) => {
  const sock = connect(PORT, '127.0.0.1');
  const t = setTimeout(() => { sock.destroy(); resolve(false); }, 2000);
  sock.on('connect', () => { clearTimeout(t); sock.destroy(); resolve(true); });
  sock.on('error', () => { clearTimeout(t); resolve(false); });
});
let starting: Promise<void> | null = null;

/** Makes sure the shared Blender window is open (starts it once, visibly). */
export async function ensureBlender(): Promise<'running' | 'started'> {
  if (await alive()) return 'running';
  if (!starting) {
    starting = (async () => {
      const d = join(tmpdir(), 'alter-hands');
      mkdirSync(d, { recursive: true });
      const script = join(d, 'blender_bridge.py');
      writeFileSync(script, BRIDGE.replace('__PORT__', String(PORT)).replace('__ADDON__', addonPath()));
      const p = spawn(blenderExe(), ['--python', script], { detached: true, stdio: 'ignore', windowsHide: false, env: { ...process.env, ...assetKeys() } });
      p.on('error', () => {});
      p.unref();
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 750));
        if (await alive()) return;
      }
      throw new Error('Blender did not start (set its path in Settings, or check that it is installed).');
    })().finally(() => { starting = null; });
  }
  await starting;
  return 'started';
}

/** Runs Python inside the shared Blender (on its main thread) and returns what it printed. */
export async function runInBlender(code: string, who = ''): Promise<{ ok: boolean; out: string; error?: string; started: boolean }> {
  const state = await ensureBlender();
  const r = await send(code, 300_000, who);
  return { ok: !!r.ok, out: r.out ?? '', error: r.error, started: state === 'started' };
}

const VIEWS: Record<string, string> = { front: 'FRONT', back: 'BACK', left: 'LEFT', right: 'RIGHT', top: 'TOP' };
/** A picture of the shared scene from an angle (the viewport the user sees turns there too). */
export async function lookInBlender(view: string): Promise<{ png?: string; error?: string }> {
  const file = join(tmpdir(), 'alter-hands', `look-${Date.now()}.png`).split('\\').join('/');
  const axis = VIEWS[view];
  const code = `import bpy, math, mathutils
s = bpy.context.scene
s.render.resolution_x, s.render.resolution_y = 1280, 760
with view3d():
    sp = bpy.context.space_data
    r3 = sp.region_3d
    if r3.view_perspective == 'CAMERA':
        r3.view_perspective = 'PERSP'
    ${axis ? `bpy.ops.view3d.view_axis(type='${axis}')` : `r3.view_rotation = mathutils.Euler((math.radians(68), 0, math.radians(${view === 'rear_three_quarter' ? 215 : 145})), 'XYZ').to_quaternion()
    r3.view_perspective = 'PERSP'`}
    sel = [o for o in bpy.context.view_layer.objects if o.select_get()]
    act = bpy.context.view_layer.objects.active
    meshes = [o for o in bpy.context.view_layer.objects if o.type == 'MESH' and o.visible_get() and not o.name.startswith(('Cube', 'ArchCutter')) and o.display_type not in ('WIRE', 'BOUNDS')]
    for o in bpy.context.view_layer.objects: o.select_set(o in meshes)
    if meshes:
        bpy.ops.view3d.view_selected()
        r3.view_distance *= 0.78
    else: bpy.ops.view3d.view_all(center=False)
    ov = sp.overlay.show_overlays
    sp.overlay.show_overlays = False
    bpy.ops.render.opengl(view_context=True)
    sp.overlay.show_overlays = ov
    for o in bpy.context.view_layer.objects: o.select_set(o in sel)
    bpy.context.view_layer.objects.active = act
bpy.data.images['Render Result'].save_render('${file}')
print('ok')`;
  const r = await runInBlender(code);
  if (!r.ok) return { error: r.error };
  const { readFileSync, rmSync } = await import('node:fs');
  const png = readFileSync(file).toString('base64');
  rmSync(file, { force: true });
  return { png };
}

/** One blender-mcp command in the shared Blender, its result as JSON. */
export async function assetCall(cmd: string, params: Record<string, unknown>, who = ''): Promise<any> {
  const code = `import json
print('@@ALTER@@' + json.dumps(mcp(${JSON.stringify(cmd)}, **json.loads(${JSON.stringify(JSON.stringify(params))})), default=str))`;
  const r = await runInBlender(code, who);
  if (!r.ok) throw new Error((r.error ?? 'failed').split('\n').filter(Boolean).slice(-2).join(' '));
  const at = r.out.lastIndexOf('@@ALTER@@');
  return at >= 0 ? JSON.parse(r.out.slice(at + 9).trim()) : r.out;
}

/** Text → textured 3D model (Hyper3D Rodin; free trial key unless one is set), imported into the shared scene. */
export async function generateModel(prompt: string, name: string, who = '', onWait?: (msg: string) => void): Promise<string> {
  const job = await assetCall('create_rodin_job', { text_prompt: prompt }, who);
  if (job?.error) throw new Error(String(job.error));
  const fal = typeof job?.request_id === 'string';
  const uuid: string = fal ? job.request_id : job?.uuid;
  const key: string | undefined = job?.jobs?.subscription_key;
  if (!uuid || (!fal && !key)) throw new Error('the generator did not start a job: ' + JSON.stringify(job).slice(0, 300));
  const started = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 6000));
    const st = await assetCall('poll_rodin_job_status', fal ? { request_id: uuid } : { subscription_key: key }, who);
    const list: string[] = fal ? [String(st?.status ?? '')] : (st?.status_list ?? []);
    if (list.some((x) => /fail/i.test(x))) throw new Error('generation failed: ' + list.join(', '));
    if (list.length && list.every((x) => /done|completed/i.test(x))) break;
    if (Date.now() - started > 8 * 60_000) throw new Error('generation took longer than 8 minutes');
    onWait?.(list.join(', ') || 'waiting');
  }
  const imp = await assetCall('import_generated_asset', fal ? { request_id: uuid, name } : { task_uuid: uuid, name }, who);
  if (imp && imp.succeed === false) throw new Error(String(imp.error ?? 'import failed'));
  return typeof imp === 'string' ? imp : JSON.stringify(imp).slice(0, 600);
}
