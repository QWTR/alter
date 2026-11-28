import { useEffect, useRef, useState } from 'react';
import { api, invalidate, useData, type Skill } from '../api';
import { getLang } from '../i18n';
import { renderMarkdown } from './Markdown';
import { sameSkillSource } from '../skillCatalog';

const en = {
  title: 'Add a skill from GitHub', search: 'Search repositories', link: 'GitHub repository or SKILL.md URL',
  preview: 'Preview', install: 'Install and select', pick: 'Choose a package', empty: 'No repositories found.',
  notice: 'Review the instructions before assigning them to an agent. Installation downloads files and never runs their scripts.',
  searchLabel: 'Find a skill', files: 'Package files', busy: 'Loading…',
  libraryTitle: 'Find and install skills', libraryInstall: 'Install in ALTTER', installed: 'Installed', assign: 'Select installed skill', success: 'Skill installed. You can now select it in an agent’s settings.',
};
const pl: typeof en = {
  title: 'Dodaj skill z GitHuba', search: 'Szukaj repozytoriów', link: 'Adres repozytorium GitHub lub pliku SKILL.md',
  preview: 'Podgląd', install: 'Zainstaluj i zaznacz', pick: 'Wybierz paczkę', empty: 'Nie znaleziono repozytoriów.',
  notice: 'Przeczytaj instrukcje przed przypisaniem do agenta. Instalacja pobiera pliki i nigdy nie uruchamia ich skryptów.',
  searchLabel: 'Znajdź skill', files: 'Pliki paczki', busy: 'Wczytywanie…',
  libraryTitle: 'Wyszukaj i zainstaluj skille', libraryInstall: 'Zainstaluj w ALTTER', installed: 'Zainstalowano', assign: 'Zaznacz zainstalowany skill', success: 'Skill zainstalowany. Możesz go teraz wybrać w ustawieniach agenta.',
};
interface Preview { source: string; sha: string; packages: string[]; path?: string; body?: string; files?: string[] }
export function GitHubSkills({ onInstalled, library = false, initialSource = '' }: { onInstalled?: (id: string) => void; library?: boolean; initialSource?: string }) {
  const l = getLang() === 'pl' ? pl : en;
  const [open, setOpen] = useState(library), [source, setSource] = useState(initialSource), [query, setQuery] = useState('');
  const { data: installed } = useData<Skill[]>('/api/skills');
  const [success, setSuccess] = useState('');
  const lock = useRef(false);
  const [results, setResults] = useState<{ name: string; description: string; url: string }[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function run(action: () => Promise<void>) {
    if (lock.current) return;lock.current = true;setBusy(true);setError('');setSuccess('');
    try { await action(); } catch (e) { setError((e as Error).message); } finally { lock.current = false;setBusy(false); }
  }
  async function inspect(url: string, path?: string, sha?: string) {
    setPreview(null);
    await run(async () => { const p = await api<Preview>('/api/skills/github/preview', { method: 'POST', body: { source: url, path, sha } });setSource(url);setPreview(p); });
  }
  useEffect(() => { if (initialSource) void inspect(initialSource); }, [initialSource]);
  const existing = preview?.path ? installed?.find(s => s.source && s.source.path === preview.path && sameSkillSource(s.source.url, preview.source)) : undefined;
  return <details className="github-skills" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>{library ? l.libraryTitle : l.title}</summary>
    <div className="github-skill-body">
      <p className="small muted">{l.notice}</p>
      <label>{l.searchLabel}<input className="input" value={query} onChange={e => setQuery(e.target.value)} disabled={busy} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault();if (query.trim().length >= 2) void run(async () => { setResults(await api(`/api/skills/github/search?q=${encodeURIComponent(query)}`)); }); } }} /></label>
      <button type="button" className="btn sm" disabled={busy || query.trim().length < 2} onClick={() => run(async () => { setResults(await api(`/api/skills/github/search?q=${encodeURIComponent(query)}`)); })}>{l.search}</button>
      {results?.length === 0 && <p role="status">{l.empty}</p>}
      {results?.map(r => <button type="button" className="btn github-repository" key={r.url} disabled={busy} onClick={() => inspect(r.url)}><b>{r.name}</b><span>{r.description}</span></button>)}
      <label>{l.link}<input className="input" value={source} disabled={busy} placeholder="https://github.com/owner/repository" onChange={e => { setSource(e.target.value);setPreview(null); }} /></label>
      <button type="button" className="btn sm" disabled={busy || !source.trim()} onClick={() => inspect(source)}>{l.preview}</button>
      {busy && <p role="status">{l.busy}</p>}
      {error && <p className="github-skill-error" role="alert">{error}</p>}
      {success && <p role="status">{success}</p>}
      {preview && <>
        <label>{l.pick}<select className="input" value={preview.path ?? ''} disabled={busy} onChange={e => { if (e.target.value) inspect(preview.source, e.target.value, preview.sha); }}>
          <option value="" disabled>{l.pick}</option>{preview.packages.map(p => <option key={p} value={p}>{p}</option>)}
        </select></label>
        <p className="small mono">SHA: {preview.sha}</p>
        {preview.body && <div className="github-skill-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(preview.body) }} />}
        {preview.files && <details><summary>{l.files} ({preview.files.length})</summary><pre>{preview.files.join('\n')}</pre></details>}
        {existing && <p className="small">{l.installed} · {existing.name} · <span className="mono">{existing.source?.sha.slice(0, 8)}</span></p>}
        {preview.path && <button type="button" className="btn primary sm" disabled={busy || (library && (!!existing || !!success))} onClick={() => run(async () => {
          if (existing) { onInstalled?.(existing.id);setPreview(null);setOpen(false);return; }
          const result = await api<{ id: string }>('/api/skills/github/install', { method: 'POST', body: { source: preview.source, path: preview.path, sha: preview.sha } });
          invalidate('/api/skills');onInstalled?.(result.id);
          if (library) setSuccess(l.success);else { setPreview(null);setOpen(false); }
        })}>{existing || (library && success) ? (library ? l.installed : l.assign) : library ? l.libraryInstall : l.install}</button>}
      </>}
    </div>
  </details>;
}
