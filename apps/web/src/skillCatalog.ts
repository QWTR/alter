/** Editorial picks, not an automatic popularity ranking. Links checked 2026-11-28. */
export const skillRepositories = [
  {
    name: 'Anthropic Skills', repo: 'anthropics/skills',
    description: { pl: 'Tworzenie dokumentów, PDF-ów i prezentacji, projektowanie stron oraz testowanie aplikacji.', en: 'Create documents, PDFs and presentations, design websites, and test applications.' },
  },
  {
    name: 'OpenAI Skills', repo: 'openai/skills',
    description: { pl: 'Paczki do pracy z kodem, dokumentami i narzędziami. Wybierz instrukcje potrzebne Twojemu agentowi.', en: 'Skill packages for code, documents, and tools. Pick the instructions your agent needs.' },
  },
  {
    name: 'Vercel Agent Skills', repo: 'vercel-labs/agent-skills',
    description: { pl: 'Wydajność React i Next.js, projektowanie interfejsów oraz dobre praktyki aplikacji webowych.', en: 'React and Next.js performance, interface design, and web application best practices.' },
  },
] as const;

/** GitHub tree/blob URLs and repository URLs identify the same skill source. */
export function sameSkillSource(a: string, b: string): boolean {
  const key = (value: string) => {
    try { const u = new URL(value);return u.hostname === 'github.com' ? u.pathname.split('/').slice(1, 3).join('/').replace(/\.git$/, '').toLowerCase() : ''; } catch { return ''; }
  };
  return !!key(a) && key(a) === key(b);
}
