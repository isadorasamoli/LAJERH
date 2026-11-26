import { useEffect, useMemo, useState, FormEvent, ReactNode } from 'react';
import { toast } from 'react-hot-toast';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  Copy,
  Edit2,
  ExternalLink,
  FileText,
  Flag,
  Gamepad2,
  Link2,
  Mail,
  Plus,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { OpeningItem, TaskItem } from '../lib/projects';
import {
  AREAS,
  BOARD_COLUMNS,
  BoardStatus,
  BoardTask,
  CheckIn,
  DOC_TYPES,
  Delivery,
  FullProject,
  PRIORITIES,
  Priority,
  ProjectDocLink,
  addBoardTask,
  addCheckIn,
  addDelivery,
  canEditProject,
  daysSince,
  deleteBoardTask,
  docIdFromUrl,
  fmtDay,
  getProjectRole,
  isProductionRole,
  loadProjectData,
  normEmail,
  splitItems,
  parseTeam,
  TeamMember,
  templateCopyUrl,
  todayIso,
  updateBoardTask,
  updateProject,
} from '../lib/projectPage';

interface ProjectPageProps {
  project: FullProject;
  /** RH, diretoria ou admin: tem todos os poderes de líder em qualquer projeto. */
  isAdmin: boolean;
  /** Só admin pode excluir projeto e disparar e-mail para a liga. */
  isSiteAdmin: boolean;
  userEmail: string;
  userName: string;
  openings: OpeningItem[];
  muralTasks: TaskItem[];
  statusBadge: (status: string) => ReactNode;
  onBack: () => void;
  onProjectUpdated: (p: FullProject) => void;
  onEditFicha: () => void;
  onDelete: () => void;
  onNotify: () => void;
  onNewOpening: () => void;
  onNewMuralTask: () => void;
  onClaimMuralTask: (t: TaskItem) => void;
}

type TabId = 'overview' | 'team' | 'tasks' | 'openings' | 'devlog' | 'files';
type ModalState = null | { type: 'links' } | { type: 'access' } | { type: 'delivery' } | { type: 'doc' };

const STATUS_OPTIONS = ['ideia', 'em análise', 'aprovado', 'em produção', 'em andamento', 'pausado', 'concluído', 'cancelado'];

/* ---------- estilos compartilhados (seguem o resto do site) ---------- */
const mono = "font-['Space_Mono']";
const panel = 'bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)]';
const input =
  'w-full bg-[#0f0f11] border border-[var(--color-ink-faint)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-accent)]';
const btn = `inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs ${mono} border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default`;
const btnGhost = `${btn} bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700`;
const btnPrimary = `${btn} bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold border-emerald-500`;
const btnSoft = `${btn} bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40`;
const btnAmber = `${btn} bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40`;
const chip = `inline-flex items-center gap-1 px-2 py-0.5 text-[11px] ${mono} border whitespace-nowrap`;
const PR_STYLE: Record<Priority, string> = {
  Crítica: 'text-red-300 border-red-500/40 bg-red-500/10',
  Importante: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  Polish: 'text-sky-300 border-sky-500/40 bg-sky-500/10',
};
const PR_BORDER: Record<Priority, string> = { Crítica: 'border-l-red-500', Importante: 'border-l-amber-500', Polish: 'border-l-sky-500' };
const PR_ORDER: Record<Priority, number> = { Crítica: 0, Importante: 1, Polish: 2 };

const initials = (name: string) => {
  const p = (name || '?').trim().split(/\s+/);
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};

