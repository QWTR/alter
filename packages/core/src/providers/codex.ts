import { workspaceDir } from '../config.ts';
import { detectCli, runProcess, tryJson } from './process.ts';
import type { Provider } from './types.ts';

/** ChatGPT Plus / Pro subscription through the official OpenAI Codex CLI (`codex exec`). */
export const codex: Provider = {
  id: 'codex',
  name: 'ChatGPT',
  subscription: 'ChatGPT Plus / Pro (via Codex CLI)',
  installCmd: 'npm install -g @openai/codex',
  loginCmd: 'codex login',
  loginHint: 'Run `codex login` and choose "Sign in with ChatGPT".',
  detect: () => detectCli('codex'),

  async run({ prompt, onDelta, signal, timeoutMs }) {
    const messages: string[] = [];
    let error = '';
    const r = await runProcess('codex', ['exec', '--json', '--skip-git-repo-check', '-'], {
      input: prompt,
      cwd: workspaceDir(),
      signal,
      timeoutMs,
      onLine(line) {
        const ev = tryJson(line);
        if (!ev) return;
        // current format: { type: "item.completed", item: { type: "agent_message", text } }
        const item = ev.item ?? {};
        let text: string | undefined;
        if (ev.type === 'item.completed' && (item.type === 'agent_message' || item.item_type === 'assistant_message')) text = item.text;
        // older format: { msg: { type: "agent_message", message } }
        if (ev.msg?.type === 'agent_message') text = ev.msg.message;
        if (ev.type === 'error' || ev.msg?.type === 'error') error = ev.message ?? ev.msg?.message ?? 'Codex error';
        if (text) {
          messages.push(text);
          onDelta?.((messages.length > 1 ? '\n\n' : '') + text);
        }
      },
    });

    let text = messages.join('\n\n').trim();
    if (!text && r.code === 0 && !r.stdout.trimStart().startsWith('{')) text = r.stdout.trim();
    if (!text) throw new Error(error || r.stderr.trim() || `codex exited with code ${r.code}`);
    return { text };
  },
};
