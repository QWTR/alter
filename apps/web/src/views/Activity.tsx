import { Activity } from 'lucide-react';
import { useData, type Run } from '../api';
import { RunItem } from '../components/agentKit';
import { Empty, PageHead } from '../components/ui';
import { useT } from '../i18n';

export function ActivityView() {
  const t = useT();
  const { data: runs } = useData<Run[]>('/api/runs', 3000);
  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <PageHead title={t('activity.title')} lead={t('activity.lead')} />
      {runs && !runs.length ? <Empty icon={Activity} title={t('activity.empty')} /> : <div>{(runs ?? []).map((r, i) => <RunItem key={r.id} r={r} i={i} showAgent />)}</div>}
    </div>
  );
}
