import { startScheduler } from './agents.ts';
import { HOME, loadConfig } from './config.ts';
import { getDb } from './db.ts';
import { lanUrls } from './pairing.ts';
import { startServer } from './server.ts';

export async function start(opts: { port?: number; host?: string; quiet?: boolean } = {}) {
  const cfg = loadConfig();
  getDb();
  const port = opts.port ?? cfg.port;
  const host = opts.host ?? cfg.host;
  const server = await startServer(port, host);
  const stopScheduler = startScheduler();

  if (!opts.quiet) {
    console.log(`\n  ◆ Alter is running\n`);
    console.log(`    On this computer:  http://localhost:${port}`);
    if (host === '0.0.0.0') for (const u of lanUrls(port)) console.log(`    On your phone:     ${u}  (pair in Settings → Devices)`);
    console.log(`    Data:              ${HOME}\n`);
  }

  return {
    port,
    url: `http://localhost:${port}`,
    close: () => {
      stopScheduler();
      server.close();
    },
  };
}

export * from './agents.ts';
export * from './chat.ts';
export * from './memory.ts';
export { providers, providerStatuses, resolveProvider } from './providers/index.ts';