function Avatar({ name, small }: { name: string; small?: boolean; key?: string }) {
  return (
    <span
      title={name}
      className={`${small ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs'} rounded-full bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 font-bold flex items-center justify-center shrink-0`}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Lixeira com confirmação na própria página (sem window.confirm, que alguns navegadores
 * embutidos fecham sozinhos). Primeiro clique pergunta; some sozinha depois de 5 s.
 */
function ConfirmDelete({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return;
    const t = setTimeout(() => setAsking(false), 5000);
    return () => clearTimeout(t);
  }, [asking]);
  if (!asking) {
    return (
      <button
        className="w-7 h-7 flex items-center justify-center border border-gray-700 text-gray-500 hover:text-red-400 cursor-pointer"
        aria-label={label}
        title={label}
        onClick={() => setAsking(true)}
      >
        <Trash2 size={13} />
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label={label}>
      <button
        autoFocus
        className={`h-7 px-2 text-[11px] ${mono} border border-red-500/50 bg-red-500/15 text-red-300 hover:bg-red-500/25 cursor-pointer`}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        Excluir
      </button>
      <button className={`h-7 px-2 text-[11px] ${mono} border border-gray-700 text-gray-400 hover:text-white cursor-pointer`} onClick={() => setAsking(false)}>
        Não
      </button>
    </span>
  );
}

function Section({ icon, title, sub, color, children }: { icon: ReactNode; title: string; sub?: string; color: string; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <span className={`w-8 h-8 flex items-center justify-center border ${color}`}>{icon}</span>
        <div>
          <h3 className="text-lg font-bold text-white">{title}</h3>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-gray-700 p-5 text-sm text-gray-400 flex flex-wrap items-center justify-between gap-3">
      <span>{children}</span>
      {action}
    </div>
  );
}

function Modal({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className="w-full max-w-lg max-h-[90vh] overflow-auto bg-[#111113] border border-gray-700 p-6">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-white cursor-pointer">
            <X size={18} />
          </button>
        </div>
        {sub && <p className="text-xs text-gray-400 mt-1 mb-4">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className={`block text-[11px] ${mono} uppercase text-gray-400 mb-1.5`}>{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-500 mt-1">{hint}</span>}
    </label>
  );
}

export default function ProjectPage(props: ProjectPageProps) {
  const { project: p, userEmail, userName } = props;
  const role = getProjectRole(p, userEmail, props.isAdmin);
  const prod = isProductionRole(role);
  const canEdit = canEditProject(role);
  const me = userName || userEmail.split('@')[0];

  const [tab, setTab] = useState<TabId>('overview');
  const [modal, setModal] = useState<ModalState>(null);
  const [boardTasks, setBoardTasks] = useState<BoardTask[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!p.id) return;
    try {
      const d = await loadProjectData(p.id, prod);
      setBoardTasks(d.boardTasks);
      setDeliveries(d.deliveries);
      setCheckins(d.checkins);
      if (d.failed.length) toast.error(`Não consegui carregar: ${d.failed.join(', ')}. Pode ser falta de permissão.`, { id: 'project-load' });
    } catch (err) {
      console.error('Erro ao carregar dados do projeto:', err);
      toast.error('Não consegui carregar os dados do projeto.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id, prod]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [p.id]);

  const saveProject = async (data: Partial<FullProject>, okMsg?: string) => {
    if (!p.id) return false;
    try {
      await updateProject(p.id, data);
      props.onProjectUpdated({ ...p, ...data });
      if (okMsg) toast.success(okMsg);
      return true;
    } catch (err) {
      console.error(err);
      toast.error('Não deu para salvar. Confira se você tem permissão neste projeto.');
      return false;
    }
  };

  /* ---------- dados derivados ---------- */
  const lastCheckinDate = checkins[0]?.date || p.lastCheckInDate || '';
  const projOpenings = props.openings.filter((o) => o.projectId === p.id && o.status === 'aberta');
  const projMural = props.muralTasks.filter((t) => t.projectId === p.id && (t.status === 'aberta' || t.status === 'pegaram'));
  const team = useMemo(() => parseTeam(p.teamMembers, p.leader), [p.teamMembers, p.leader]);

  const attention: { text: string; tab: TabId; onClick?: () => void }[] = [];
  if (prod) {
    if (!p.gddUrl && tab !== 'overview') attention.push({ text: 'O GDD ainda não está conectado', tab: 'overview' });
    const young = p.createdAt && Date.now() - p.createdAt < 14 * 86400000;
    if (!lastCheckinDate && !young) attention.push({ text: 'Nenhum check-in registrado', tab: 'devlog' });
    else if (lastCheckinDate && daysSince(lastCheckinDate) > 14)
      attention.push({ text: `Check-in atrasado há ${daysSince(lastCheckinDate) - 14} dias`, tab: 'devlog' });
    if (role === 'director' && !p.leaderEmail)
      attention.push({ text: 'Defina o e-mail do líder para ele poder editar esta página', tab: 'team', onClick: () => setModal({ type: 'access' }) });
  }

  const tabs: { id: TabId; label: string; n?: number; prodOnly?: boolean }[] = [
    { id: 'overview', label: 'Visão geral' },
    { id: 'team', label: 'Equipe', n: team.length },
    { id: 'tasks', label: 'Tarefas', prodOnly: true },
    { id: 'openings', label: 'Vagas e mural', n: projOpenings.length + projMural.filter((t) => t.status === 'aberta').length },
    { id: 'devlog', label: 'Devlog' },
    { id: 'files', label: 'Arquivos', prodOnly: true },
  ];
  const visibleTabs = tabs.filter((t) => !t.prodOnly || prod);

  /* ---------- cabeçalho ---------- */
  const facts: [string, string | undefined][] = [
    ['Gênero', p.genre],
    ['Engine', p.engine],
    ['Semestre', p.semester],
    ['Escopo', p.targetScope],
    ['Líder', p.leader + (p.leaderDiscord ? ` (${p.leaderDiscord})` : '')],
    ['Diretoria', p.responsibleDirector],
  ];

  const header = (
    <>
      <nav aria-label="Caminho" className={`text-xs ${mono} text-gray-500 mb-5`}>
        <button onClick={props.onBack} className="inline-flex items-center gap-1.5 text-gray-400 hover:text-white cursor-pointer">
          <ArrowLeft size={14} /> Projetos &amp; Oportunidades
        </button>
        <span className="mx-2">/</span>
        <span>{p.name}</span>
      </nav>

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <span className="w-14 h-14 shrink-0 rounded-lg bg-gray-800/80 border border-gray-700 flex items-center justify-center text-3xl">{p.coverEmoji || '🎮'}</span>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight break-words">{p.name}</h1>
            <p className={`text-xs ${mono} text-gray-500 mt-1`}>
              {role === 'leader' ? 'Você é líder deste projeto' : role === 'team' ? 'Você está no time deste projeto' : role === 'director' ? 'Você vê como diretoria' : 'Você vê como membro da liga'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <select
              aria-label="Status do projeto"
              value={p.status}
              onChange={(e) => saveProject({ status: e.target.value }, 'Status atualizado.')}
              className={`bg-[#161619] border border-[var(--color-ink-faint)] py-1.5 px-2 text-xs text-gray-200 ${mono} cursor-pointer`}
            >
              {(STATUS_OPTIONS.includes(p.status) ? STATUS_OPTIONS : [p.status, ...STATUS_OPTIONS]).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            props.statusBadge(p.status)
          )}
          {canEdit && (
            <button className={btnSoft} onClick={props.onEditFicha}>
              <Edit2 size={13} /> Editar ficha
            </button>
          )}
        </div>
      </header>

      <dl className="flex flex-wrap gap-x-10 gap-y-3 mt-5 py-4 border-y border-[var(--color-ink-faint)]">
        {facts
          .filter(([, v]) => v && v.trim())
          .map(([k, v]) => (
            <div key={k}>
              <dt className={`text-[11px] ${mono} uppercase text-gray-500`}>{k}</dt>
              <dd className="text-sm font-semibold text-gray-100 max-w-[32ch]">{v}</dd>
            </div>
          ))}
      </dl>

      {p.gddUrl && (
        <section aria-label="GDD do projeto" className="mt-6 flex flex-wrap items-center gap-4 p-4 border border-emerald-500/40 bg-emerald-500/10">
          <span className="w-11 h-11 flex items-center justify-center border border-emerald-500/40 text-emerald-300">
            <FileText size={22} />
          </span>
          <div className="flex-1 min-w-[200px]">
            <h2 className="text-base font-bold text-white">GDD do projeto</h2>
            <p className="text-xs text-gray-400">
              Documento principal{p.gddTemplate ? ` · modelo ${p.gddTemplate}` : ''}. A leitura automática das seções chega na próxima etapa.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <button className={btnGhost} onClick={() => saveProject({ gddUrl: '' }, 'GDD desconectado.')}>
                Trocar documento
              </button>
            )}
            <a className={btnPrimary} href={p.gddUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={13} /> Abrir no Docs
            </a>
          </div>
        </section>
      )}

      {attention.length > 0 && (
        <div role="status" className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 border border-amber-500/40 bg-amber-500/10 text-sm">
          <span className="inline-flex items-center gap-2 text-amber-300 font-bold">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> Precisa de atenção
          </span>
          {attention.map((a) => (
            <button
              key={a.text}
              onClick={() => (a.onClick ? a.onClick() : setTab(a.tab))}
              className="text-gray-100 underline decoration-amber-500/50 underline-offset-4 hover:text-amber-300 cursor-pointer"
            >
              {a.text}
            </button>
          ))}
        </div>
      )}

      <div role="tablist" className="flex flex-wrap gap-x-8 mt-8 mb-8 border-b border-[var(--color-ink-faint)]">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`h-12 -mb-px border-b-2 text-sm font-semibold cursor-pointer ${
              tab === t.id ? 'text-emerald-400 border-emerald-400' : 'text-gray-400 border-transparent hover:text-white'
            }`}
          >
            {t.label}
            {!!t.n && <span className={`ml-2 px-2 text-[11px] ${mono} bg-gray-800 text-gray-300 rounded`}>{t.n}</span>}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <div className="w-full max-w-5xl mx-auto pb-16 text-left animate-in fade-in duration-300">
      {header}
      <div role="tabpanel">
        {tab === 'overview' && <OverviewTab p={p} canEdit={canEdit} saveProject={saveProject} />}
        {tab === 'team' && <TeamTab p={p} team={team} prod={prod} canEdit={canEdit} onAccess={() => setModal({ type: 'access' })} onNewOpening={props.onNewOpening} />}
        {tab === 'tasks' && prod && (
          <TasksTab
            p={p}
            me={me}
            myEmail={normEmail(userEmail)}
            canEdit={canEdit}
            loading={loading}
            tasks={boardTasks}
            setTasks={setBoardTasks}
            deliveries={deliveries}
            onNewDelivery={() => setModal({ type: 'delivery' })}
          />
        )}
        {tab === 'openings' && (
          <OpeningsTab
            openings={projOpenings}
            mural={projMural}
            canEdit={canEdit}
            me={me}
            onNewOpening={props.onNewOpening}
            onNewMural={props.onNewMuralTask}
            onClaim={props.onClaimMuralTask}
          />
        )}
        {tab === 'devlog' && (
          <DevlogTab
            p={p}
            prod={prod}
            canEdit={canEdit}
            me={me}
            myEmail={normEmail(userEmail)}
            checkins={checkins}
            loading={loading}
            onSaved={(c, needs) => {
              setCheckins([c, ...checkins]);
              if (canEdit) saveProject({ lastCheckInDate: c.date, lastCheckInNotes: c.done });
              if (needs) toast(`Precisa de gente em ${needs}? Publique uma vaga na aba Vagas e mural.`, { icon: '📌' });
            }}
          />
        )}
        {tab === 'files' && prod && <FilesTab p={p} canEdit={canEdit} onEditLinks={() => setModal({ type: 'links' })} onAddDoc={() => setModal({ type: 'doc' })} saveProject={saveProject} />}
      </div>

      {props.isSiteAdmin && (
        <div className="mt-16 pt-4 border-t border-[var(--color-ink-faint)] flex flex-wrap gap-2">
          <button className={btnSoft} onClick={props.onNotify} title="Abre um e-mail com todos os membros em cópia oculta">
            <Mail size={13} /> Notificar membros por e-mail
          </button>
          <button className={`${btn} bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30`} onClick={props.onDelete}>
            <Trash2 size={13} /> Excluir projeto
          </button>
        </div>
      )}

      {modal?.type === 'links' && <LinksModal p={p} onClose={() => setModal(null)} saveProject={saveProject} />}
      {modal?.type === 'access' && <AccessModal p={p} isDirector={role === 'director'} onClose={() => setModal(null)} saveProject={saveProject} />}
      {modal?.type === 'doc' && <DocModal p={p} onClose={() => setModal(null)} saveProject={saveProject} />}
      {modal?.type === 'delivery' && p.id && (
        <DeliveryModal
          onClose={() => setModal(null)}
          onCreate={async (name, due) => {
            try {
              const d: Delivery = { name, due, createdAt: Date.now() };
              const ref = await addDelivery(p.id!, d);
              setDeliveries([...deliveries, { ...d, id: ref.id }].sort((a, b) => a.due.localeCompare(b.due)));
              toast.success('Entrega criada.');
              setModal(null);
            } catch (err) {
              console.error(err);
              toast.error('Não deu para criar a entrega.');
            }
          }}
        />
      )}
    </div>
  );
}

/* ====================================================================== */
/* Visão geral                                                            */
/* ====================================================================== */

function OverviewTab({ p, canEdit, saveProject }: { p: FullProject; canEdit: boolean; saveProject: (d: Partial<FullProject>, m?: string) => Promise<boolean> }) {
  const [url, setUrl] = useState('');
  const pitch = p.elevatorPitch || p.description;
  const pillars = splitItems(p.pilares);
  const CYC = ['border-l-purple-400', 'border-l-emerald-400', 'border-l-amber-400', 'border-l-sky-400'];

  const connect = async (e: FormEvent) => {
    e.preventDefault();
    const u = url.trim();
    if (!docIdFromUrl(u)) {
      toast.error('Cole o link de um Google Docs (docs.google.com/document/d/...).');
      return;
    }
    if (await saveProject({ gddUrl: u }, 'GDD conectado.')) setUrl('');
  };

  const onboarding = !p.gddUrl && (
    canEdit ? (
      <section className={`${panel} p-6 mb-10`}>
        <h2 className="text-lg font-bold text-white">Comece pelo GDD do projeto</h2>
        <p className="text-sm text-gray-400 mt-1 mb-5 max-w-[64ch]">
          O GDD é o documento que explica o jogo. Ele fica no Google Docs e aparece no topo desta página para todo o time.
        </p>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="border border-gray-700 p-5 bg-black/20 space-y-3">
            <h3 className="font-bold text-white">Criar a partir do modelo da LAJE</h3>
            <p className="text-xs text-gray-400">
              Abre o Google Docs para fazer uma cópia do modelo no seu Drive. Compartilhe com o time e depois cole o link ao lado.
            </p>
            <div className="flex flex-wrap gap-2">
              {(['completo', 'pitch'] as const).map((k) => {
                const href = templateCopyUrl(k);
                const label = k === 'completo' ? 'Modelo Completo' : 'Modelo Pitch e Negócios';
                return href ? (
                  <a key={k} className={btnPrimary} href={href} target="_blank" rel="noopener noreferrer">
                    <Copy size={13} /> {label}
                  </a>
                ) : (
                  <button key={k} className={btnGhost} disabled title="O link do modelo ainda não foi configurado no site">
                    <Copy size={13} /> {label}
                  </button>
                );
              })}
            </div>
            {!templateCopyUrl('completo') && <p className="text-[11px] text-amber-300/80">Os modelos ainda não foram configurados no site. Peça à diretoria.</p>}
          </div>
          <form onSubmit={connect} className="border border-gray-700 p-5 bg-black/20 space-y-3">
            <h3 className="font-bold text-white">Já tenho um documento</h3>
            <Field label="Link do Google Docs">
              <input className={input} type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/document/d/..." />
            </Field>
            <button className={btnSoft} type="submit">
              <Link2 size={13} /> Conectar documento
            </button>
          </form>
        </div>
      </section>
    ) : (
      <div className="mb-10">
        <Empty>Este projeto ainda não tem um GDD conectado.</Empty>
      </div>
    )
  );

  return (
    <div className="space-y-12">
      {onboarding}
      {pitch && (
        <section className="flex flex-col sm:flex-row gap-5 p-6 sm:p-8 border border-emerald-500/40 bg-emerald-500/10">
          <span className="w-12 h-12 shrink-0 flex items-center justify-center border border-emerald-500/40 text-emerald-300">
            <Gamepad2 size={24} />
          </span>
          <div>
            <div className={`text-[11px] ${mono} uppercase font-bold text-emerald-400 mb-2`}>O jogo em um parágrafo</div>
            <p className="text-lg sm:text-xl leading-relaxed font-semibold text-white max-w-[72ch] whitespace-pre-line">{pitch}</p>
          </div>
        </section>
      )}
      {p.diferencial && (
        <Section icon={<Sparkles size={16} />} color="text-amber-300 border-amber-500/40 bg-amber-500/10" title="O diferencial" sub="O que este jogo tem que os outros do gênero não têm.">
          <p className="text-gray-300 max-w-[72ch] leading-relaxed whitespace-pre-line">{p.diferencial}</p>
        </Section>
      )}
      {pillars.length > 0 && (
        <Section icon={<Compass size={16} />} color="text-purple-300 border-purple-500/40 bg-purple-500/10" title="Pilares de design" sub="Princípios que decidem o que entra no jogo e o que fica de fora.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pillars.map((x, i) => (
              <div key={i} className={`${panel} border-l-4 ${CYC[i % 4]} p-4`}>
                {x.name && <h4 className="text-sm font-bold text-white mb-1">{x.name}</h4>}
                <p className="text-sm text-gray-400">{x.text}</p>
              </div>
            ))}
          </div>
        </Section>
      )}
      {p.targetScope && (
        <Section icon={<Flag size={16} />} color="text-orange-300 border-orange-500/40 bg-orange-500/10" title="Escopo" sub="O tamanho combinado para este semestre.">
          <p className="text-gray-300 max-w-[72ch]">{p.targetScope}</p>
        </Section>
      )}
      {p.description && p.description !== pitch && (
        <Section icon={<BookOpen size={16} />} color="text-rose-300 border-rose-500/40 bg-rose-500/10" title="Descrição">
          <p className="text-gray-300 max-w-[72ch] leading-relaxed whitespace-pre-line">{p.description}</p>
        </Section>
      )}
      {!pitch && !p.diferencial && !pillars.length && (
        <Empty>A ficha do jogo ainda está em branco.</Empty>
      )}
    </div>
  );
}

/* ====================================================================== */
/* Equipe                                                                  */
/* ====================================================================== */

function TeamTab({ p, team, prod, canEdit, onAccess, onNewOpening }: { p: FullProject; team: TeamMember[]; prod: boolean; canEdit: boolean; onAccess: () => void; onNewOpening: () => void }) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-bold text-white">Equipe</h3>
          <p className="text-xs text-gray-400 mt-1">Quem está no projeto. Para mudar os nomes, use "Editar ficha".</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <button className={btnGhost} onClick={onAccess}>
              <Users size={13} /> Acesso do time
            </button>
          )}
          {canEdit && (
            <button className={btnAmber} onClick={onNewOpening}>
              <Plus size={13} /> Publicar vaga
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {team.map((m) => (
          <div key={m.name} className={`${panel} p-4 flex items-start gap-3`}>
            <Avatar name={m.name} />
            <div className="min-w-0">
              <b className="block text-white break-words">{m.name}</b>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {m.name.toLowerCase() === (p.leader || '').trim().toLowerCase() && (
                  <span className={`${chip} text-emerald-300 border-emerald-500/40 bg-emerald-500/10`}>Líder</span>
                )}
                {m.roles.map((r) => (
                  <span key={r} className={`${chip} text-gray-300 border-gray-700`}>
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      {prod && (
        <p className="text-xs text-gray-500 mt-6">
          {(p.teamEmails || []).length} {(p.teamEmails || []).length === 1 ? 'pessoa tem' : 'pessoas têm'} acesso às tarefas e arquivos
          {p.leaderEmail ? '' : ' · o e-mail do líder ainda não foi definido'}.
        </p>
      )}
    </div>
  );
}

function AccessModal({ p, isDirector, onClose, saveProject }: { p: FullProject; isDirector: boolean; onClose: () => void; saveProject: (d: Partial<FullProject>, m?: string) => Promise<boolean> }) {
  const [leaderEmail, setLeaderEmail] = useState(p.leaderEmail || '');
  const [emails, setEmails] = useState((p.teamEmails || []).join('\n'));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const list: string[] = Array.from(new Set<string>(emails.split(/[\s,;]+/).map((x) => normEmail(x)).filter((x) => x.includes('@'))));
    const bad = emails.split(/[\s,;]+/).filter((x) => x.trim() && !x.includes('@'));
    if (bad.length) {
      toast.error(`Isto não parece e-mail: ${bad.join(', ')}`);
      return;
    }
    const lead = normEmail(leaderEmail);
    const data: Partial<FullProject> = { teamEmails: list };
    // Só a diretoria troca o líder (a regra do Firestore também impede).
    if (isDirector && lead !== normEmail(p.leaderEmail)) data.leaderEmail = lead;
    if (await saveProject(data, 'Acesso do time atualizado.')) onClose();
  };
  return (
    <Modal title="Acesso do time" sub="Use o e-mail com que cada pessoa entra no site. O líder edita a página; o time vê tarefas, arquivos e registra check-in." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="E-mail do líder" hint="Só a diretoria troca o líder.">
          <input className={`${input} disabled:opacity-60`} type="email" disabled={!isDirector} value={leaderEmail} onChange={(e) => setLeaderEmail(e.target.value)} placeholder="lider@exemplo.com" />
        </Field>
        <Field label="E-mails do time" hint="Um por linha.">
          <textarea className={`${input} h-36 resize-y`} value={emails} onChange={(e) => setEmails(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ====================================================================== */
/* Tarefas                                                                 */
/* ====================================================================== */

function TasksTab(props: {
  p: FullProject;
  me: string;
  myEmail: string;
  canEdit: boolean;
  loading: boolean;
  tasks: BoardTask[];
  setTasks: (t: BoardTask[]) => void;
  deliveries: Delivery[];
  onNewDelivery: () => void;
}) {
  const { p, me, myEmail, tasks, setTasks, deliveries } = props;
  const [view, setView] = useState<'kanban' | 'delivery'>('kanban');
  const [area, setArea] = useState('Todas');
  const [who, setWho] = useState('Todos');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', area: '', priority: 'Importante' as Priority, deliveryId: '' });

  const prOf = (t: BoardTask): Priority => (PRIORITIES.includes(t.priority) ? t.priority : 'Importante');
  const mine = (t: BoardTask) => (t.ownerEmails || []).includes(myEmail);
  const list = tasks
    .filter((t) => (area === 'Todas' || t.area === area) && (who === 'Todos' || (who === 'Eu' && mine(t)) || (who === 'Sem responsável' && !(t.owners || []).length)))
    .sort((a, b) => PR_ORDER[prOf(a)] - PR_ORDER[prOf(b)]);
  const done = tasks.filter((t) => t.status === 'Feito').length;

  const patch = async (t: BoardTask, data: Partial<BoardTask>) => {
    if (!p.id || !t.id) return;
    const prev = tasks;
    setTasks(tasks.map((x) => (x.id === t.id ? { ...x, ...data } : x)));
    try {
      await updateBoardTask(p.id, t.id, data);
    } catch (err) {
      console.error(err);
      setTasks(prev);
      toast.error('Não deu para salvar a tarefa.');
    }
  };

  const remove = async (t: BoardTask) => {
    if (!p.id || !t.id) return;
    try {
      await deleteBoardTask(p.id, t.id);
      setTasks(tasks.filter((x) => x.id !== t.id));
    } catch (err) {
      console.error(err);
      toast.error('Não deu para excluir a tarefa.');
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!p.id || !form.title.trim()) return;
    const t: BoardTask = {
      title: form.title.trim(),
      area: form.area,
      priority: form.priority,
      status: 'A fazer',
      owners: [],
      ownerEmails: [],
      deliveryId: form.deliveryId,
      createdAt: Date.now(),
      createdBy: myEmail,
    };
    try {
      const ref = await addBoardTask(p.id, t);
      setTasks([...tasks, { ...t, id: ref.id }]);
      setForm({ ...form, title: '' });
      setAdding(false);
      toast.success('Tarefa criada.');
    } catch (err) {
      console.error(err);
      toast.error('Não deu para criar a tarefa.');
    }
  };

  const select = `bg-[#161619] border border-[var(--color-ink-faint)] py-1.5 px-2 text-xs text-gray-300 ${mono} cursor-pointer`;

  const prChip = (t: BoardTask) => (
    <button
      className={`${chip} ${PR_STYLE[prOf(t)]} cursor-pointer`}
      title="Criticidade. Clique para mudar."
      onClick={() => patch(t, { priority: PRIORITIES[(PRIORITIES.indexOf(prOf(t)) + 1) % 3] })}
    >
      {prOf(t)}
    </button>
  );
  const owners = (t: BoardTask) =>
    (t.owners || []).length ? (
      <span className="flex -space-x-2" title={t.owners.join(', ')}>
        {t.owners.map((o) => (
          <Avatar key={o} name={o} small />
        ))}
      </span>
    ) : (
      <button className={btnGhost} onClick={() => patch(t, { owners: [me], ownerEmails: [myEmail] })}>
        Pegar
      </button>
    );

  const addForm = (
    <form onSubmit={create} className={`${panel} border-l-4 border-l-emerald-500 p-4 space-y-3`}>
      <input autoFocus className={input} required aria-label="Título da tarefa" placeholder="O que precisa ser feito?" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">
        <select className={select} aria-label="Área" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
          <option value="">Sem área</option>
          {AREAS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select className={select} aria-label="Criticidade" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
          {PRIORITIES.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        {deliveries.length > 0 && (
          <select className={select} aria-label="Entrega" value={form.deliveryId} onChange={(e) => setForm({ ...form, deliveryId: e.target.value })}>
            <option value="">Sem entrega</option>
            {deliveries.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex gap-2">
        <button type="submit" className={btnPrimary}>
          Adicionar
        </button>
        <button type="button" className={btnGhost} onClick={() => setAdding(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );

  const toolbar = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div className="inline-flex p-1 border border-[var(--color-ink-faint)] bg-black/30" role="tablist" aria-label="Forma de ver as tarefas">
          {(
            [
              ['kanban', 'Quadro'],
              ['delivery', 'Por entrega'],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 text-xs ${mono} font-bold cursor-pointer ${view === v ? 'bg-emerald-500/20 text-emerald-300' : 'text-gray-400 hover:text-white'}`}
            >
              {l}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">
          <b className="text-white">
            {done} de {tasks.length}
          </b>{' '}
          feitas
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <select className={select} aria-label="Filtrar por área" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="Todas">Todas as áreas</option>
            {AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <select className={select} aria-label="Filtrar por responsável" value={who} onChange={(e) => setWho(e.target.value)}>
            {['Todos', 'Eu', 'Sem responsável'].map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
          <button className={btnPrimary} onClick={() => setAdding(true)}>
            <Plus size={13} /> Nova tarefa
          </button>
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-400 mb-6">
        <span className={`${chip} ${PR_STYLE['Crítica']}`}>Crítica</span> o jogo não funciona sem isso
        <span className={`${chip} ${PR_STYLE['Importante']}`}>Importante</span> melhora muito
        <span className={`${chip} ${PR_STYLE['Polish']}`}>Polish</span> acabamento
      </p>
    </>
  );

  if (props.loading) return <p className="text-sm text-gray-400">Carregando as tarefas…</p>;

  if (!tasks.length && !adding) {
    return (
      <>
        {toolbar}
        <Empty
          action={
            <button className={btnPrimary} onClick={() => setAdding(true)}>
              <Plus size={13} /> Nova tarefa
            </button>
          }
        >
          Nenhuma tarefa ainda. Escreva a primeira coisa que o time precisa fazer.
        </Empty>
      </>
    );
  }

  if (view === 'kanban') {
    return (
      <>
        {toolbar}
        <div className="grid gap-5 md:grid-cols-3 items-start">
          {BOARD_COLUMNS.map((c, ci) => {
            const col = list.filter((t) => t.status === c);
            return (
              <section key={c} className="bg-black/30 border border-[var(--color-ink-faint)] p-4 space-y-3">
                <h3 className="text-xs font-bold text-gray-400">
                  {c} <span className="ml-1 font-normal text-gray-600">{col.length}</span>
                </h3>
                {ci === 0 && adding && addForm}
                {col.map((t) => (
                  <article key={t.id} className={`${panel} border-l-4 ${PR_BORDER[prOf(t)]} p-3 space-y-3 ${c === 'Feito' ? 'opacity-75' : ''}`}>
                    <div className={`text-sm font-medium ${c === 'Feito' ? 'line-through text-gray-500' : 'text-gray-100'}`}>{t.title}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      {t.area && <span className={`${chip} text-gray-300 border-gray-700`}>{t.area}</span>}
                      {prChip(t)}
                      {owners(t)}
                      <span className="ml-auto flex gap-1">
                        {props.canEdit && (
                          <ConfirmDelete label={`Excluir a tarefa ${t.title}`} onConfirm={() => remove(t)} />
                        )}
                        {ci > 0 && (
                          <button
                            className="w-7 h-7 flex items-center justify-center border border-gray-700 text-gray-400 hover:text-white cursor-pointer"
                            aria-label={`Mover para ${BOARD_COLUMNS[ci - 1]}`}
                            title={`Mover para ${BOARD_COLUMNS[ci - 1]}`}
                            onClick={() => patch(t, { status: BOARD_COLUMNS[ci - 1] })}
                          >
                            <ArrowLeft size={13} />
                          </button>
                        )}
                        {ci < 2 && (
                          <button
                            className="w-7 h-7 flex items-center justify-center border border-gray-700 text-gray-400 hover:text-white cursor-pointer"
                            aria-label={`Mover para ${BOARD_COLUMNS[ci + 1]}`}
                            title={`Mover para ${BOARD_COLUMNS[ci + 1]}`}
                            onClick={() => patch(t, { status: BOARD_COLUMNS[ci + 1] })}
                          >
                            <ArrowRight size={13} />
                          </button>
                        )}
                      </span>
                    </div>
                  </article>
                ))}
                {!col.length && !(ci === 0 && adding) && (
                  <p className="text-xs text-gray-600">{c === 'A fazer' ? 'Nada aqui' : c === 'Fazendo' ? 'Nada em andamento' : 'Nada concluído ainda'}</p>
                )}
              </section>
            );
          })}
        </div>
      </>
    );
  }

  /* por entrega */
  const known = deliveries.map((d) => d.id);
  const groups: { d: Delivery | null; all: BoardTask[] }[] = deliveries.map((d) => ({ d, all: tasks.filter((t) => t.deliveryId === d.id) }));
  groups.push({ d: null, all: tasks.filter((t) => !t.deliveryId || !known.includes(t.deliveryId)) });

  return (
    <>
      {toolbar}
      {adding && <div className="max-w-xl mb-6">{addForm}</div>}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h3 className="text-lg font-bold text-white">Entregas</h3>
          <p className="text-xs text-gray-400 mt-1 max-w-[72ch]">Marcos do projeto, como "Primeira versão jogável". Tarefas sem entrega continuam aparecendo no quadro.</p>
        </div>
        {props.canEdit && (
          <button className={btnGhost} onClick={props.onNewDelivery}>
            <Plus size={13} /> Nova entrega
          </button>
        )}
      </div>
      {groups.map((g) => {
        if (!g.d && !g.all.length) return null;
        const rows = list.filter((t) => (g.d ? t.deliveryId === g.d.id : !t.deliveryId || !known.includes(t.deliveryId)));
        const dn = g.all.filter((t) => t.status === 'Feito').length;
        const pct = g.all.length ? Math.round((dn / g.all.length) * 100) : 0;
        return (
          <section key={g.d?.id || 'none'} className={`${panel} mb-5`}>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 border-b border-[var(--color-ink-faint)]">
              <h3 className="flex-1 min-w-[12rem] font-bold text-white">{g.d ? g.d.name : 'Sem entrega'}</h3>
              <small className="text-xs text-gray-400">
                {g.d ? `alvo ${fmtDay(g.d.due)} · ` : ''}
                {dn} de {g.all.length} feitas
              </small>
              <span className="w-40 h-2 bg-gray-800 rounded overflow-hidden" aria-hidden="true">
                <i className="block h-full bg-emerald-500" style={{ width: `${pct}%` }} />
              </span>
            </div>
            {!rows.length && <p className="px-5 py-4 text-xs text-gray-500">Nenhuma tarefa com esse filtro.</p>}
            {rows.map((t) => (
              <div key={t.id} className="grid gap-3 items-center px-5 py-3 border-b last:border-b-0 border-[var(--color-ink-faint)] grid-cols-2 lg:grid-cols-[minmax(0,1fr)_8rem_6rem_5rem_6rem_11rem]">
                <span className={`col-span-2 lg:col-span-1 text-sm ${t.status === 'Feito' ? 'line-through text-gray-500' : 'text-gray-100'}`}>{t.title}</span>
                <span>{t.area && <span className={`${chip} text-gray-300 border-gray-700`}>{t.area}</span>}</span>
                <span>{prChip(t)}</span>
                <span>{owners(t)}</span>
                <button
                  className={`${chip} cursor-pointer justify-center ${t.status === 'Feito' ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' : t.status === 'Fazendo' ? 'text-amber-300 border-amber-500/40 bg-amber-500/10' : 'text-gray-300 border-gray-700'}`}
                  title="Clique para mudar a situação"
                  onClick={() => patch(t, { status: BOARD_COLUMNS[(BOARD_COLUMNS.indexOf(t.status as BoardStatus) + 1) % 3] })}
                >
                  {t.status}
                </button>
                {deliveries.length ? (
                  <select className={select} aria-label="Entrega da tarefa" value={known.includes(t.deliveryId) ? t.deliveryId : ''} onChange={(e) => patch(t, { deliveryId: e.target.value })}>
                    <option value="">Sem entrega</option>
                    {deliveries.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </section>
        );
      })}
      {!deliveries.length && (
        <Empty
          action={
            props.canEdit ? (
              <button className={btnGhost} onClick={props.onNewDelivery}>
                <Plus size={13} /> Nova entrega
              </button>
            ) : undefined
          }
        >
          Nenhuma entrega criada ainda.
        </Empty>
      )}
    </>
  );
}

function DeliveryModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, due: string) => void }) {
  const [name, setName] = useState('');
  const [due, setDue] = useState('');
  return (
    <Modal title="Nova entrega" sub='Um marco do projeto, como "Primeira versão jogável" ou "Versão para o playtest". Depois você escolhe quais tarefas pertencem a ela.' onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(name.trim(), due);
        }}
        className="space-y-4"
      >
        <Field label="Nome da entrega">
          <input className={input} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Primeira versão jogável" />
        </Field>
        <Field label="Data alvo">
          <input className={input} type="date" required value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary}>
            Criar entrega
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ====================================================================== */
/* Vagas e mural                                                           */
/* ====================================================================== */

function OpeningsTab(props: {
  openings: OpeningItem[];
  mural: TaskItem[];
  canEdit: boolean;
  me: string;
  onNewOpening: () => void;
  onNewMural: () => void;
  onClaim: (t: TaskItem) => void;
}) {
  return (
    <div className="space-y-12">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-bold text-white">Vagas abertas</h3>
            <p className="text-xs text-gray-400 mt-1">Compromisso de um semestre, com função e entrega descritas.</p>
          </div>
          {props.canEdit && (
            <button className={btnAmber} onClick={props.onNewOpening}>
              <Plus size={13} /> Publicar vaga
            </button>
          )}
        </div>
        {!props.openings.length ? (
          <Empty>Nenhuma vaga aberta neste projeto.</Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {props.openings.map((o) => (
              <article key={o.id} className={`${panel} border-t-4 border-t-amber-500 p-5 flex flex-col gap-3`}>
                <div className="flex flex-wrap gap-2">
                  {o.acceptsBeginners && <span className={`${chip} text-emerald-300 border-emerald-500/40 bg-emerald-500/10`}>Aceita quem está começando</span>}
                  <span className={`${chip} text-gray-300 border-gray-700`}>tempo {o.estimatedTime}</span>
                </div>
                <h4 className="font-bold text-white">{o.role}</h4>
                <p className="text-sm text-gray-400 flex-1 whitespace-pre-line">{o.description}</p>
                <small className="text-xs text-gray-500">Aberta há {Math.max(0, Math.floor((Date.now() - o.openedAt) / 86400000))} dias</small>
              </article>
            ))}
          </div>
        )}
      </section>
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-bold text-white">Mural de tarefas</h3>
            <p className="text-xs text-gray-400 mt-1">Tarefas pequenas, sem entrar no time. Crédito no jogo.</p>
          </div>
          {props.canEdit && (
            <button className={btnPrimary} onClick={props.onNewMural}>
              <Plus size={13} /> Nova tarefa avulsa
            </button>
          )}
        </div>
        {!props.mural.length ? (
          <Empty>Nenhuma tarefa avulsa aberta.</Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {props.mural.map((t) => (
              <article key={t.id} className={`${panel} border-t-4 border-t-emerald-500 p-5 flex flex-col gap-3`}>
                <div className="flex flex-wrap gap-2">
                  <span className={`${chip} text-emerald-300 border-emerald-500/40 bg-emerald-500/10`}>{t.area}</span>
                  <span className={`${chip} text-gray-300 border-gray-700`}>Tamanho {t.size}</span>
                </div>
                <h4 className="font-bold text-white">{t.title}</h4>
                <p className="text-sm text-gray-400 flex-1 whitespace-pre-line">{t.deliverySpecs}</p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <small className="text-xs text-gray-500">
                    {t.deadline ? `Prazo ${fmtDay(t.deadline)} · ` : ''}
                    {t.helper ? `dúvidas com ${t.helper}` : ''}
                  </small>
                  {t.status === 'pegaram' ? (
                    <span className={`${chip} text-amber-300 border-amber-500/40 bg-amber-500/10`}>{t.claimedBy === props.me ? 'Você pegou' : `Pegaram: ${t.claimedBy || ''}`}</span>
                  ) : (
                    <button className={btnPrimary} onClick={() => props.onClaim(t)}>
                      Pegar tarefa
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ====================================================================== */
/* Devlog                                                                  */
/* ====================================================================== */

function DevlogTab(props: {
  p: FullProject;
  prod: boolean;
  canEdit: boolean;
  me: string;
  myEmail: string;
  checkins: CheckIn[];
  loading: boolean;
  onSaved: (c: CheckIn, needs: string) => void;
}) {
  const { p, prod } = props;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ done: '', blocked: '', needs: 'nao', area: AREAS[0] });
  const [saving, setSaving] = useState(false);

  // O check-in antigo (campos do projeto) aparece como entrada do devlog se não houver um igual.
  const entries: CheckIn[] = [...props.checkins];
  if (p.lastCheckInDate && p.lastCheckInNotes && !entries.some((c) => c.date === p.lastCheckInDate && c.done === p.lastCheckInNotes)) {
    entries.push({ date: p.lastCheckInDate, author: p.leader, authorEmail: '', done: p.lastCheckInNotes, blocked: '', needsPeople: '', createdAt: 0 });
    entries.sort((a, b) => b.date.localeCompare(a.date));
  }
  const last = entries[0]?.date;
  const late = !last || daysSince(last) > 14;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!p.id) return;
    const needs = form.needs === 'sim' ? form.area : '';
    const c: CheckIn = { date: todayIso(), author: props.me, authorEmail: props.myEmail, done: form.done.trim(), blocked: form.blocked.trim(), needsPeople: needs, createdAt: Date.now() };
    try {
      setSaving(true);
      const ref = await addCheckIn(p.id, c);
      props.onSaved({ ...c, id: ref.id }, needs);
      setForm({ done: '', blocked: '', needs: 'nao', area: AREAS[0] });
      setOpen(false);
      toast.success('Check-in registrado.');
    } catch (err) {
      console.error(err);
      toast.error('Não deu para registrar o check-in.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-bold text-white">Devlog</h3>
          <p className="text-xs text-gray-400 mt-1">{prod ? 'O que andou no projeto. O time registra um check-in a cada 15 dias.' : 'O que andou no projeto.'}</p>
        </div>
        {prod && (
          <button className={late && !open ? btnPrimary : btnGhost} onClick={() => setOpen(!open)}>
            {open ? 'Fechar' : 'Registrar check-in'}
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={submit} className={`${panel} border-l-4 border-l-emerald-500 p-5 mb-8 space-y-4`}>
          <Field label="O que andou?">
            <textarea className={`${input} h-24 resize-y`} required value={form.done} onChange={(e) => setForm({ ...form, done: e.target.value })} placeholder="Ex.: a perseguição do palhaço já roda com três padrões de rota" />
          </Field>
          <Field label="O que travou? (opcional)">
            <textarea className={`${input} h-20 resize-y`} value={form.blocked} onChange={(e) => setForm({ ...form, blocked: e.target.value })} />
          </Field>
          <fieldset>
            <legend className={`text-[11px] ${mono} uppercase text-gray-400 mb-2`}>Está precisando de gente?</legend>
            <div className="flex flex-wrap items-center gap-5 text-sm text-gray-200">
              <label className="flex items-center gap-2">
                <input type="radio" name="needs" checked={form.needs === 'nao'} onChange={() => setForm({ ...form, needs: 'nao' })} className="accent-emerald-500" /> Não
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="needs" checked={form.needs === 'sim'} onChange={() => setForm({ ...form, needs: 'sim' })} className="accent-emerald-500" /> Sim, em
                <select
                  aria-label="Área"
                  value={form.area}
                  onChange={(e) => setForm({ ...form, area: e.target.value, needs: 'sim' })}
                  className={`bg-[#161619] border border-[var(--color-ink-faint)] py-1 px-2 text-xs text-gray-300 ${mono}`}
                >
                  {AREAS.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
          <button type="submit" className={btnPrimary} disabled={saving}>
            <Check size={13} /> {saving ? 'Registrando…' : 'Registrar'}
          </button>
        </form>
      )}

      {props.loading ? (
        <p className="text-sm text-gray-400">Carregando…</p>
      ) : !entries.length ? (
        <Empty>Nenhum registro ainda.</Empty>
      ) : (
        <ol className="border-l-2 border-gray-800 ml-2">
          {entries.map((c, i) => (
            <li key={c.id || `legacy-${i}`} className="relative pl-6 pb-6">
              <span className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-[#141414] border-2 border-emerald-500" />
              <time dateTime={c.date} className="text-xs text-gray-500">
                {fmtDay(c.date)} · {c.author}
              </time>
              <p className="text-gray-200 mt-1 whitespace-pre-line">{c.done}</p>
              {prod && (c.blocked || c.needsPeople) && (
                <p className="text-xs text-gray-400 mt-1">
                  {c.blocked ? `Travou: ${c.blocked} ` : ''}
                  {c.needsPeople ? `Precisava de gente em ${c.needsPeople}.` : ''}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ====================================================================== */
/* Arquivos                                                                */
/* ====================================================================== */

function FilesTab({ p, canEdit, onEditLinks, onAddDoc, saveProject }: { p: FullProject; canEdit: boolean; onEditLinks: () => void; onAddDoc: () => void; saveProject: (d: Partial<FullProject>, m?: string) => Promise<boolean> }) {
  const L = p.links || {};
  const row = (label: string, sub: string, url?: string, extra?: ReactNode) => (
    <div key={label + (url || '')} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b last:border-b-0 border-[var(--color-ink-faint)]">
      <div>
        <b className="block font-semibold text-white">{label}</b>
        <small className="text-xs text-gray-400">{sub}</small>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {extra}
        {url ? (
          <a className={btnGhost} href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={13} /> Abrir
          </a>
        ) : (
          <span className="text-xs text-gray-600">Não informado</span>
        )}
      </div>
    </div>
  );
  const removeDoc = (d: ProjectDocLink) => {
    saveProject({ docs: (p.docs || []).filter((x) => x !== d) }, 'Documento removido da lista.');
  };

  return (
    <div className="space-y-12">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-bold text-white">Documentos</h3>
            <p className="text-xs text-gray-400 mt-1">O GDD fica no topo da página. Roteiro e outros documentos ficam aqui.</p>
          </div>
          {canEdit && (
            <button className={btnGhost} onClick={onAddDoc}>
              <Plus size={13} /> Adicionar documento
            </button>
          )}
        </div>
        <div className={panel}>
          {row('GDD do projeto', p.gddTemplate ? `Modelo ${p.gddTemplate}` : 'Documento principal', p.gddUrl)}
          {(p.docs || []).map((d) =>
            row(
              d.name,
              d.type,
              d.url,
              canEdit ? (
                <ConfirmDelete label={`Tirar ${d.name} da lista (o documento continua no Drive)`} onConfirm={() => removeDoc(d)} />
              ) : undefined,
            ),
          )}
        </div>
      </section>
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-bold text-white">Links do projeto</h3>
            <p className="text-xs text-gray-400 mt-1">Tudo o que o time abre durante a produção.</p>
          </div>
          {canEdit && (
            <button className={btnGhost} onClick={onEditLinks}>
              <Link2 size={13} /> Editar links
            </button>
          )}
        </div>
        <div className={panel}>
          {row('Quadros da equipe', 'FigJam, Miro ou Figma', L.boards)}
          {row('Repositório', 'Código e controle de versão', p.repositoryUrl)}
          {row('Build jogável', 'Última versão para testar', p.buildUrl)}
          {row('Página no itch.io', 'Divulgação e feedback', p.itchUrl)}
          {row('Pasta de arquivos', 'Assets, áudio e documentos', L.drive)}
        </div>
      </section>
    </div>
  );
}

function LinksModal({ p, onClose, saveProject }: { p: FullProject; onClose: () => void; saveProject: (d: Partial<FullProject>, m?: string) => Promise<boolean> }) {
  const [f, setF] = useState({
    boards: p.links?.boards || '',
    repositoryUrl: p.repositoryUrl || '',
    buildUrl: p.buildUrl || '',
    itchUrl: p.itchUrl || '',
    drive: p.links?.drive || '',
  });
  const field = (k: keyof typeof f, label: string, ph: string) => (
    <Field label={label}>
      <input className={input} type="url" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={ph} />
    </Field>
  );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await saveProject(
      {
        links: { ...(p.links || {}), boards: f.boards.trim(), drive: f.drive.trim() },
        repositoryUrl: f.repositoryUrl.trim(),
        buildUrl: f.buildUrl.trim(),
        itchUrl: f.itchUrl.trim(),
      },
      'Links salvos.',
    );
    if (ok) onClose();
  };
  return (
    <Modal title="Links do projeto" sub="Deixe em branco o que ainda não existe." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {field('boards', 'Quadros da equipe (FigJam, Miro ou Figma)', 'https://www.figma.com/board/...')}
        {field('repositoryUrl', 'Repositório', 'https://github.com/...')}
        {field('buildUrl', 'Build jogável', 'https://...')}
        {field('itchUrl', 'Página no itch.io', 'https://...')}
        {field('drive', 'Pasta de arquivos', 'https://drive.google.com/...')}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DocModal({ p, onClose, saveProject }: { p: FullProject; onClose: () => void; saveProject: (d: Partial<FullProject>, m?: string) => Promise<boolean> }) {
  const [f, setF] = useState({ name: '', url: '', type: DOC_TYPES[0] });
  const roteiro = templateCopyUrl('roteiro');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const d: ProjectDocLink = { name: f.name.trim(), url: f.url.trim(), type: f.type };
    if (await saveProject({ docs: [...(p.docs || []), d] }, 'Documento adicionado.')) onClose();
  };
  return (
    <Modal title="Adicionar documento" sub="Roteiro, pesquisa, planilha ou qualquer documento que o time consulta." onClose={onClose}>
      {roteiro && (
        <p className="text-sm text-gray-300 mb-4">
          Ainda não tem roteiro?{' '}
          <a className="text-emerald-400 underline underline-offset-4" href={roteiro} target="_blank" rel="noopener noreferrer">
            Copie o modelo de roteiro da LAJE
          </a>{' '}
          e cole o link aqui.
        </p>
      )}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome">
          <input className={input} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Roteiro da tenda da sereia" />
        </Field>
        <Field label="Link">
          <input className={input} type="url" required value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://docs.google.com/..." />
        </Field>
        <Field label="Tipo">
          <select className={input} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            {DOC_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={btnPrimary}>
            Adicionar
          </button>
        </div>
      </form>
    </Modal>
  );
}
