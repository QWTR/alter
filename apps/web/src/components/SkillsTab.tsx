import { useState } from 'react';
import { ArrowDownToLine, BookOpen, ExternalLink } from 'lucide-react';
import { useData, type Skill } from '../api';
import { getLang } from '../i18n';
import { skillRepositories } from '../skillCatalog';
import { SkillBrowser } from './SkillBrowser';

export function SkillsTab() {
  const pl = getLang() === 'pl';
  const { data: skills } = useData<Skill[]>('/api/skills');
  const [selection, setSelection] = useState({ url: '', revision: 0 });
  return <div className="skill-catalog">
    <div>
      <h2>{pl ? 'Skille dla ALTTER-a' : 'Skills for ALTTER'}</h2>
      <p className="muted">{pl ? 'Dodaj umiejętności do swojej biblioteki, a potem przypisz je wybranym agentom.' : 'Add skills to your library, then assign them to your agents.'}</p>
    </div>
    <div className="skill-catalog-search"><SkillBrowser openUrl={selection.url} openRev={selection.revision} /></div>
    <section aria-labelledby="recommended-skills">
      <h3 id="recommended-skills">{pl ? 'Polecane repozytoria' : 'Recommended repositories'}</h3>
      <div className="skill-repositories">
        {skillRepositories.map(repo => <article key={repo.repo} className="card skill-repo-card">
          <BookOpen size={22} className="muted" />
          <h3>{repo.name}</h3>
          <a href={`https://github.com/${repo.repo}`} target="_blank" rel="noopener noreferrer" className="small muted">{repo.repo}<ExternalLink size={12} /></a>
          <p>{repo.description[pl ? 'pl' : 'en']}</p>
          <button type="button" className="btn" onClick={() => { setSelection(s => ({ url: `https://github.com/${repo.repo}`, revision: s.revision + 1 })); }}><ArrowDownToLine size={16} />{pl ? 'Zobacz skille' : 'See skills'}</button>
        </article>)}
      </div>
    </section>
    <section aria-labelledby="installed-skills">
      <h3 id="installed-skills">{pl ? 'Twoja biblioteka' : 'Your library'} {skills ? `(${skills.length})` : ''}</h3>
      <p className="small muted">{pl ? 'Zainstalowane skille znajdziesz przy edycji agenta → Skille. Instalacja nie włącza ich automatycznie we wszystkich rozmowach.' : 'Select installed skills in an agent’s settings → Skills. Installation does not activate them in every conversation.'}</p>
      <div className="skill-library">
        {skills?.map(skill => <article className="card" key={skill.id}>
          <h3>{skill.name}</h3><p className="muted">{skill.description || (pl ? 'Własne instrukcje dla agenta.' : 'Custom agent instructions.')}</p>
          {skill.source ? <p className="small"><a href={skill.source.url} target="_blank" rel="noopener noreferrer">GitHub <ExternalLink size={12} /></a> · <span className="mono">{skill.source.sha.slice(0, 8)}</span></p> : <span className="badge">{pl ? 'Lokalny' : 'Local'}</span>}
        </article>)}
      </div>
    </section>
  </div>;
}
