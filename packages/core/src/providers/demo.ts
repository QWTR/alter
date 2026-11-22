import type { Provider } from './types.ts';

/** Offline stand-in so the app is usable (and testable) before any subscription is connected. */
export const demo: Provider = {
  id: 'demo',
  name: 'Demo (offline)',
  subscription: 'No subscription — canned replies for trying the app',
  installCmd: '',
  loginCmd: '',
  loginHint: 'Always available.',
  detect: async () => ({ installed: true, version: 'built-in' }),

  async run({ prompt, onDelta, fast }) {
    if (fast) return { text: '[]' }; // learning pass: nothing to extract
    const lastUser = prompt.split('\n').filter((l) => l.startsWith('User: ')).pop()?.slice(6) ?? '';
    const text =
      `I'm running in demo mode, so this is a canned reply.\n\n` +
      `You said: "${lastUser.slice(0, 200)}"\n\n` +
      `Connect Claude, ChatGPT or Gemini in **Settings → AI subscriptions** and I'll answer for real, ` +
      `with everything I remember about you.`;
    for (const word of text.split(/(?<=\s)/)) {
      onDelta?.(word);
      await new Promise((r) => setTimeout(r, 12));
    }
    return { text };
  },
};
