// Free, offline AI images on this computer's own graphics card — stable-diffusion.cpp (MIT, github.com/leejet/stable-diffusion.cpp).
// One click in Media → "On this computer" downloads the engine (~30 MB, Vulkan build: NVIDIA/AMD/Intel) and a model;
// after that every picture is free, private and needs no internet. Models are picked to fit 4 GB of VRAM.
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { HOME } from './config.ts';

export const localDir = () => process.env.ALTER_LOCAL_AI_DIR ?? join(HOME, 'local-ai');
const binDir = () => join(localDir(), 'bin');
const modelsDir = () => join(localDir(), 'models');

interface LocalFile { name: string; url: string; mb: number }
export interface LocalModelDef { id: string; label: string; note: string; files: LocalFile[]; base: number; args: (f: Record<string, string>) => string[] }

const HF = 'https://huggingface.co';
export const LOCAL_MODELS: LocalModelDef[] = [
  {
    id: 'dreamshaper-lcm',
    label: 'DreamShaper 8 LCM',
    note: 'fast (~10–30 s), 2 GB, any picture style',
    files: [{ name: 'DreamShaper8_LCM.safetensors', url: `${HF}/Lykon/DreamShaper/resolve/main/DreamShaper8_LCM.safetensors`, mb: 2134 }],
    base: 512,
    args: (f) => ['-m', f['DreamShaper8_LCM.safetensors'], '--sampling-method', 'lcm', '--steps', '6', '--cfg-scale', '1.5', '--vae-tiling', '-n', 'blurry, lowres, watermark, text, deformed'],
  },
  {
    id: 'z-image-turbo',
    label: 'Z-Image Turbo',
    note: 'best quality, photoreal + text in pictures (~1–3 min), 5.5 GB',
    files: [
      { name: 'z_image_turbo-Q3_K.gguf', url: `${HF}/leejet/Z-Image-Turbo-GGUF/resolve/main/z_image_turbo-Q3_K.gguf`, mb: 3144 },
      { name: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf', url: `${HF}/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf`, mb: 2497 },
      { name: 'ae.safetensors', url: `${HF}/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors`, mb: 335 },
    ],
    base: 1024,
    args: (f) => ['--diffusion-model', f['z_image_turbo-Q3_K.gguf'], '--llm', f['Qwen3-4B-Instruct-2507-Q4_K_M.gguf'], '--vae', f['ae.safetensors'], '--cfg-scale', '1.0', '--steps', '8', '--offload-to-cpu', '--vae-tiling'],
  },
];

// ---------- engine ----------
function findCli(dir: string): string | null {
  if (!existsSync(dir)) return null;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { const r = findCli(p); if (r) return r; }
    else if (/^sd(-cli)?(\.exe)?$/i.test(e.name)) return p;
  }
  return null;
}
export const engineCli = () => findCli(binDir());
const ENGINE_TAG = 'master-795-87a0177';

/** The release asset for this computer (GPU build where there is one). */
function assetPattern(): RegExp {
  if (process.platform === 'win32') return /bin-win-vulkan-x64\.zip$/;
  if (process.platform === 'darwin') return /bin-Darwin-.*arm64\.zip$/;
  return /bin-Linux-.*x86_64-vulkan\.zip$/;
}

// ---------- download state (the app polls /api/media/local) ----------
interface Job { model: string; step: string; done: number; total: number; error: string | null; running: boolean }
let job: Job | null = null;

const fileDone = (f: LocalFile) => {
  const p = join(modelsDir(), f.name);
  return existsSync(p) && statSync(p).size > f.mb * 1e6 * 0.9;
};
export const modelInstalled = (id: string) => !!engineCli() && !!LOCAL_MODELS.find((m) => m.id === id)?.files.every(fileDone);
export const anyLocalModel = () => LOCAL_MODELS.find((m) => modelInstalled(m.id))?.id ?? null;

export function localStatus() {
  return {
    dir: localDir(),
    engine: !!engineCli(),
    job,
    models: LOCAL_MODELS.map((m) => ({ id: m.id, label: m.label, note: m.note, sizeMb: m.files.reduce((s, f) => s + f.mb, 0), installed: modelInstalled(m.id) })),
  };
}

async function fetchTo(url: string, dest: string, onBytes: (n: number) => void) {
  const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'ALTTER' } });
  if (!r.ok || !r.body) throw new Error(`Download failed (${r.status}): ${url.split('/').pop()}`);
  const part = `${dest}.part`;
  const src = Readable.fromWeb(r.body as any);
  src.on('data', (c: Buffer) => onBytes(c.length));
  await pipeline(src, createWriteStream(part));
  renameSync(part, dest);
}

