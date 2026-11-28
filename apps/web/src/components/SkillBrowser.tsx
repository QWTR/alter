// Settings → Skills: browse GitHub skill repositories (most stars, recently updated, best match),
// see what every package in a repository does, read its instructions and install it — nothing is run.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, CheckCircle2, Clock, ExternalLink, FileText, Flame, Loader2, Package, Scale, Search, Sparkles, Star } from 'lucide-react';
import { api, invalidate, useData, type Skill } from '../api';
import { ago, getLang } from '../i18n';
import { renderMarkdown } from './Markdown';
import { Modal, ModalHead, Segmented } from './ui';
import { sameSkillSource } from '../skillCatalog';

type Sort = 'stars' | 'updated' | 'best';
interface Repo { name: string; description: string; url: string; stars: number; updated: string; created: string; language: string | null; topics: string[]; license: string | null; avatar: string }
interface Summary { path: string; name: string; description: string }
interface Preview { source: string; sha: string; packages: string[]; summaries?: Summary[]; path?: string; body?: string; files?: string[]; about?: { name?: string; description?: string } }

const en = {
  search: 'Search skills, e.g. SEO, video, testing, marketing', top: 'Most stars', fresh: 'Recently updated', best: 'Best match',
  empty: 'No repositories found. Try another word.', more: 'Show more', packages: '{n} skills in this repository', loading: 'Loading…',
  pick: 'What each skill does', noDesc: 'No description in SKILL.md.', instructions: 'Instructions', files: 'Files ({n})',
  install: 'Install in ALTTER', installed: 'Installed', done: 'Installed — select it in an agent’s settings → Skills.', back: 'All skills in this repository',
  safe: 'Installation downloads the files pinned to commit {sha}. Scripts in the package are never run.', updated: 'updated {ago}', open: 'GitHub',
};
const pl: typeof en = {
  search: 'Szukaj skilli, np. SEO, wideo, testy, marketing', top: 'Najwięcej gwiazdek', fresh: 'Ostatnio aktualizowane', best: 'Najtrafniejsze',
  empty: 'Nie znaleziono repozytoriów. Spróbuj innego słowa.', more: 'Pokaż więcej', packages: 'Skille w tym repozytorium: {n}', loading: 'Wczytywanie…',
  pick: 'Co potrafi każdy skill', noDesc: 'Brak opisu w SKILL.md.', instructions: 'Instrukcje', files: 'Pliki ({n})',
  install: 'Zainstaluj w ALTTER', installed: 'Zainstalowany', done: 'Zainstalowano — wybierz go w ustawieniach agenta → Skille.', back: 'Wszystkie skille z repozytorium',
  safe: 'Instalacja pobiera pliki z commita {sha}. Skrypty z paczki nigdy nie są uruchamiane.', updated: 'aktualizacja {ago}', open: 'GitHub',
};
const fill = (s: string, p: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? ''));
export const stars = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));

export function SkillBrowser({ openUrl, openRev = 0 }: { openUrl?: string; openRev?: number }) {
  const l = getLang() === 'pl' ? pl : en;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('stars');
  const [page, setPage] = useState(1);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [repo, setRepo] = useState<{ url: string; info?: Repo } | null>(null);
  const seq = useRef(0);

  const load = async (q: string, s: Sort, p: number) => {
    const id = ++seq.current;
    setBusy(true); setError('');
    try {
      const list = await api<Repo[]>(`/api/skills/github/search?q=${encodeURIComponent(q)}&sort=${s}&page=${p}`);
      if (id !== seq.current) return;
      setRepos((old) => (p > 1 && old ? [...old, ...list.filter((x) => !old.some((o) => o.url === x.url))] : list));
    } catch (e) { if (id === seq.current) setError((e as Error).message); } finally { if (id === seq.current) setBusy(false); }
  };
  useEffect(() => { setPage(1); void load(query.trim(), sort, 1); }, [sort]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (openUrl) setRepo({ url: openUrl }); }, [openUrl, openRev]);
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (query.trim().length === 1) return; setPage(1); void load(query.trim(), sort, 1); };

  return (
    <div className="skb">
      <form className="skb-bar" onSubmit={submit}>
        <label className="skb-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={l.search} aria-label={l.search} /></label>
        <Segmented value={sort} onChange={setSort} size="sm" options={[{ value: 'stars', label: l.top, icon: Star }, { value: 'updated', label: l.fresh, icon: Flame }, { value: 'best', label: l.best, icon: Sparkles }]} />
      </form>
      {error && <p className="github-skill-error" role="alert">{error}</p>}
      {repos?.length === 0 && !busy && <p className="muted" role="status">{l.empty}</p>}
      <div className="skb-grid">
        {repos?.map((r) => (
          <button key={r.url} type="button" className="skb-card" onClick={() => setRepo({ url: r.url, info: r })}>
            <span className="skb-card-head">
              {r.avatar ? <img src={`${r.avatar}&s=64`} alt="" width={28} height={28} loading="lazy" /> : <Package size={22} />}
              <b className="truncate" title={r.name}>{r.name.split('/')[1]}</b>
              <span className="skb-stars"><Star size={13} />{stars(r.stars)}</span>
            </span>
            <span className="skb-owner small faint truncate">{r.name.split('/')[0]}</span>
            <span className="skb-desc small">{r.description || '—'}</span>
            <span className="skb-meta small faint">
              <span><Clock size={12} />{fill(l.updated, { ago: ago(r.updated) })}</span>
              {r.language && <span>{r.language}</span>}
              {r.license && <span><Scale size={12} />{r.license}</span>}
            </span>
          </button>
        ))}
        {busy && !repos?.length && Array.from({ length: 6 }, (_, i) => <span key={i} className="skb-card skb-ghost" />)}
      </div>
      {!!repos?.length && repos.length >= page * 20 && (
        <button type="button" className="btn" disabled={busy} onClick={() => { const p = page + 1; setPage(p); void load(query.trim(), sort, p); }}>
          {busy ? <Loader2 size={15} className="spin" /> : null}{l.more}
        </button>
      )}
      {repo && createPortal(<RepoPreview url={repo.url} info={repo.info} onClose={() => setRepo(null)} />, document.body)}
    </div>
  );
}

