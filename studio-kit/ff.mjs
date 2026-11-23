#!/usr/bin/env node
// ffmpeg for Alter Studio. A full ffmpeg (fetched in the background after install, or one on PATH) when there is one,
// else the trimmed one that ships with Remotion (cut, join, scale, crop, rotate, audio, GIF — no colour/speed filters).
//   node ff.mjs <ffmpeg args…>        e.g. node ff.mjs -i in.mp4 -ss 3 -t 10 -c copy renders/cut.mp4
//   node ff.mjs probe <file>           duration, size, fps, streams as JSON
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const exe = process.platform === 'win32' ? '.exe' : '';
const remotionDir = (() => {
  const base = join(import.meta.dirname, 'node_modules', '@remotion');
  try {
    const d = readdirSync(base).find((n) => n.startsWith('compositor-') && existsSync(join(base, n, `ffmpeg${exe}`)));
    return d ? join(base, d) : null;
  } catch {
    return null;
  }
})();
const works = (p) => { try { return spawnSync(p, ['-version'], { stdio: 'ignore', timeout: 5000 }).status === 0; } catch { return false; } };
const full = (() => {
  const local = join(import.meta.dirname, 'node_modules', 'ffmpeg-static', 'ffmpeg' + exe);
  if (existsSync(local) && works(local)) return local;
  return works('ffmpeg') ? 'ffmpeg' : null;
})();
const bin = (name) => (name === 'ffmpeg' && full ? full : remotionDir ? join(remotionDir, name + exe) : name);
// Remotion's binaries load their libraries from their own folder
const remotionEnv = remotionDir
  ? { ...process.env, LD_LIBRARY_PATH: [remotionDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'), DYLD_LIBRARY_PATH: [remotionDir, process.env.DYLD_LIBRARY_PATH].filter(Boolean).join(':') }
  : process.env;
const env = full ? process.env : remotionEnv;

const args = process.argv.slice(2);
if (args[0] === 'probe') {
  const r = spawnSync(bin('ffprobe'), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', args[1]], { encoding: 'utf8', env: remotionEnv });
  if (r.status !== 0) {
    console.error(r.stderr || r.error?.message || 'ffprobe failed');
    process.exit(1);
  }
  const j = JSON.parse(r.stdout);
  const v = j.streams?.find((s) => s.codec_type === 'video');
  const a = j.streams?.find((s) => s.codec_type === 'audio');
  const fps = v?.avg_frame_rate && v.avg_frame_rate !== '0/0' ? (([n, d]) => Math.round((n / d) * 100) / 100)(v.avg_frame_rate.split('/').map(Number)) : null;
  console.log(JSON.stringify({
    file: args[1],
    seconds: j.format?.duration ? Number(j.format.duration) : null,
    sizeMB: j.format?.size ? Math.round(Number(j.format.size) / 10485.76) / 100 : null,
    video: v ? { codec: v.codec_name, width: v.width, height: v.height, fps, rotation: v.side_data_list?.find((x) => x.rotation)?.rotation ?? null } : null,
    audio: a ? { codec: a.codec_name, channels: a.channels, sampleRate: Number(a.sample_rate) } : null,
  }, null, 2));
  process.exit(0);
}
const child = spawn(bin('ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-stats', '-y', ...args], { stdio: 'inherit', env });
child.on('error', (e) => {
  console.error(`ffmpeg not available (${e.message}). Reinstall Studio from Alter → Studio.`);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 1));
