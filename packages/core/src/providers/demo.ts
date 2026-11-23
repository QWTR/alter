import type { Provider } from './types.ts';

/** Offline stand-in so the app is usable (and testable) before any subscription is connected. */
export const demo: Provider = {
  id: 'demo',
  name: 'Demo',
  vendor: 'ALTTER',
  subscription: 'Offline demo replies',
  installCmd: '',
  loginCmd: '',
  detect: async () => ({ installed: true, version: 'built-in' }),

  async run({ prompt, onDelta, fast }) {
    if (fast) return { text: prompt.includes('Reply with exactly: OK') ? 'OK' : '[]' };
    const lastUser = prompt.split('\n').filter((l) => l.startsWith('User: ')).pop()?.slice(6) ?? '';
    const text =
      `**Demo mode** — no AI subscription is connected yet, so this is a canned reply.\n\n` +
      `You said: "${lastUser.slice(0, 200)}"\n\n` +
      `Open **Settings → AI** and connect Claude, ChatGPT or Gemini.`;
    for (const word of text.split(/(?<=\s)/)) {
      onDelta?.(word);
      await new Promise((r) => setTimeout(r, 10));
    }
    return { text };
  },
};
