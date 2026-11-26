import { useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, CircleAlert, TriangleAlert } from 'lucide-react';
import type { OpeningItem, ProjectItem, TaskItem } from '../lib/projects';
import { daysSince, fmtDate, isDone, loadOpenings, loadProjects, loadTasks, teamNames } from '../lib/portal';
import { Loading, PageHeader, Stat, chip, chipColor, mono, panel } from './PortalUI';

type Level = 'ok' | 'warn' | 'bad';
interface Check { level: Level; text: string }

const CLOSED = ['concluído', 'concluido', 'cancelado', 'pausado'];

function checksFor(p: ProjectItem, openings: OpeningItem[], tasks: TaskItem[]): Check[] {
  const out: Check[] = [];
  const last = p.devlogs?.[0]?.date || p.lastCheckInDate;
  const age = daysSince(last);
  if (age === null) out.push({ level: (daysSince(p.createdAt) ?? 0) > 14 ? 'bad' : 'warn', text: 'Nenhum check-in' });
  else if (age > 28) out.push({ level: 'bad', text: `Check-in há ${age} dias` });
  else if (age > 14) out.push({ level: 'warn', text: `Check-in há ${age} dias` });
  if (!p.gddUrl) out.push({ level: 'warn', text: 'Sem GDD conectado' });
  if (!p.leaderUid) out.push({ level: 'warn', text: 'Líder sem conta associada' });
  const stale = openings.filter(o => o.projectId === p.id && o.status === 'aberta' && (daysSince(o.openedAt) ?? 0) > 30);
  if (stale.length) out.push({ level: 'warn', text: `${stale.length} vaga(s) aberta(s) há mais de 30 dias` });
  const board = tasks.filter(t => t.projectId === p.id && t.boardStatus);
  const recent = board.some(t => (daysSince(t.deliveredAt || t.claimedAt || t.createdAt) ?? 99) <= 14);
  if (board.length && !recent) out.push({ level: 'warn', text: 'Tarefas paradas há 2 semanas' });
  if (!board.length) out.push({ level: 'warn', text: 'Sem tarefas no quadro' });
  return out;
}

const levelOf = (checks: Check[]): Level => checks.some(c => c.level === 'bad') ? 'bad' : checks.length >= 2 ? 'warn' : checks.length ? 'warn' : 'ok';
const LEVEL_STYLE: Record<Level, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  ok: { label: 'Em dia', color: chipColor.green, icon: CheckCircle2 },
  warn: { label: 'Atenção', color: chipColor.amber, icon: TriangleAlert },
  bad: { label: 'Parado', color: chipColor.red, icon: CircleAlert },
};

export default function ProjectHealth() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [openings, setOpenings] = useState<OpeningItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    Promise.allSettled([loadProjects(), loadOpenings(), loadTasks()]).then(([p, o, t]) => {
      if (p.status === 'fulfilled') setProjects(p.value);
      if (o.status === 'fulfilled') setOpenings(o.value);
      if (t.status === 'fulfilled') setTasks(t.value);
      setLoading(false);
    });
  }, []);

  const rows = useMemo(() => projects
    .filter(p => showClosed || !CLOSED.includes((p.status || '').toLowerCase()))
    .map(p => {
      const checks = checksFor(p, openings, tasks);
      const board = tasks.filter(t => t.projectId === p.id && t.boardStatus);
      return { p, checks, level: levelOf(checks), done: board.filter(isDone).length, total: board.length };
    })
    .sort((a, b) => ['bad', 'warn', 'ok'].indexOf(a.level) - ['bad', 'warn', 'ok'].indexOf(b.level)), [projects, openings, tasks, showClosed]);

  if (loading) return <Loading>Lendo os projetos…</Loading>;

  const count = (l: Level) => rows.filter(r => r.level === l).length;

  return (
    <div className="w-full max-w-5xl mx-auto pb-16 text-left">
      <PageHeader
        icon={<Activity size={26} />}
        title="Saúde dos projetos"
        subtitle="Check-ins, GDD, vagas e tarefas de todos os projetos, num lugar só"
        actions={<label className="flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} className="accent-emerald-500" /> Mostrar pausados e concluídos</label>}
      />

      <div className="grid grid-cols-3 gap-4 mb-8">
        <Stat label="Em dia" value={count('ok')} tone="text-emerald-300" />
        <Stat label="Precisam de atenção" value={count('warn')} tone="text-amber-300" />
        <Stat label="Parados" value={count('bad')} tone="text-red-300" />
      </div>

      <div className="space-y-3">
        {rows.map(({ p, checks, level, done, total }) => {
          const style = LEVEL_STYLE[level];
          const Icon = style.icon;
          const last = p.devlogs?.[0]?.date || p.lastCheckInDate;
          return (
            <article key={p.id} className={`${panel} p-4`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Icon size={18} className={level === 'ok' ? 'text-emerald-400' : level === 'warn' ? 'text-amber-400' : 'text-red-400'} />
                  <div className="min-w-0">
                    <h3 className="font-bold text-white truncate">{p.name}</h3>
                    <p className="text-xs text-gray-500">
                      {p.leader} · {teamNames(p.teamMembers, p.leader).length} pessoas · {p.status}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs ${mono} text-gray-400`}>Tarefas {done}/{total}</span>
                  <span className={`text-xs ${mono} text-gray-400`}>Último check-in {last ? fmtDate(last) : 'nunca'}</span>
                  <span className={`${chip} ${style.color}`}>{style.label}</span>
                </div>
              </div>
              {checks.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3 pl-8">
                  {checks.map(c => <span key={c.text} className={`${chip} ${c.level === 'bad' ? chipColor.red : chipColor.amber}`}>{c.text}</span>)}
                </div>
              )}
            </article>
          );
        })}
        {!rows.length && <p className="text-sm text-gray-400">Nenhum projeto em andamento.</p>}
      </div>
    </div>
  );
}