async function installEngine() {
  if (engineCli()) return;
  job!.step = 'engine';
  // pinned: the builds after ~Oct 2026 have a new memory manager that refuses to run when RAM is tight ("0 bytes available");
  // this one was tested on a 4 GB GTX 1650 with the GPU busy and ~1 GB of free RAM
  const rel: any = await (await fetch(`https://api.github.com/repos/leejet/stable-diffusion.cpp/releases/tags/${ENGINE_TAG}`, { headers: { 'user-agent': 'ALTTER', accept: 'application/vnd.github+json' } })).json();
  const asset = (rel.assets ?? []).find((a: any) => assetPattern().test(a.name));
  if (!asset) throw new Error('No stable-diffusion.cpp build for this computer');
  mkdirSync(binDir(), { recursive: true });
  const zip = join(localDir(), 'engine.zip');
  job!.total += asset.size;
  await fetchTo(asset.browser_download_url, zip, (n) => (job!.done += n));
  // Windows' own tar.exe reads zip files; on Linux/mac unzip does
  const [cmd, args] = process.platform === 'win32' ? ['C:\\Windows\\System32\\tar.exe', ['-xf', zip, '-C', binDir()]] : ['unzip', ['-o', '-q', zip, '-d', binDir()]];
  await new Promise<void>((res, rej) => {
    const p = spawn(cmd, args as string[], { windowsHide: true });
    p.on('error', rej);
    p.on('close', (c) => (c ? rej(new Error(`Could not unpack the engine (${cmd} exit ${c})`)) : res()));
  });
  rmSync(zip, { force: true });
  const cli = engineCli();
  if (!cli) throw new Error('The engine download had no sd-cli program');
  if (process.platform !== 'win32') spawn('chmod', ['+x', cli]);
}

/** Downloads the engine (if needed) and a model in the background. */
export function installLocal(modelId: string) {
  const m = LOCAL_MODELS.find((x) => x.id === modelId);
  if (!m) throw new Error('Unknown local model');
  if (job?.running) throw new Error('A download is already running');
  job = { model: m.id, step: 'start', done: 0, total: m.files.filter((f) => !fileDone(f)).reduce((s, f) => s + f.mb * 1e6, 0), error: null, running: true };
  void (async () => {
    try {
      await installEngine();
      mkdirSync(modelsDir(), { recursive: true });
      for (const f of m.files) {
        if (fileDone(f)) continue;
        job!.step = f.name;
        await fetchTo(f.url, join(modelsDir(), f.name), (n) => (job!.done += n));
      }
      job = { ...job!, step: 'done', running: false };
    } catch (e) {
      job = { ...job!, error: (e as Error).message, running: false };
    }
  })();
  return localStatus();
}

export function removeLocal(modelId: string) {
  const m = LOCAL_MODELS.find((x) => x.id === modelId);
  if (!m) throw new Error('Unknown local model');
  const shared = new Set(LOCAL_MODELS.filter((x) => x.id !== m.id && modelInstalled(x.id)).flatMap((x) => x.files.map((f) => f.name)));
  for (const f of m.files) if (!shared.has(f.name)) rmSync(join(modelsDir(), f.name), { force: true });
  return localStatus();
}

// ---------- generation (one at a time: one graphics card) ----------
let gpu: Promise<unknown> = Promise.resolve();

export function makeLocal(prompt: string, modelId: string, width: number, height: number): Promise<{ data: Buffer; ext: string }> {
  const run = async () => {
    const m = LOCAL_MODELS.find((x) => x.id === modelId);
    const cli = engineCli();
    if (!m || !cli || !modelInstalled(m.id)) throw new Error('This local model is not installed yet — Media → On this computer.');
    const files = Object.fromEntries(m.files.map((f) => [f.name, join(modelsDir(), f.name)]));
    const work = mkdtempSync(join(tmpdir(), 'alter-sd-'));
    const out = join(work, 'out.png');
    const args = [...m.args(files), '-p', prompt, '-W', String(width), '-H', String(height), '-s', String(Math.floor(Math.random() * 2 ** 31)), '-o', out];
    const once = (extra: string[]) => new Promise<void>((res, rej) => {
      const p = spawn(cli, [...args, ...extra], { windowsHide: true, cwd: work, stdio: ['ignore', 'pipe', 'pipe'] });
      let log = '';
      const keep = (d: Buffer) => { log = (log + d).slice(-4000); };
      p.stdout.on('data', keep);
      p.stderr.on('data', keep);
      const timer = setTimeout(() => p.kill(), 15 * 60_000);
      p.on('error', rej);
      p.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0 && existsSync(out)) return res();
        const last = log.trim().split(/\r?\n/).filter((l) => /\[E\]|\[ERROR|error|fail|out of memory/i.test(l)).pop();
        // no error line = the engine crashed, almost always the graphics card or RAM running out
        rej(new Error(last
          ? `Local engine: ${last.replace(/^\[\w+\s*\]\s*/, '').slice(0, 300)}`
          : 'Local engine stopped: the graphics card or memory is busy (a game, Blender, Unity…). Close them and try again, or pick a cloud model.'));
      });
    });
    try {
      try {
        await once([]);
      } catch (e) {
        // a busy graphics card (a game, Blender…) can run out of memory: retry once with the weights kept in RAM
        if (args.includes('--offload-to-cpu')) throw e;
        await once(['--offload-to-cpu']);
      }
      return { data: readFileSync(out), ext: '.png' };
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  };
  const p = gpu.then(run, run);
  gpu = p.catch(() => {});
  return p;
}
