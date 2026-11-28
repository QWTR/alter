import { useState } from 'react';
import { api, invalidate } from '../api';
import { getLang } from '../i18n';
import { renderMarkdown } from './Markdown';

const en = {
  title: 'Add a skill from GitHub', search: 'Search repositories', link: 'GitHub repository or SKILL.md URL',
  preview: 'Preview', install: 'Install and select', pick: 'Choose a package', empty: 'No repositories found.',
  notice: 'Review the instructions before assigning them to an agent. Installation downloads files and never runs their scripts.',
  searchLabel: 'Find a skill', files: 'Package files', busy: 'Loading…',
};
const pl: typeof en = {
  title: 'Dodaj skill z GitHuba', search: 'Szukaj repozytoriów', link: 'Adres repozytorium GitHub lub pliku SKILL.md',
  preview: 'Podgląd', install: 'Zainstaluj i zaznacz', pick: 'Wybierz paczkę', empty: 'Nie znaleziono repozytoriów.',
  notice: 'Przeczytaj instrukcje przed przypisaniem do agenta. Instalacja pobiera pliki i nigdy nie uruchamia ich skryptów.',
  searchLabel: 'Znajdź skill', files: 'Pliki paczki', busy: 'Wczytywanie…',
};
interface Preview { source: string; sha: string; packages: string[]; path?: string; body?: string; files?: string[] }
export function GitHubSkills({ onInstalled }: { onInstalled: (id: string) => void }) {
  const l = getLang() === 'pl' ? pl : en;
  const [open, setOpen] = useState(false), [source, setSource] = useState(''), [query, setQuery] = useState('');
  const [results, setResults] = useState<{ name: string; description: string; url: string }[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function run(action: () => Promise<void>) {
    if (busy) return;setBusy(true);setError('');
    try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function inspect(url: string, path?: string, sha?: string) {
    setPreview(null);
    await run(async () => { const p = await api<Preview>('/api/skills/github/preview', { method: 'POST', body: { source: url, path, sha } });setSource(url);setPreview(p); });
  }
  return <details className="github-skills" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>{l.title}</summary>
    <div className="github-skill-body">
      <p className="small muted">{l.notice}</p>
      <label>{l.searchLabel}<input className="input" value={query} onChange={e => setQuery(e.target.value)} disabled={busy} /></label>
      <button type="button" className="btn sm" disabled={busy || query.trim().length < 2} onClick={() => run(async () => { setResults(await api(`/api/skills/github/search?q=${encodeURIComponent(query)}`)); })}>{l.search}</button>
      {results?.length === 0 && <p role="status">{l.empty}</p>}
      {results?.map(r => <button type="button" className="btn github-repository" key={r.url} disabled={busy} onClick={() => inspect(r.url)}><b>{r.name}</b><span>{r.description}</span></button>)}
      <label>{l.link}<input className="input" value={source} disabled={busy} placeholder="https://github.com/owner/repository" onChange={e => { setSource(e.target.value);setPreview(null); }} /></label>
      <button type="button" className="btn sm" disabled={busy || !source.trim()} onClick={() => inspect(source)}>{l.preview}</button>
      {busy && <p role="status">{l.busy}</p>}
      {error && <p className="github-skill-error" role="alert">{error}</p>}
      {preview && <>
        <label>{l.pick}<select className="input" value={preview.path ?? ''} disabled={busy} onChange={e => { if (e.target.value) inspect(preview.source, e.target.value, preview.sha); }}>
          <option value="" disabled>{l.pick}</option>{preview.packages.map(p => <option key={p} value={p}>{p}</option>)}
        </select></label>
        <p className="small mono">SHA: {preview.sha}</p>
        {preview.body && <div className="github-skill-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(preview.body) }} />}
        {preview.files && <details><summary>{l.files} ({preview.files.length})</summary><pre>{preview.files.join('\n')}</pre></details>}
        {preview.path && <button type="button" className="btn primary sm" disabled={busy} onClick={() => run(async () => {
          const result = await api<{ id: string }>('/api/skills/github/install', { method: 'POST', body: { source: preview.source, path: preview.path, sha: preview.sha } });
          invalidate('/api/skills');onInstalled(result.id);setPreview(null);setOpen(false);
        })}>{l.install}</button>}
      </>}
    </div>
  </details>;
}
