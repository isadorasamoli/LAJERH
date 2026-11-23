import { FormEvent, useMemo, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import {
  ArrowLeft, Briefcase, CheckCircle2, ExternalLink, FileText, FolderOpen,
  LayoutDashboard, Plus, Trash2, Users, X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { db } from '../lib/firebase';
import { getAccessToken } from '../lib/auth';
import { copyGoogleDocument } from '../lib/workspace';
import {
  OpeningItem,
  ProjectDevlogItem,
  ProjectFileItem,
  ProjectItem,
  TaskItem
} from '../lib/projects';

interface ProjectWorkspaceProps {
  project: ProjectItem;
  openings: OpeningItem[];
  tasks: TaskItem[];
  canManage: boolean;
  onClose: () => void;
  onProjectUpdated: (project: ProjectItem) => void;
  onTaskUpdated: (task: TaskItem) => void;
  onTaskCreated: (task: Omit<TaskItem, 'id'>) => void;
  onOpeningCreated: (opening: Omit<OpeningItem, 'id'>) => void;
}

type WorkspaceTab = 'overview' | 'team' | 'tasks' | 'opportunities' | 'devlog' | 'files';

export default function ProjectWorkspace({
  project,
  openings,
  tasks,
  canManage,
  onClose,
  onProjectUpdated,
  onTaskUpdated,
  onTaskCreated,
  onOpeningCreated
}: ProjectWorkspaceProps) {
  const [tab, setTab] = useState<WorkspaceTab>('overview');
  const [gddUrl, setGddUrl] = useState(project.gddUrl || '');
  const [scriptUrl, setScriptUrl] = useState(project.scriptUrl || '');
  const [repositoryUrl, setRepositoryUrl] = useState(project.repositoryUrl || '');
  const [buildUrl, setBuildUrl] = useState(project.buildUrl || '');
  const [itchUrl, setItchUrl] = useState(project.itchUrl || '');
  const [creatingDocument, setCreatingDocument] = useState<'gdd' | 'script' | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDelivery, setTaskDelivery] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskItem['priority']>('media');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [devlogTitle, setDevlogTitle] = useState('');
  const [devlogSummary, setDevlogSummary] = useState('');
  const [devlogNext, setDevlogNext] = useState('');
  const [devlogBlockers, setDevlogBlockers] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileUrl, setFileUrl] = useState('');

  const projectOpenings = openings.filter(item => item.projectId === project.id);
  const projectTasks = tasks.filter(item => item.projectId === project.id);
  const teamMembers = useMemo(
    () => (project.teamMembers || '').split(',').map(item => item.trim()).filter(Boolean),
    [project.teamMembers]
  );

  const persistProject = async (patch: Partial<ProjectItem>) => {
    if (!project.id) return;
    await updateDoc(doc(db, 'projects', project.id), patch);
    onProjectUpdated({ ...project, ...patch });
  };

  const saveLinks = async () => {
    await persistProject({ gddUrl, scriptUrl, repositoryUrl, buildUrl, itchUrl });
    toast.success('Links do projeto atualizados');
  };

  const createGoogleDocument = async (kind: 'gdd' | 'script') => {
    const templateId = kind === 'gdd'
      ? import.meta.env.VITE_LAJE_GDD_TEMPLATE_ID
      : import.meta.env.VITE_LAJE_SCRIPT_TEMPLATE_ID;
    if (!templateId) {
      toast.error('Configure o ID do modelo de GDD ou roteiro nas variaveis VITE_LAJE_*_TEMPLATE_ID');
      return;
    }

    try {
      setCreatingDocument(kind);
      const accessToken = await getAccessToken();
      if (!accessToken) throw new Error('Entre novamente com sua conta Google para autorizar o Drive.');
      const label = kind === 'gdd' ? 'GDD' : 'Roteiro';
      const url = await copyGoogleDocument(accessToken, templateId, `${project.name} - ${label}`);
      if (kind === 'gdd') {
        setGddUrl(url);
        await persistProject({ gddUrl: url });
      } else {
        setScriptUrl(url);
        await persistProject({ scriptUrl: url });
      }
      window.open(url, '_blank', 'noopener,noreferrer');
      toast.success(`${label} criado no Google Docs`);
    } catch (error: any) {
      toast.error(error.message || 'Nao foi possivel criar o documento');
    } finally {
      setCreatingDocument(null);
    }
  };

  const moveTask = async (task: TaskItem, boardStatus: 'todo' | 'doing' | 'done') => {
    const status = boardStatus === 'todo'
      ? 'aberta'
      : boardStatus === 'doing'
        ? 'pegaram'
        : 'entregue';
    const patch: TaskItem = {
      ...task,
      boardStatus,
      status,
      deliveredAt: boardStatus === 'done' ? Date.now() : task.deliveredAt
    };
    const firestorePatch = {
      boardStatus,
      status,
      ...(boardStatus === 'done' ? { deliveredAt: Date.now() } : {})
    };
    await updateDoc(doc(db, 'tasks', task.id!), firestorePatch);
    onTaskUpdated(patch);
  };

  const addTask = (event: FormEvent) => {
    event.preventDefault();
    if (!taskTitle.trim()) return;
    onTaskCreated({
      title: taskTitle.trim(),
      projectId: project.id || '',
      projectName: project.name,
      area: 'geral',
      deliverySpecs: taskDelivery.trim() || 'Ver criterios de entrega',
      size: 'média',
      beginnerFriendly: false,
      deadline: taskDeadline,
      status: 'aberta',
      boardStatus: 'todo',
      priority: taskPriority,
      delivery: taskDelivery.trim(),
      createdAt: Date.now()
    });
    setTaskTitle('');
    setTaskDelivery('');
    setTaskDeadline('');
  };

  const addOpening = (event: FormEvent) => {
    event.preventDefault();
    const role = (event.currentTarget.elements.namedItem('role') as HTMLInputElement).value.trim();
    if (!role) return;
    onOpeningCreated({
      role,
      projectId: project.id || '',
      projectName: project.name,
      description: 'Vaga aberta pela pagina do projeto.',
      acceptsBeginners: true,
      estimatedTime: 'medio',
      status: 'aberta',
      openedAt: Date.now()
    });
    (event.currentTarget.elements.namedItem('role') as HTMLInputElement).value = '';
  };

  const addDevlog = async (event: FormEvent) => {
    event.preventDefault();
    if (!devlogTitle.trim() || !devlogSummary.trim()) return;
    const item: ProjectDevlogItem = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      author: 'Equipe do projeto',
      title: devlogTitle.trim(),
      summary: devlogSummary.trim(),
      nextSteps: devlogNext.trim(),
      blockers: devlogBlockers.trim(),
      createdAt: Date.now()
    };
    await persistProject({ devlogs: [item, ...(project.devlogs || [])] });
    setDevlogTitle('');
    setDevlogSummary('');
    setDevlogNext('');
    setDevlogBlockers('');
  };

  const removeDevlog = async (id: string) => {
    await persistProject({ devlogs: (project.devlogs || []).filter(item => item.id !== id) });
  };

  const removeFile = async (id: string) => {
    await persistProject({ files: (project.files || []).filter(item => item.id !== id) });
  };

  const tabs: Array<{ id: WorkspaceTab; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'overview', label: 'Visao geral', icon: LayoutDashboard },
    { id: 'team', label: 'Equipe', icon: Users },
    { id: 'tasks', label: 'Tarefas', icon: CheckCircle2 },
    { id: 'opportunities', label: 'Vagas', icon: Briefcase },
    { id: 'devlog', label: 'Devlog', icon: FileText },
    { id: 'files', label: 'Arquivos', icon: FolderOpen }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-[#141416] overflow-y-auto">
      <div className="sticky top-0 z-20 border-b border-gray-800 bg-[#141416]/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <button onClick={onClose} className="mt-1 flex items-center gap-2 text-xs text-gray-400 hover:text-white cursor-pointer">
              <ArrowLeft size={16} /> Voltar aos projetos
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Fechar"><X size={20} /></button>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <span className="text-3xl">{project.coverEmoji || '🎮'}</span>
            <div>
              <h2 className="text-2xl font-bold text-white">{project.name}</h2>
              <p className="text-xs text-emerald-400">{project.genre} • {project.engine} • {project.status}</p>
            </div>
          </div>
          <div className="mt-5 flex gap-2 overflow-x-auto">
            {tabs.map(item => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex shrink-0 items-center gap-2 px-3 py-2 text-xs border transition-colors ${
                  tab === item.id
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                    : 'border-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                <item.icon size={14} /> {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <section className="lg:col-span-2 space-y-4">
              <div className="border border-gray-800 bg-white/[0.02] p-5">
                <h3 className="text-sm font-bold text-white mb-3">Documentos principais</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { kind: 'gdd' as const, label: 'GDD', url: gddUrl, setUrl: setGddUrl },
                    { kind: 'script' as const, label: 'Roteiro', url: scriptUrl, setUrl: setScriptUrl }
                  ].map(docItem => (
                    <div key={docItem.kind} className="border border-gray-800 p-4">
                      <div className="text-xs text-gray-400 uppercase mb-2">{docItem.label}</div>
                      {docItem.url && (
                        <a href={docItem.url} target="_blank" rel="noreferrer" className="mb-3 flex items-center gap-2 text-sm text-emerald-300 hover:text-emerald-200">
                          Abrir documento <ExternalLink size={14} />
                        </a>
                      )}
                      {canManage && (
                        <div className="space-y-2">
                          <button
                            onClick={() => createGoogleDocument(docItem.kind)}
                            disabled={creatingDocument !== null}
                            className="w-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"
                          >
                            {creatingDocument === docItem.kind ? 'Criando...' : `Criar a partir do modelo`}
                          </button>
                          <input
                            value={docItem.url}
                            onChange={event => docItem.setUrl(event.target.value)}
                            placeholder={`Ou cole o link do ${docItem.label}`}
                            className="w-full border border-gray-700 bg-[#161619] px-3 py-2 text-xs text-white"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-gray-800 bg-white/[0.02] p-5">
                <h3 className="text-sm font-bold text-white mb-3">Visao geral</h3>
                <p className="text-sm leading-relaxed text-gray-300">{project.elevatorPitch || project.description}</p>
                {project.diferencial && <p className="mt-4 text-xs text-gray-400"><strong className="text-amber-400">Diferencial:</strong> {project.diferencial}</p>}
              </div>

              {canManage && (
                <button onClick={saveLinks} className="border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-300">
                  Salvar documentos e links
                </button>
              )}
            </section>

            <aside className="space-y-4">
              <div className="border border-gray-800 bg-white/[0.02] p-5 text-sm">
                <h3 className="text-sm font-bold text-white mb-3">Ficha rapida</h3>
                <p className="text-gray-400">Lider <strong className="text-white">{project.leader}</strong></p>
                <p className="mt-2 text-gray-400">Diretoria <strong className="text-white">{project.responsibleDirector || 'Diretoria de Projetos'}</strong></p>
                <p className="mt-2 text-gray-400">Semestre <strong className="text-white">{project.semester || '-'}</strong></p>
                {project.targetScope && <p className="mt-3 text-gray-300">{project.targetScope}</p>}
              </div>
              {canManage && (
                <div className="border border-gray-800 bg-white/[0.02] p-5 space-y-2">
                  <input value={repositoryUrl} onChange={event => setRepositoryUrl(event.target.value)} placeholder="Repositorio" className="w-full border border-gray-700 bg-[#161619] px-3 py-2 text-xs text-white" />
                  <input value={buildUrl} onChange={event => setBuildUrl(event.target.value)} placeholder="Build" className="w-full border border-gray-700 bg-[#161619] px-3 py-2 text-xs text-white" />
                  <input value={itchUrl} onChange={event => setItchUrl(event.target.value)} placeholder="itch.io" className="w-full border border-gray-700 bg-[#161619] px-3 py-2 text-xs text-white" />
                </div>
              )}
            </aside>
          </div>
        )}

        {tab === 'team' && (
          <div className="border border-gray-800 p-5">
            <h3 className="text-sm font-bold text-white mb-4">Equipe atual</h3>
            {teamMembers.length ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {teamMembers.map(member => (
                  <div key={member} className="border border-gray-800 p-4 text-sm text-gray-200">
                    <Users size={16} className="mb-2 text-emerald-400" /> {member}
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-500">Nenhum membro cadastrado.</p>}
          </div>
        )}

        {tab === 'tasks' && (
          <div className="space-y-4">
            {canManage && (
              <form onSubmit={addTask} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_150px_150px_auto] gap-2 border border-gray-800 p-3">
                <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Nova tarefa" className="border border-gray-700 bg-[#161619] px-3 py-2 text-xs text-white" />
                <input value={taskDelivery} onChange={e => setTaskDelivery(e.target.value)} placeholder="Entrega esperada" className="border border-gray-700 bg-[#161619] px-3 py-2 text-xs text-white" />
                <select value={taskPriority} onChange={e => setTaskPriority(e.target.value as TaskItem['priority'])} className="border border-gray-700 bg-[#161619] px-3 py-2 text-xs text-white">
                  <option value="baixa">Baixa</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                  <option value="bloqueadora">Bloqueadora</option>
                </select>
                <input type="date" value={taskDeadline} onChange={e => setTaskDeadline(e.target.value)} className="border border-gray-700 bg-[#161619] px-3 py-2 text-xs text-white" />
                <button className="flex items-center justify-center gap-2 bg-emerald-500 px-3 py-2 text-xs font-bold text-gray-950"><Plus size={14} /> Adicionar</button>
              </form>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {([
                ['todo', 'A fazer'],
                ['doing', 'Fazendo'],
                ['done', 'Feito']
              ] as const).map(([boardStatus, title]) => (
                <section key={boardStatus} className="border border-gray-800 bg-black/20 p-3 min-h-64">
                  <h3 className="mb-3 text-xs font-bold uppercase text-gray-400">{title}</h3>
                  <div className="space-y-2">
                    {projectTasks.filter(task => {
                      const normalized = task.boardStatus || (task.status === 'pegaram' ? 'doing' : task.status === 'entregue' ? 'done' : 'todo');
                      return normalized === boardStatus;
                    }).map(task => (
                      <div key={task.id} className="border border-gray-800 bg-[#161619] p-3">
                        <div className="flex justify-between gap-2">
                          <strong className="text-sm text-white">{task.title}</strong>
                          {task.priority && <span className="text-[10px] uppercase text-amber-400">{task.priority}</span>}
                        </div>
                        {task.delivery && <p className="mt-2 text-xs text-gray-400">{task.delivery}</p>}
                        {task.deadline && <p className="mt-2 text-[11px] text-gray-500">Prazo: {task.deadline}</p>}
                        {canManage && (
                          <div className="mt-3 flex gap-2">
                            {boardStatus !== 'todo' && <button onClick={() => moveTask(task, 'todo')} className="text-[11px] text-gray-400">A fazer</button>}
                            {boardStatus !== 'doing' && <button onClick={() => moveTask(task, 'doing')} className="text-[11px] text-emerald-400">Fazendo</button>}
                            {boardStatus !== 'done' && <button onClick={() => moveTask(task, 'done')} className="text-[11px] text-emerald-300">Feito</button>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}

        {tab === 'opportunities' && (
          <div className="space-y-4">
            {canManage && (
              <form onSubmit={addOpening} className="flex gap-2 border border-gray-800 p-3">
                <input name="role" placeholder="Funcao da vaga" className="flex-1 border border-gray-700 bg-[#161619] px-3 py-2 text-xs text-white" />
                <button className="bg-emerald-500 px-4 py-2 text-xs font-bold text-gray-950">Adicionar vaga</button>
              </form>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {projectOpenings.map(opening => (
                <div key={opening.id} className="border border-gray-800 p-4">
                  <span className="text-[10px] uppercase text-emerald-400">{opening.status}</span>
                  <h3 className="mt-1 text-sm font-bold text-white">{opening.role}</h3>
                  <p className="mt-2 text-xs text-gray-400">{opening.description}</p>
                </div>
              ))}
              {!projectOpenings.length && <p className="text-sm text-gray-500">Nenhuma vaga vinculada.</p>}
            </div>
          </div>
        )}

        {tab === 'devlog' && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5">
            {canManage && (
              <form onSubmit={addDevlog} className="border border-gray-800 p-4 space-y-3">
                <input value={devlogTitle} onChange={e => setDevlogTitle(e.target.value)} placeholder="Titulo do check-in" className="w-full border border-gray-700 bg-[#161619] px-3 py-2 text-xs text-white" />
                <textarea value={devlogSummary} onChange={e => setDevlogSummary(e.target.value)} placeholder="Resumo quinzenal" rows={5} className="w-full border border-gray-700 bg-[#161619] px-3 py-2 text-xs text-white" />
                <textarea value={devlogNext} onChange={e => setDevlogNext(e.target.value)} placeholder="Proximas metas" rows={3} className="w-full border border-gray-700 bg-[#161619] px-3 py-2 text-xs text-white" />
                <textarea value={devlogBlockers} onChange={e => setDevlogBlockers(e.target.value)} placeholder="Bloqueios" rows={2} className="w-full border border-gray-700 bg-[#161619] px-3 py-2 text-xs text-white" />
                <button className="w-full bg-emerald-500 px-3 py-2 text-xs font-bold text-gray-950">Publicar check-in</button>
              </form>
            )}
            <div className="space-y-3">
              {(project.devlogs || []).map(item => (
                <article key={item.id} className="border border-gray-800 p-4">
                  <div className="flex justify-between gap-3">
                    <div>
                      <span className="text-[11px] text-emerald-400">{item.date}</span>
                      <h3 className="mt-1 text-sm font-bold text-white">{item.title}</h3>
                    </div>
                    {canManage && <button onClick={() => removeDevlog(item.id)} className="text-gray-500 hover:text-red-400"><Trash2 size={14} /></button>}
                  </div>
                  <p className="mt-3 text-sm text-gray-300">{item.summary}</p>
                  {item.nextSteps && <p className="mt-3 text-xs text-gray-400"><strong className="text-white">Proximos passos:</strong> {item.nextSteps}</p>}
                  {item.blockers && <p className="mt-2 text-xs text-amber-400"><strong>Bloqueios:</strong> {item.blockers}</p>}
                </article>
              ))}
              {!(project.devlogs || []).length && <p className="text-sm text-gray-500">Nenhum check-in publicado.</p>}
            </div>
          </div>
        )}

        {tab === 'files' && (
          <div className="space-y-4">
            {canManage && (
              <form onSubmit={async event => {
                event.preventDefault();
                if (!fileName.trim() || !fileUrl.trim()) return;
                const item: ProjectFileItem = { id: crypto.randomUUID(), name: fileName.trim(), url: fileUrl.trim(), createdAt: Date.now() };
                await persistProject({ files: [item, ...(project.files || [])] });
                setFileName('');
                setFileUrl('');
              }} className="flex gap-2 border border-gray-800 p-3">
                <input value={fileName} onChange={e => setFileName(e.target.value)} placeholder="Nome do arquivo" className="w-48 border border-gray-700 bg-[#161619] px-3 py-2 text-xs text-white" />
                <input value={fileUrl} onChange={e => setFileUrl(e.target.value)} placeholder="Link" className="flex-1 border border-gray-700 bg-[#161619] px-3 py-2 text-xs text-white" />
                <button className="bg-emerald-500 px-4 py-2 text-xs font-bold text-gray-950">Adicionar</button>
              </form>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(project.files || []).map(item => (
                <div key={item.id} className="border border-gray-800 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <a href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-emerald-300">
                      <FolderOpen size={16} /> {item.name}
                    </a>
                    {canManage && <button onClick={() => removeFile(item.id)} className="text-gray-500 hover:text-red-400"><Trash2 size={14} /></button>}
                  </div>
                </div>
              ))}
              {!(project.files || []).length && <p className="text-sm text-gray-500">Nenhum arquivo cadastrado.</p>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
