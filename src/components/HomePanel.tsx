import { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { AlertTriangle, ArrowRight, Briefcase, CalendarDays, CheckCircle2, Gamepad2, Home, Kanban } from 'lucide-react';
import type { TabType } from '../App';
import type { OpeningItem, ProjectItem, TaskItem } from '../lib/projects';
import {
  CalendarEvent, MemberProfile, daysSince, fmtDate, isDone, isInProject, isMine,
  loadEvents, loadMyProfile, loadOpenings, loadProjects, loadTasks, norm,
} from '../lib/portal';
import { Empty, Loading, PageHeader, SectionTitle, Stat, btn, chip, chipColor, mono, panel } from './PortalUI';

/** Palavras que ligam a área do membro às vagas e tarefas avulsas. */
const AREA_WORDS: Record<string, string[]> = {
  programacao: ['program', 'codigo', 'dev', 'gml', 'unity', 'godot', 'gamemaker'],
  arte: ['arte', 'artista', 'pixel', 'sprite', 'ilustra', '2d', '3d', 'tileset', 'concept'],
  som: ['som', 'audio', 'musica', 'sound', 'trilha', 'sfx'],
  narrativa: ['narrativa', 'roteiro', 'escrita', 'dialogo', 'historia'],
  'game design': ['game design', 'design', 'level', 'balance'],
  testes: ['teste', 'qa', 'playtest'],
  divulgacao: ['divulga', 'marketing', 'social', 'instagram'],
};

function matchesArea(text: string, profile: MemberProfile | null) {
  if (!profile) return false;
  const mine = norm(`${profile.leagueRole} ${profile.roleFocus}`);
  const target = norm(text);
  return Object.values(AREA_WORDS).some(words => words.some(w => mine.includes(w)) && words.some(w => target.includes(w)));
}

export default function HomePanel({ user, isAdmin, onNavigate }: { user: User; isAdmin: boolean; onNavigate: (tab: TabType) => void }) {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [openings, setOpenings] = useState<OpeningItem[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([loadMyProfile(user), loadProjects(), loadTasks(), loadOpenings(), loadEvents()]).then(([p, pr, t, o, e]) => {
      if (p.status === 'fulfilled') setProfile(p.value);
      if (pr.status === 'fulfilled') setProjects(pr.value);
      if (t.status === 'fulfilled') setTasks(t.value);
      if (o.status === 'fulfilled') setOpenings(o.value);
      if (e.status === 'fulfilled') setEvents(e.value);
      setLoading(false);
    });
  }, [user]);

  const name = profile?.name || user.displayName || user.email?.split('@')[0] || 'membro';
  const myProjects = useMemo(() => projects.filter(p => isInProject(p, user, profile?.name)), [projects, user, profile]);
  const myTasks = tasks.filter(t => isMine(t, user) && !isDone(t) && t.status !== 'cancelada');
  const myDone = tasks.filter(t => isMine(t, user) && isDone(t)).length;
  const upcoming = events.filter(e => new Date(e.date).getTime() >= Date.now() - 3 * 3_600_000).slice(0, 4);
  const openOpenings = openings.filter(o => o.status === 'aberta');
  const forMe = openOpenings.filter(o => matchesArea(`${o.role} ${o.description}`, profile));
  const muralOpen = tasks.filter(t => t.status === 'aberta' && !t.boardStatus);
  const muralForMe = muralOpen.filter(t => matchesArea(`${t.area} ${t.title} ${t.deliverySpecs}`, profile));

  const leaderWarnings = myProjects
    .filter(p => p.leaderUid === user.uid || norm(p.leader) === norm(profile?.name || user.displayName))
    .flatMap(p => {
      const last = p.devlogs?.[0]?.date || p.lastCheckInDate;
      const age = daysSince(last);
      const out: string[] = [];
      if (age === null) out.push(`${p.name}: nenhum check-in registrado`);
      else if (age > 14) out.push(`${p.name}: check-in atrasado há ${age - 14} dias`);
      if (!p.gddUrl) out.push(`${p.name}: o GDD ainda não está conectado`);
      return out;
    });

  if (loading) return <Loading>Montando o seu painel…</Loading>;

  return (
    <div className="w-full max-w-5xl mx-auto pb-16 text-left">
      <PageHeader
        icon={<Home size={26} />}
        title={`Olá, ${name.split(' ')[0]}!`}
        subtitle={profile?.leagueRole ? `${profile.leagueRole}${profile.course ? ` · ${profile.course}` : ''}` : 'Seu resumo na LAJE'}
      />

      {!profile && (
        <div className="mb-8 p-4 border border-amber-500/40 bg-amber-500/10 text-sm text-amber-100 flex flex-wrap items-center justify-between gap-3">
          <span>Você ainda não preencheu o Formulário RH. Com ele, o painel sugere vagas e tarefas da sua área.</span>
          <button className={btn.amber} onClick={() => onNavigate('form')}>Preencher agora <ArrowRight size={13} /></button>
        </div>
      )}

      {leaderWarnings.length > 0 && (
        <div role="status" className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 border border-amber-500/40 bg-amber-500/10 text-sm">
          <span className="inline-flex items-center gap-2 text-amber-300 font-bold"><AlertTriangle size={14} /> Seus projetos precisam de atenção</span>
          {leaderWarnings.map(w => <span key={w} className="text-gray-100">{w}</span>)}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <Stat label="Tarefas abertas" value={myTasks.length} tone="text-emerald-300" />
        <Stat label="Tarefas entregues" value={myDone} />
        <Stat label="Meus projetos" value={myProjects.length} />
        <Stat label="Próximos eventos" value={upcoming.length} />
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <SectionTitle title="Minhas tarefas" subtitle="O que está com você, em todos os projetos." />
          {myTasks.length ? (
            <ul className="space-y-2">
              {myTasks.slice(0, 8).map(t => (
                <li key={t.id} className={`${panel} p-3 flex flex-wrap items-center justify-between gap-2`}>
                  <div className="min-w-0">
                    <div className="text-sm text-gray-100 font-medium">{t.title}</div>
                    <div className="text-xs text-gray-500">{t.projectName}{t.deadline ? ` · prazo ${fmtDate(t.deadline)}` : ''}</div>
                  </div>
                  <span className={`${chip} ${t.boardStatus === 'doing' || t.status === 'pegaram' ? chipColor.amber : chipColor.gray}`}>
                    {t.boardStatus === 'doing' || t.status === 'pegaram' ? 'Fazendo' : 'A fazer'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty action={<button className={btn.soft} onClick={() => onNavigate('projects')}><Kanban size={13} /> Ver o mural</button>}>
              Nenhuma tarefa com você agora.
            </Empty>
          )}
        </section>

        <section>
          <SectionTitle title="Próximos eventos" />
          {upcoming.length ? (
            <ul className="space-y-2">
              {upcoming.map(e => (
                <li key={e.id} className={`${panel} p-3 flex items-start gap-3`}>
                  <CalendarDays size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm text-gray-100 font-medium">{e.title}</div>
                    <div className="text-xs text-gray-500">{fmtDate(e.date, true)} · {e.duration || '1 hora'}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty action={<button className={btn.ghost} onClick={() => onNavigate('calendar')}>Abrir calendário</button>}>Nenhum evento marcado.</Empty>}
        </section>

        <section>
          <SectionTitle title="Meus projetos" />
          {myProjects.length ? (
            <ul className="space-y-2">
              {myProjects.map(p => (
                <li key={p.id} className={`${panel} p-3 flex items-center justify-between gap-2`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <Gamepad2 size={16} className="text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-gray-100 font-medium truncate">{p.name}</div>
                      <div className="text-xs text-gray-500">{p.genre} · {p.engine}</div>
                    </div>
                  </div>
                  <span className={`${chip} ${chipColor.green}`}>{p.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty action={<button className={btn.amber} onClick={() => onNavigate('projects')}><Briefcase size={13} /> Ver vagas</button>}>
              Você ainda não está em nenhum projeto.
            </Empty>
          )}
        </section>

        <section>
          <SectionTitle
            title={forMe.length || muralForMe.length ? 'Oportunidades na sua área' : 'Oportunidades abertas'}
            subtitle={profile?.leagueRole ? `Pelo que você marcou no Formulário RH: ${profile.leagueRole}.` : undefined}
          />
          {(() => {
            const list = [
              ...(forMe.length ? forMe : openOpenings).slice(0, 3).map(o => ({ key: `o-${o.id}`, kind: 'Vaga', title: o.role, project: o.projectName, color: chipColor.amber })),
              ...(muralForMe.length ? muralForMe : muralOpen).slice(0, 3).map(t => ({ key: `t-${t.id}`, kind: 'Tarefa avulsa', title: t.title, project: t.projectName, color: chipColor.green })),
            ];
            return list.length ? (
              <ul className="space-y-2">
                {list.map(item => (
                  <li key={item.key} className={`${panel} p-3 flex flex-wrap items-center justify-between gap-2`}>
                    <div className="min-w-0">
                      <div className="text-sm text-gray-100 font-medium">{item.title}</div>
                      <div className="text-xs text-gray-500">{item.project}</div>
                    </div>
                    <span className={`${chip} ${item.color}`}>{item.kind}</span>
                  </li>
                ))}
                <li><button className={btn.ghost} onClick={() => onNavigate('projects')}>Ver todas <ArrowRight size={13} /></button></li>
              </ul>
            ) : <Empty>Nenhuma vaga ou tarefa avulsa aberta agora.</Empty>;
          })()}
        </section>
      </div>

      {isAdmin && (
        <p className={`mt-10 text-xs text-gray-500 ${mono}`}>
          <CheckCircle2 size={12} className="inline mr-1 text-emerald-500" />
          Diretoria: a visão geral de todos os projetos está em "Saúde dos projetos".
        </p>
      )}
    </div>
  );
}
