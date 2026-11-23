import { workspaceDir } from '../config.ts';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { detectCli, runProcess } from './process.ts';
import type { Provider } from './types.ts';

/** Google AI subscription / Google account through the official Gemini CLI (non-interactive via stdin). */
export const gemini: Provider = {
  id: 'gemini',
  name: 'Gemini',
  vendor: 'Google',
  subscription: 'Google AI Pro / Ultra · free Google account',
  installCmd: 'npm install -g @google/gemini-cli',
  loginCmd: 'gemini',
  async authStatus() {
    return existsSync(join(homedir(), '.gemini', 'oauth_creds.json')) || undefined;
  },
  models: [
    { id: 'pro', label: 'Pro' },
    { id: 'flash', label: 'Flash' },
  ],
  detect: () => detectCli('gemini'),

  async run({ prompt, onDelta, fileDirs = [], access = 'chat', cwd, signal, timeoutMs, model }) {
    let text = '';
    const r = await runProcess('gemini', [...(access === 'full' ? ['--yolo'] : []), ...(model ? ['-m', model] : []), ...(fileDirs.length ? ['--include-directories', fileDirs.join(',')] : [])], {
      input: prompt,
      cwd: cwd ?? workspaceDir(),
      signal,
      timeoutMs,
      onLine(line) {
        const chunk = (text ? '\n' : '') + line;
        text += chunk;
        onDelta?.(chunk);
      },
    });
    text = text.trim();
    if (!text) throw new Error(r.stderr.trim() || `gemini exited with code ${r.code}`);
    return { text };
  },
};
