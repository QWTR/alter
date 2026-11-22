#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { HOME, loadConfig } from './config.ts';
import { start } from './index.ts';
import { providerStatuses } from './providers/index.ts';
import { VERSION } from './version.ts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: 'string', short: 'p' },
    host: { type: 'string' },
    local: { type: 'boolean', description: 'Only listen on this computer (no phone access)' },
  },
});

const cmd = positionals[0] ?? 'start';

switch (cmd) {
  case 'start': {
    await start({
      port: values.port ? Number(values.port) : undefined,
      host: values.local ? '127.0.0.1' : values.host,
    });
    break;
  }
  case 'pair': {
    // Asks the running Alter for a pairing code.
    const cfg = loadConfig();
    const r = await fetch(`http://127.0.0.1:${cfg.port}/api/pair/start`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.ownerToken}` },
    }).catch(() => null);
    if (!r?.ok) {
      console.error('Alter is not running. Start it with: npm start');
      process.exit(1);
    }
    const p = (await r.json()) as { code: string; urls: string[] };
    console.log(`\n  Pairing code: ${p.code}  (valid 5 minutes)\n`);
    for (const u of p.urls) console.log(`  Open on your phone: ${u}`);
    console.log('');
    break;
  }
  case 'status': {
    console.log(`Alter ${VERSION} — data in ${HOME}\n`);
    for (const p of await providerStatuses(true)) {
      console.log(`  ${p.installed ? '●' : '○'} ${p.name.padEnd(16)} ${p.installed ? p.version : `not installed — ${p.installCmd}`}`);
    }
    break;
  }
  default:
    console.log(`alter ${VERSION}\n\nUsage:\n  alter start [--port 7420] [--local]\n  alter pair\n  alter status`);
}