function RepoPreview({ url, info, onClose }: { url: string; info?: Repo; onClose: () => void }) {
  const l = getLang() === 'pl' ? pl : en;
  const { data: installed } = useData<Skill[]>('/api/skills');
  const [list, setList] = useState<Preview | null>(null);
  const [pkg, setPkg] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const run = async (f: () => Promise<void>) => { setBusy(true); setError(''); try { await f(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const openPkg = (p: Preview, path: string) => run(async () => setPkg(await api<Preview>('/api/skills/github/preview', { method: 'POST', body: { source: p.source, path, sha: p.sha } })));
  useEffect(() => {
    void run(async () => {
      const p = await api<Preview>('/api/skills/github/preview', { method: 'POST', body: { source: url } });
      setList(p);
      if (p.path) setPkg(p); // a repository with a single skill opens straight on it
    });
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  const isInstalled = (path: string, source: string) => installed?.find((s) => s.source && s.source.path === path && sameSkillSource(s.source.url, source));
  const have = pkg?.path ? isInstalled(pkg.path, pkg.source) : undefined;
  const name = info?.name ?? url.replace(/^https:\/\/github\.com\//, '');

  return (
    <Modal open onClose={onClose} wide>
      <ModalHead icon={<Package />} title={name} text={info?.description} onClose={onClose} />
      <div className="skb-repo-meta small faint">
        {info && <span><Star size={13} />{stars(info.stars)}</span>}
        {info && <span><Clock size={13} />{fill(l.updated, { ago: ago(info.updated) })}</span>}
        {list && <span><Package size={13} />{fill(l.packages, { n: list.packages.length })}</span>}
        <a href={url} target="_blank" rel="noopener noreferrer">{l.open}<ExternalLink size={12} /></a>
      </div>
      {error && <p className="github-skill-error" role="alert">{error}</p>}
      {busy && <p className="muted row" style={{ gap: 8 }}><Loader2 size={15} className="spin" />{l.loading}</p>}
      {!pkg && list?.summaries && (
        <>
          <h3 className="skb-h">{l.pick}</h3>
          <div className="skb-pkgs">
            {list.summaries.map((s) => {
              const got = isInstalled(s.path, list.source);
              return (
                <button key={s.path} type="button" className="skb-pkg" disabled={busy} onClick={() => openPkg(list, s.path)}>
                  <span className="row" style={{ gap: 6, minWidth: 0 }}><b className="truncate">{s.name}</b>{got && <CheckCircle2 size={14} className="skb-ok" />}</span>
                  <span className="small muted">{s.description || l.noDesc}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      {pkg?.path && (
        <div className="skb-detail">
          {list && list.packages.length > 1 && <button type="button" className="btn ghost sm" onClick={() => { setPkg(null); setDone(''); }}><ArrowLeft size={14} />{l.back}</button>}
          <h3 className="skb-h">{pkg.about?.name || pkg.path}</h3>
          {pkg.about?.description && <p className="skb-about">{pkg.about.description}</p>}
          <p className="small faint">{fill(l.safe, { sha: pkg.sha.slice(0, 8) })}</p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn primary" disabled={busy || !!have || !!done} onClick={() => run(async () => {
              await api('/api/skills/github/install', { method: 'POST', body: { source: pkg.source, path: pkg.path, sha: pkg.sha } });
              invalidate('/api/skills'); setDone(l.done);
            })}>{have || done ? <><CheckCircle2 size={15} />{l.installed}</> : l.install}</button>
          </div>
          {done && <p role="status" className="skb-ok">{done}</p>}
          <details className="skb-body" open>
            <summary><FileText size={14} />{l.instructions}</summary>
            <div className="github-skill-preview" dangerouslySetInnerHTML={{ __html: renderMarkdown((pkg.body ?? '').replace(/^---\r?\n[\s\S]*?\r?\n---\s*/, '')) }} />
          </details>
          {pkg.files && <details><summary>{fill(l.files, { n: pkg.files.length })}</summary><pre>{pkg.files.join('\n')}</pre></details>}
        </div>
      )}
    </Modal>
  );
}
