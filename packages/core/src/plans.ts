// Plan mode: for a bigger task the AI first looks around (read-only), then writes a plan as a card.
// The user approves it (then it is carried out step by step) or asks for changes.

export const PLAN_FENCE = 'alter-plan';

export interface PlanStep { title: string; detail?: string }
export interface Plan {
  title: string;
  goal?: string;
  steps: PlanStep[];
  deliverables?: string[];
  questions?: string[];
  estimate?: string;
  risks?: string[];
}

export const PLAN_GUIDE = `## Plan mode (the user turned it on)
Do NOT do the task yet and do NOT change any file. First understand it: read the relevant files and search where it helps (you have read-only access). Then reply with:
1. One or two sentences on what you understood (in the user's language).
2. Exactly one fenced block with the plan as JSON:
\`\`\`${PLAN_FENCE}
{"title":"short name of the task","goal":"what will be true when it is done","steps":[{"title":"imperative step, ≤8 words","detail":"what exactly, which files/tools, 1–2 sentences"}],"deliverables":["what the user gets"],"estimate":"~15 min","risks":["only real ones"],"questions":["only what you cannot decide yourself"]}
\`\`\`
Rules: 3–12 concrete steps in execution order, each one verifiable; merge trivial ones; the cheapest path that fully does the job (reuse what exists, no busywork). Put real decisions the user must make into "questions" (max 3) — otherwise leave it empty. Nothing after the block except, if useful, one line inviting changes. The user approves the plan with a button; then you carry it out.`;

export const PLAN_APPROVED_GUIDE = `## The user approved the plan above
Carry it out now, step by step, without planning again. Before each step write one short line "▸ Step N/M: …" so the user can follow. If something in the plan turns out wrong, adapt with the smallest change and say so in one line. Finish with a short summary of what was done and anything left.`;

/** The user typed "/plan …" or similar instead of using the switch. */
export const wantsPlan = (msg: string) => /^\s*\/plan(?:\s|$)/i.test(msg);
export const isPlanApproval = (msg: string, history: { role: string; content: string }[]) =>
  /^\s*✅/.test(msg) && history.slice(-4).some((h) => h.role === 'assistant' && h.content.includes('```' + PLAN_FENCE));

export function plansIn(text: string): Plan[] {
  const out: Plan[] = [];
  const re = new RegExp('```' + PLAN_FENCE + '\\s*\\n([\\s\\S]*?)```', 'g');
  for (const m of text.matchAll(re)) {
    try {
      const p = JSON.parse(m[1]);
      if (p && typeof p.title === 'string' && Array.isArray(p.steps)) out.push(p);
    } catch {}
  }
  return out;
}
