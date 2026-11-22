import { workspaceDir } from '../config.ts';
import { detectCli, runProcess, tryJson } from './process.ts';
import type { Provider } from './types.ts';

/** Claude Pro / Max subscription through the official Claude Code CLI (`claude -p`). */
export const claude: Provider = {
  id: 'claude',
  name: 'Claude',
  subscription: 'Claude Pro / Max (via Claude Code)',
  installCmd: 'npm install -g @anthropic-ai/claude-code',
  loginCmd: 'claude',
  loginHint: 'Run `claude` once and sign in with your Claude account (/login).',
  detect: () => detectCli('claude'),

  async run({ prompt, onDelta, fast, tools, signal, timeoutMs }) {
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
    if (fast) args.push('--model', 'haiku');
    if (tools?.length) args.push('--allowedTools', tools.join(','));

    let streamed = '';
    let final = '';
    let error = '';
    const r = await runProcess('claude', args, {
      input: prompt,
      cwd: workspaceDir(),
      signal,
      timeoutMs,
      onLine(line) {
        const ev = tryJson(line);
        if (!ev) return;
        if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta') {
          streamed += ev.event.delta.text;
          onDelta?.(ev.event.delta.text);
        } else if (ev.type === 'stream_event' && ev.event?.type === 'content_block_start' && streamed && !streamed.endsWith('\n')) {
          // separate text blocks (e.g. before/after a tool call)
          streamed += '\n\n';
          onDelta?.('\n\n');
        } else if (ev.type === 'result') {
          if (ev.is_error) error = String(ev.result ?? ev.subtype ?? 'Claude returned an error');
          else final = String(ev.result ?? '');
        }
      },
    });

    const text = (streamed.trim() || final.trim());
    if (!text) throw new Error(error || r.stderr.trim() || `claude exited with code ${r.code}`);
    if (!streamed && final) onDelta?.(final);
    return { text };
  },
};
