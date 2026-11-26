import { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { Award, CalendarCheck, Download, Gamepad2, UserRound } from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { ProjectItem, TaskItem } from '../lib/projects';
import { AttendanceRecord, loadMyAttendance } from '../lib/attendance';
import { downloadHoursCertificatePdf, downloadPortfolioPdf, formatHours } from '../lib/memberPdf';
import {
  CalendarEvent, MemberProfile, durationHours, fmtDate, isDone, isInProject, isMine,
  loadEvents, loadMyProfile, loadProjects, loadTasks, norm,
} from '../lib/portal';
import { Empty, Loading, PageHeader, SectionTitle, Stat, btn, chip, chipColor, panel } from './PortalUI';

/** Funções da pessoa no projeto, tiradas de "Nome (Função)" no campo da equipe. */
function myRoles(project: ProjectItem, names: string[]) {
  const keys = names.filter(Boolean).map(norm);
  const roles = new Set<string>();
  if (keys.includes(norm(project.leader))) roles.add('Liderança');
  (project.teamMembers || '').split(/[,;\n]/).forEach(raw => {
    const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(raw.trim());
    if (m && keys.includes(norm(m[1]))) m[2].split(/[/,]/).map(r => r.trim()).filter(Boolean).forEach(r => roles.add(r));
  });
  return [...roles].join(', ');
}

export default function MemberPortfolio({ user }: { user: User }) {
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([loadMyProfile(user), loadProjects(), loadTasks(), loadEvents(), loadMyAttendance(user)]).then(([p, pr, t, e, a]) => {
      if (p.status === 'fulfilled') setProfile(p.value);
      if (pr.status === 'fulfilled') setProjects(pr.value);
      if (t.status === 'fulfilled') setTasks(t.value);
      if (e.status === 'fulfilled') setEvents(e.value);
      if (a.status === 'fulfilled') setAttendance(a.value);
      setLoading(false);
    });
  }, [user]);

  const name = profile?.name || user.displayName || user.email?.split('@')[0] || 'Membro';
  const names = [profile?.name || '', user.displayName || ''];
  const myProjects = useMemo(() => projects.filter(p => isInProject(p, user, profile?.name)), [projects, user, profile]);
  const delivered = tasks.filter(t => isMine(t, user) && isDone(t));
  // Horas vêm da duração do evento no calendário (não do registro de presença).
  const attended = attendance.map(a => {
    const ev = events.find(e => e.id === a.eventId);
    return { id: a.id, title: ev?.title || a.eventTitle, date: fmtDate(ev?.date || a.eventDate), hours: durationHours(ev?.duration) };
  });
  const totalHours = attended.reduce((s, e) => s + e.hours, 0);

  const exportPortfolio = () => {
    try {
      downloadPortfolioPdf({
        name,
        email: user.email || '',
        role: profile?.leagueRole || '',
        course: profile?.course || '',
        projects: myProjects.map(p => ({ name: p.name, roles: myRoles(p, names), status: p.status, genre: p.genre })),
        tasks: delivered.map(t => ({ title: t.title, project: t.projectName, area: t.area, when: fmtDate(t.deliveredAt) })),
        events: attended,
      });
    } catch (err) {
      console.error(err);
      toast.error('Não consegui gerar o PDF.');
    }
  };

  if (loading) return <Loading>Montando o seu portfólio…</Loading>;

  return (
    <div className="w-full max-w-5xl mx-auto pb-16 text-left">
      <PageHeader
        icon={<UserRound size={26} />}
        title={name}
        subtitle={[profile?.leagueRole, profile?.course].filter(Boolean).join(' · ') || 'Seu portfólio na LAJE'}
        actions={<>
          <button className={btn.primary} onClick={exportPortfolio}><Download size={13} /> Baixar portfólio (PDF)</button>
          <button
            className={btn.soft}
            disabled={!attended.length}
            title={attended.length ? '' : 'Aparece quando houver presença registrada em algum evento'}
            onClick={() => downloadHoursCertificatePdf({ name, email: user.email || '', events: attended })}
          ><Award size={13} /> Declaração de horas</button>
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <Stat label="Projetos" value={myProjects.length} />
        <Stat label="Tarefas entregues" value={delivered.length} tone="text-emerald-300" />
        <Stat label="Eventos" value={attended.length} />
        <Stat label="Horas em eventos" value={formatHours(totalHours)} tone="text-emerald-300" />
      </div>

      <div className="space-y-10">
        <section>
          <SectionTitle title="Projetos" subtitle="As funções vêm do campo de equipe de cada projeto." />
          {myProjects.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {myProjects.map(p => (
                <div key={p.id} className={`${panel} p-4 flex items-start gap-3`}>
                  <Gamepad2 size={18} className="text-emerald-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-bold text-white">{p.name}</div>
                    <div className="text-xs text-gray-500">{p.genre} · {p.engine} · {p.semester || ''}</div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(myRoles(p, names) || 'Equipe').split(', ').map(r => <span key={r} className={`${chip} ${chipColor.green}`}>{r}</span>)}
                      <span className={`${chip} ${chipColor.gray}`}>{p.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <Empty>Nenhum projeto ainda. Quando você entrar num time, ele aparece aqui.</Empty>}
        </section>

        <section>
          <SectionTitle title="Tarefas entregues" subtitle="Do quadro dos projetos e do mural de tarefas." />
          {delivered.length ? (
            <ul className={`${panel} divide-y divide-[var(--color-ink-faint)]`}>
              {delivered.map(t => (
                <li key={t.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm text-gray-100">{t.title}</div>
                    <div className="text-xs text-gray-500">{t.projectName}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.area && <span className={`${chip} ${chipColor.gray}`}>{t.area}</span>}
                    {t.deliveredAt && <span className="text-xs text-gray-500">{fmtDate(t.deliveredAt)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          ) : <Empty>Nenhuma tarefa entregue ainda.</Empty>}
        </section>

        <section>
          <SectionTitle title="Presença em eventos" subtitle="Registrada pelo QR code mostrado nos eventos. As horas seguem a duração cadastrada no calendário." />
          {attended.length ? (
            <ul className={`${panel} divide-y divide-[var(--color-ink-faint)]`}>
              {attended.map(e => (
                <li key={e.id} className="px-4 py-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <CalendarCheck size={16} className="text-emerald-400" />
                    <div>
                      <div className="text-sm text-gray-100">{e.title}</div>
                      <div className="text-xs text-gray-500">{e.date}</div>
                    </div>
                  </div>
                  <span className={`${chip} ${chipColor.green}`}>{formatHours(e.hours)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty>Nenhuma presença registrada. Nos eventos, leia o QR code que a diretoria mostrar.</Empty>}
        </section>
      </div>
    </div>
  );
}
