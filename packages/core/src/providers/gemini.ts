import { workspaceDir } from '../config.ts';
import { detectCli, runProcess } from './process.ts';
import type { Provider } from './types.ts';

/** Google AI subscription / Google account through the official Gemini CLI (non-interactive via stdin). */
export const gemini: Provider = {
  id: 'gemini',
  name: 'Gemini',
  subscription: 'Google AI Pro / Ultra or free Google account (via Gemini CLI)',
  installCmd: 'npm install -g @google/gemini-cli',
  loginCmd: 'gemini',
  loginHint: 'Run `gemini` once and choose "Login with Google".',
  detect: () => detectCli('gemini'),

  async run({ prompt, onDelta, signal, timeoutMs }) {
    let text = '';
    const r = await runProcess('gemini', [], {
      input: prompt,
      cwd: workspaceDir(),
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
