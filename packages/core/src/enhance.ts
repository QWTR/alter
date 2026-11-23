// "Improve prompt": a quick, cheap pass that turns a rough message into a clear, complete brief —
// fewer back-and-forth turns and fewer tokens on the real run.
import { resolveProvider } from './providers/index.ts';
import { wantsCreative } from './studio.ts';
import { wantsTravel } from './travel.ts';

const KIND_HINT: Record<string, string> = {
  video: 'It is for a video/motion graphic: name the format (9:16, 1:1, 16:9), length in seconds, the hook, 3–6 scenes with on-screen text, style/colours, ending (logo/CTA).',
  image: 'It is for an image/graphic: subject, composition, style (photo, 3D, flat…), colours, mood, format, what text goes on it (exact wording).',
  code: 'It is a coding task: goal, where in the project, constraints, what "done" looks like, how to verify.',
  travel: 'It is a trip: from, to, dates (flexible?), travelers, budget, style, interests.',
  general: '',
};

export async function enhancePrompt(text: string, kind = 'general', language = 'the language of the draft'): Promise<string> {
  const draft = text.trim().slice(0, 4000);
  if (!draft) throw new Error('Nothing to improve');
  if (kind === 'general') kind = wantsTravel(draft) ? 'travel' : wantsCreative(draft, []) ? (/wideo|video|rolk|reel|film|motion|animac|tiktok/i.test(draft) ? 'video' : 'image') : /(kod|code|bug|funkcj|komponent|api|endpoint|refactor|test)/i.test(draft) ? 'code' : 'general';
  const provider = await resolveProvider('default');
  const prompt = `Rewrite the user's draft message to an AI assistant so it gets the best result on the first try.
Rules: keep the user's intent, facts, names and language (${language}); do not invent facts — where something important is missing, add a sensible default the user can change, in [brackets]; be specific and structured (short lines or bullets), no fluff, no greeting, max ~120 words. ${KIND_HINT[kind] ?? ''}
Return ONLY the rewritten message, nothing else.

Draft:
"""
${draft}
"""`;
  const { text: out } = await provider.run({ prompt, fast: true, access: 'chat', timeoutMs: 60_000 });
  return out.trim().replace(/^```\w*\n?|```$/g, '').replace(/^"""|"""$/g, '').trim();
}
