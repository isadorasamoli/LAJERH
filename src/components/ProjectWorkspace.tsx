import { FormEvent, useEffect, useMemo, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  ArrowLeft, ArrowRight, BookOpen, Briefcase, Check, CheckCircle2, Clock3,
  ExternalLink, FileText, Flag, FolderOpen, Gamepad2, Image, Link2, Plus,
  RefreshCw, Sparkles, Trash2, Users
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { db, functions } from '../lib/firebase';
import { parseGdd, ParsedGdd } from '../lib/gddParser';
import {
  OpeningItem,
  ProjectDevlogItem,
  ProjectFileItem,
  ProjectItem,
  TaskItem
} from '../lib/projects';
import './ProjectWorkspace.css';

interface ProjectWorkspaceProps {
  project: ProjectItem;
  openings: OpeningItem[];
  tasks: TaskItem[];
  canManage: boolean;
  canEditProject: boolean;
  onClose: () => void;
  onProjectUpdated: (project: ProjectItem) => void;
  onTaskUpdated: (task: TaskItem) => void;
  onTaskCreated: (task: Omit<TaskItem, 'id'>) => void;
  onOpeningCreated: (opening: Omit<OpeningItem, 'id'>) => void;
}

type WorkspaceTab = 'overview' | 'team' | 'tasks' | 'opportunities' | 'devlog' | 'files';
type BoardStatus = 'todo' | 'doing' | 'done';
type TaskPriority = NonNullable<TaskItem['priority']>;

const tabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'team', label: 'Equipe' },
  { id: 'tasks', label: 'Tarefas' },
  { id: 'opportunities', label: 'Vagas e mural' },
  { id: 'devlog', label: 'Devlog' },
  { id: 'files', label: 'Arquivos' }
];

const boardColumns: Array<{ id: BoardStatus; title: string }> = [
  { id: 'todo', title: 'A fazer' },
  { id: 'doing', title: 'Fazendo' },
  { id: 'done', title: 'Feito' }
];

const priorityOrder: TaskPriority[] = ['bloqueadora', 'alta', 'media', 'baixa'];
const priorityLabel: Record<TaskPriority, string> = {
  bloqueadora: 'Crítica',
  alta: 'Importante',
  media: 'Importante',
  baixa: 'Polish'
};
const priorityClass: Record<TaskPriority, string> = {
  bloqueadora: 'red',
  alta: 'amber',
  media: 'amber',
  baixa: 'blue'
};

const statusOptions = ['Ideia', 'Em análise', 'Aprovado', 'Em produção', 'Pausado', 'Concluído', 'Cancelado'];
const taskAreas = ['arte', 'código', 'áudio', 'narrativa', 'testes', 'divulgação'];

const safeExternalUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
};

const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean)
  .map(part => part[0]).slice(0, 2).join('').toUpperCase() || '?';

const formatDate = (value?: string | number) => {
  if (!value) return '';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const daysSince = (value?: string | number) => {
  if (!value) return null;
  const date = typeof value === 'number' ? value : new Date(value).getTime();
  return Number.isNaN(date) ? null : Math.floor((Date.now() - date) / 86_400_000);
};

const relativeDate = (value?: string) => {
  const days = daysSince(value);
  if (days === null) return 'nunca';
  if (days < 1) return 'hoje';
  if (days === 1) return 'há 1 dia';
  return `há ${days} dias`;
};

const taskBoardStatus = (task: TaskItem): BoardStatus => task.boardStatus
  || (task.status === 'pegaram' ? 'doing' : task.status === 'entregue' ? 'done' : 'todo');

const priorityFor = (task: TaskItem): TaskPriority => task.priority || 'media';

export default function ProjectWorkspace({
  project,
  openings,
  tasks,
  canManage,
  canEditProject,
  onClose,
  onProjectUpdated,
  onTaskUpdated,
  onTaskCreated,
  onOpeningCreated
}: ProjectWorkspaceProps) {
  const [tab, setTab] = useState<WorkspaceTab>('overview');
  const [taskView, setTaskView] = useState<'kanban' | 'delivery'>('kanban');
  const [taskArea, setTaskArea] = useState('Todas');
  const [taskResponsibility, setTaskResponsibility] = useState('Todos');
  const [gddUrl, setGddUrl] = useState(project.gddUrl || '');
  const [scriptUrl, setScriptUrl] = useState(project.scriptUrl || '');
  const [boardsUrl, setBoardsUrl] = useState(project.boardsUrl || '');
  const [driveUrl, setDriveUrl] = useState(project.driveUrl || '');
  const [repositoryUrl, setRepositoryUrl] = useState(project.repositoryUrl || '');
  const [buildUrl, setBuildUrl] = useState(project.buildUrl || '');
  const [itchUrl, setItchUrl] = useState(project.itchUrl || '');
  const [creatingDocument, setCreatingDocument] = useState<'gdd' | 'script' | null>(null);
  const [gddMarkdown, setGddMarkdown] = useState('');
  const [loadingGdd, setLoadingGdd] = useState(false);
  const [gddError, setGddError] = useState('');
  const [gddReloadKey, setGddReloadKey] = useState(0);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDelivery, setTaskDelivery] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('media');
  const [taskAreaValue, setTaskAreaValue] = useState('');
  const [taskDeadline, setTaskDeadline] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [showOpeningForm, setShowOpeningForm] = useState(false);
  const [devlogTitle, setDevlogTitle] = useState('');
  const [devlogSummary, setDevlogSummary] = useState('');
  const [devlogNext, setDevlogNext] = useState('');
  const [devlogBlockers, setDevlogBlockers] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [showCheckinForm, setShowCheckinForm] = useState(false);
  const visibleTabs = useMemo(
    () => tabs.filter(item => canManage || !['tasks', 'files'].includes(item.id)),
    [canManage]
  );

  const projectOpenings = openings.filter(item => item.projectId === project.id && item.status === 'aberta');
  const projectTasks = tasks.filter(item => item.projectId === project.id && item.status !== 'cancelada');
  const teamMembers = useMemo(
    () => (project.teamMembers || '').split(',').map(item => item.trim()).filter(Boolean),
    [project.teamMembers]
  );
  const parsedGdd: ParsedGdd | null = useMemo(
    () => gddMarkdown ? parseGdd(gddMarkdown) : null,
    [gddMarkdown]
  );

  useEffect(() => {
    setGddUrl(project.gddUrl || '');
    setScriptUrl(project.scriptUrl || '');
    setBoardsUrl(project.boardsUrl || '');
    setDriveUrl(project.driveUrl || '');
    setRepositoryUrl(project.repositoryUrl || '');
    setBuildUrl(project.buildUrl || '');
    setItchUrl(project.itchUrl || '');
  }, [project.id]);

  useEffect(() => {
    if (!visibleTabs.some(item => item.id === tab)) setTab('overview');
  }, [tab, visibleTabs]);

  useEffect(() => {
    if (!project.id || !project.gddUrl) {
      setGddMarkdown('');
      setGddError('');
      setLoadingGdd(false);
      return;
    }

    let active = true;
    setLoadingGdd(true);
    setGddError('');
    const loadDocument = httpsCallable<{ projectId: string; kind: 'gdd' }, { markdown: string }>(
      functions,
      'getProjectDocumentMarkdown'
    );

    loadDocument({ projectId: project.id, kind: 'gdd' })
      .then(({ data }) => {
        if (active) setGddMarkdown(data.markdown);
      })
      .catch(error => {
        if (active) setGddError(error instanceof Error ? error.message : 'Não foi possível carregar o GDD.');
      })
      .finally(() => {
        if (active) setLoadingGdd(false);
      });

    return () => {
      active = false;
    };
  }, [project.gddUrl, project.id, gddReloadKey]);

  const persistProject = async (patch: Partial<ProjectItem>) => {
    if (!project.id) return;
    await updateDoc(doc(db, 'projects', project.id), patch);
    onProjectUpdated({ ...project, ...patch });
  };

  const saveLinks = async () => {
    const links = [gddUrl, scriptUrl, boardsUrl, repositoryUrl, buildUrl, itchUrl, driveUrl].filter(Boolean);
    if (links.some(link => !safeExternalUrl(link))) {
      toast.error('Use links HTTP ou HTTPS válidos.');
      return;
    }
    try {
      await persistProject({ gddUrl, scriptUrl, boardsUrl, repositoryUrl, buildUrl, itchUrl, driveUrl });
      toast.success('Links do projeto atualizados');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar os links.');
    }
  };

  const createGoogleDocument = async (kind: 'gdd' | 'script') => {
    try {
      setCreatingDocument(kind);
      if (!project.id) throw new Error('O projeto precisa estar salvo antes de criar documentos.');
      const createDocument = httpsCallable<
        { projectId: string; kind: 'gdd' | 'script' },
        { documentId: string; url: string }
      >(functions, 'createProjectDocument');
      const { data } = await createDocument({ projectId: project.id, kind });
      const patch = kind === 'gdd'
        ? { gddUrl: data.url, gddDocumentId: data.documentId }
        : { scriptUrl: data.url, scriptDocumentId: data.documentId };
      if (kind === 'gdd') setGddUrl(data.url);
      else setScriptUrl(data.url);
      onProjectUpdated({ ...project, ...patch });
      window.open(data.url, '_blank', 'noopener,noreferrer');
      toast.success(`${kind === 'gdd' ? 'GDD' : 'Roteiro'} criado no Google Docs`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar o documento.');
    } finally {
      setCreatingDocument(null);
    }
  };

  const moveTask = async (task: TaskItem, boardStatus: BoardStatus) => {
    const status = boardStatus === 'todo' ? 'aberta' : boardStatus === 'doing' ? 'pegaram' : 'entregue';
    const deliveredAt = boardStatus === 'done' ? Date.now() : task.deliveredAt;
    const patch: Partial<TaskItem> = { boardStatus, status, ...(boardStatus === 'done' ? { deliveredAt } : {}) };
    try {
      if (!task.id) throw new Error('Tarefa sem identificador.');
      await updateDoc(doc(db, 'tasks', task.id), patch);
      onTaskUpdated({ ...task, ...patch });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar a tarefa.');
    }
  };

  const updateTaskPriority = async (task: TaskItem) => {
    const orderIndex = priorityOrder.indexOf(priorityFor(task));
    const nextPriority = priorityOrder[(orderIndex + 1) % priorityOrder.length];
    try {
      if (!task.id) throw new Error('Tarefa sem identificador.');
      await updateDoc(doc(db, 'tasks', task.id), { priority: nextPriority });
      onTaskUpdated({ ...task, priority: nextPriority });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar a criticidade.');
    }
  };

  const addTask = (event: FormEvent) => {
    event.preventDefault();
    if (!taskTitle.trim()) return;
    onTaskCreated({
      title: taskTitle.trim(),
      projectId: project.id || '',
      projectName: project.name,
      area: taskAreaValue || 'geral',
      deliverySpecs: taskDelivery.trim() || 'Ver critérios de entrega',
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
    setTaskAreaValue('');
    setTaskDeadline('');
    setAddingTask(false);
  };

  const addOpening = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const role = (event.currentTarget.elements.namedItem('role') as HTMLInputElement).value.trim();
    const description = (event.currentTarget.elements.namedItem('description') as HTMLTextAreaElement).value.trim();
    if (!role) return;
    onOpeningCreated({
      role,
      projectId: project.id || '',
      projectName: project.name,
      description: description || 'Vaga aberta pela página do projeto.',
      acceptsBeginners: true,
      estimatedTime: 'médio',
      status: 'aberta',
      openedAt: Date.now()
    });
    event.currentTarget.reset();
    setShowOpeningForm(false);
  };

  const addDevlog = async (event: FormEvent) => {
    event.preventDefault();
    if (!devlogTitle.trim() || !devlogSummary.trim()) return;
    const item: ProjectDevlogItem = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      author: project.leader || 'Equipe do projeto',
      title: devlogTitle.trim(),
      summary: devlogSummary.trim(),
      nextSteps: devlogNext.trim(),
      blockers: devlogBlockers.trim(),
      createdAt: Date.now()
    };
    try {
      await persistProject({ devlogs: [item, ...(project.devlogs || [])], lastCheckInDate: item.date });
      setDevlogTitle('');
      setDevlogSummary('');
      setDevlogNext('');
      setDevlogBlockers('');
      setShowCheckinForm(false);
      toast.success('Check-in registrado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível registrar o check-in.');
    }
  };

  const removeDevlog = async (id: string) => {
    try {
      await persistProject({ devlogs: (project.devlogs || []).filter(item => item.id !== id) });
      toast.success('Registro removido.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível remover o registro.');
    }
  };

  const addFile = async (event: FormEvent) => {
    event.preventDefault();
    if (!fileName.trim() || !fileUrl.trim()) return;
    const url = safeExternalUrl(fileUrl.trim());
    if (!url) {
      toast.error('Informe um link HTTP ou HTTPS válido.');
      return;
    }
    const item: ProjectFileItem = {
      id: crypto.randomUUID(),
      name: fileName.trim(),
      url,
      createdAt: Date.now()
    };
    try {
      await persistProject({ files: [item, ...(project.files || [])] });
      setFileName('');
      setFileUrl('');
      toast.success('Arquivo adicionado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível adicionar o arquivo.');
    }
  };

  const removeFile = async (id: string) => {
    try {
      await persistProject({ files: (project.files || []).filter(item => item.id !== id) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível remover o arquivo.');
    }
  };

  const updateStatus = async (status: string) => {
    try {
      await persistProject({ status });
      toast.success('Status atualizado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar o status.');
    }
  };

  const attentionItems: Array<{ label: string; tab: WorkspaceTab }> = [];
  const lastCheckin = project.devlogs?.[0]?.date || project.lastCheckInDate;
  const projectAge = daysSince(project.createdAt);
  const checkinAge = daysSince(lastCheckin);
  if (canManage && project.gddUrl && checkinAge !== null && checkinAge > 14) {
    attentionItems.push({ label: `Check-in atrasado há ${checkinAge - 14} dias`, tab: 'devlog' });
  } else if (canManage && !lastCheckin && projectAge !== null && projectAge > 14) {
    attentionItems.push({ label: 'Nenhum check-in registrado', tab: 'devlog' });
  }
  if (canManage && parsedGdd?.recognized) {
    const missingHeadings = parsedGdd.completeness.sections.filter(section => !section.found);
    const emptySections = parsedGdd.completeness.sections.filter(section => section.found && !section.filled);
    if (missingHeadings.length) {
      attentionItems.push({
        label: `O GDD não tem o título "${missingHeadings.map(section => section.heading).join('", "')}"`,
        tab: 'overview'
      });
    }
    if (emptySections.length && emptySections.length < parsedGdd.completeness.total) {
      attentionItems.push({
        label: `GDD: falta preencher ${emptySections.map(section => section.label.toLowerCase()).join(', ')}`,
        tab: 'overview'
      });
    }
  }
  const oldOpening = canManage
    ? projectOpenings.find(opening => {
      const age = daysSince(opening.openedAt);
      return age !== null && age > 30;
    })
    : undefined;
  if (oldOpening) {
    const age = daysSince(oldOpening.openedAt) || 0;
    attentionItems.push({ label: `Vaga aberta há ${age} dias, vale revisar o texto`, tab: 'opportunities' });
  }

  const filteredTasks = projectTasks.filter(task => {
    const matchesArea = taskArea === 'Todas' || task.area === taskArea;
    const matchesResponsible = taskResponsibility === 'Todos'
      || (taskResponsibility === 'Com responsável' && Boolean(task.claimedBy))
      || (taskResponsibility === 'Sem responsável' && !task.claimedBy);
    return matchesArea && matchesResponsible;
  }).sort((a, b) => priorityOrder.indexOf(priorityFor(a)) - priorityOrder.indexOf(priorityFor(b)));

  const overview = parsedGdd && (
    parsedGdd.pitch || parsedGdd.usp || parsedGdd.pillars.length || parsedGdd.mechanics.length
    || parsedGdd.story.length || parsedGdd.scope.essential || parsedGdd.scope.nice || parsedGdd.scope.out
  );
  const documentRows = [
    { name: 'GDD do projeto', type: 'Documento principal · lido pelo site', url: project.gddUrl, parsed: true },
    { name: 'Roteiro', type: 'Documento de narrativa', url: project.scriptUrl, parsed: false },
    ...(project.files || []).map(file => ({ name: file.name, type: file.type || 'Arquivo do projeto', url: file.url, parsed: false }))
  ];
  const projectLinks = [
    { name: 'Quadros da equipe', description: 'FigJam, Miro ou Figma, onde o time desenha fluxos e junta ideias', value: boardsUrl, setValue: setBoardsUrl },
    { name: 'Repositório', description: 'Código e controle de versão', value: repositoryUrl, setValue: setRepositoryUrl },
    { name: 'Build jogável', description: 'Última versão para testar', value: buildUrl, setValue: setBuildUrl },
    { name: 'Página no itch.io', description: 'Divulgação e feedback', value: itchUrl, setValue: setItchUrl },
    { name: 'Pasta de arquivos', description: 'Assets, áudio e documentos', value: driveUrl, setValue: setDriveUrl }
  ];

  return (
    <div className="lp-shell fixed inset-0 z-50 overflow-y-auto">
      <div className="lp lp-page">
        <nav className="lp-crumb" aria-label="Caminho">
          <button onClick={onClose}><ArrowLeft size={14} /> Projetos &amp; Oportunidades</button>
          <span aria-hidden="true"> / </span>{project.name}
        </nav>

        {canEditProject && <div className="lp-cover empty lp-cover-placeholder" aria-label="Capa do projeto">
          <Image />
          <span><b>Capa do projeto</b><small>O armazenamento de imagens ainda não está integrado.</small></span>
        </div>}

        <header className="lp-head">
          <h1 className="lp-title">{project.name}</h1>
          {canEditProject ? (
            <select className="lp-btn" aria-label="Status do projeto" value={project.status} onChange={event => void updateStatus(event.target.value)}>
              {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
              {!statusOptions.includes(project.status) && <option value={project.status}>{project.status}</option>}
            </select>
          ) : <span className="lp-chip green"><i className="lp-dot" />{project.status}</span>}
        </header>

        <dl className="lp-facts">
          {[
            ['Gênero', project.genre],
            ['Engine', project.engine],
            ['Plataformas', parsedGdd?.overview['Plataformas']],
            ['Perspectiva', parsedGdd?.overview['Perspectiva e câmera']],
            ['Modo de jogo', parsedGdd?.overview['Modo de jogo']],
            ['Duração', parsedGdd?.overview['Duração']],
            ['Semestre', project.semester],
            ['Tamanho e prazo', project.targetScope],
            ['Líder', project.leader + (project.responsibleDirector ? ` · Diretoria ${project.responsibleDirector}` : '')]
          ].filter((fact): fact is [string, string] => Boolean(fact[1])).map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>

        {project.gddUrl && (
          <section className="lp-gdd" aria-label="GDD do projeto">
            <span className="lp-tile big c-green"><FileText /></span>
            <div className="lp-gdd-main">
              <h2>GDD do projeto</h2>
              <p>Documento principal · modelo da LAJE · lido {relativeDate(parsedGdd?.syncedAt)}</p>
            </div>
            {canManage && parsedGdd && (
              <div className="lp-gdd-prog">
                <span className={`lp-bar ${parsedGdd.completeness.filled < parsedGdd.completeness.total ? 'amber' : ''}`}>
                  <i style={{ width: `${Math.round(parsedGdd.completeness.filled / parsedGdd.completeness.total * 100)}%` }} />
                </span>
                <small>{parsedGdd.completeness.filled} de {parsedGdd.completeness.total} seções preenchidas</small>
              </div>
            )}
            <div className="lp-gdd-act">
              {canEditProject && <button className="lp-btn soft" onClick={() => setGddReloadKey(key => key + 1)} disabled={loadingGdd}>
                <RefreshCw className={loadingGdd ? 'lp-spin' : ''} />{loadingGdd ? 'Lendo' : 'Sincronizar'}
              </button>}
              {safeExternalUrl(project.gddUrl) ? (
                <a className="lp-btn primary" href={safeExternalUrl(project.gddUrl)} target="_blank" rel="noreferrer"><ExternalLink />Abrir no Docs</a>
              ) : <span className="lp-muted">Link do GDD inválido</span>}
            </div>
          </section>
        )}

        {attentionItems.length > 0 && (
          <div className="lp-attn" role="status">
            <span className="lp-attn-l"><i className="lp-dot" />Precisa de atenção</span>
            {attentionItems.map((item, index) => (
              <button key={`${item.tab}-${index}`} onClick={() => setTab(item.tab)}>{item.label}</button>
            ))}
          </div>
        )}

        <div className="lp-tabs" role="tablist" aria-label="Seções do projeto">
          {visibleTabs.map(item => (
            <button key={item.id} className="lp-tab" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
              {item.label}{item.id === 'team' && teamMembers.length > 0 && <span className="n">{teamMembers.length}</span>}
              {item.id === 'opportunities' && projectOpenings.length > 0 && <span className="n">{projectOpenings.length}</span>}
            </button>
          ))}
        </div>

        <main role="tabpanel">
          {tab === 'overview' && (
            !project.gddUrl ? (
              canEditProject ? (
                <section className="lp-start">
                  <h2>Comece pelo GDD do projeto</h2>
                  <p>O GDD é o documento que explica o jogo. Você escreve no Google Docs e esta página se monta sozinha a partir dele.</p>
                  <div className="lp-start-grid">
                    <div className="lp-option">
                      <h3>Criar a partir do modelo da LAJE</h3>
                      <p>Cria uma cópia do modelo na pasta da liga, já compartilhada com o time.</p>
                      <button className="lp-btn primary" onClick={() => void createGoogleDocument('gdd')} disabled={creatingDocument !== null}>
                        <FileText />{creatingDocument === 'gdd' ? 'Criando...' : 'Criar documento'}
                      </button>
                    </div>
                    <form className="lp-option" onSubmit={event => { event.preventDefault(); void saveLinks(); }}>
                      <h3>Já tenho um documento</h3>
                      <p>Cole o link de um Google Docs que siga o modelo da LAJE.</p>
                      <div className="lp-field">
                        <label htmlFor="project-gdd-url">Link do documento</label>
                        <input id="project-gdd-url" type="url" required value={gddUrl} onChange={event => setGddUrl(event.target.value)} placeholder="https://docs.google.com/document/d/..." />
                      </div>
                      <p className="lp-note">Para o site conseguir ler, compartilhe o documento com a conta de serviço como leitor.</p>
                      <button className="lp-btn soft" type="submit"><Link2 />Conectar documento</button>
                    </form>
                  </div>
                </section>
              ) : <div className="lp-empty"><span>Este projeto ainda não tem um GDD. Quando o líder conectar o documento, a descrição do jogo aparece aqui.</span></div>
            ) : loadingGdd ? (
              <div className="lp-empty"><span>Carregando o GDD do projeto…</span></div>
            ) : gddError ? (
              <div className="lp-empty" role="alert"><span>{gddError}</span><button className="lp-btn small" onClick={() => setGddReloadKey(key => key + 1)}><RefreshCw />Tentar novamente</button></div>
            ) : !parsedGdd || parsedGdd.recognized === 0 ? (
              <div className="lp-empty"><span>Não encontrei títulos do modelo da LAJE neste documento. Confira o GDD e sincronize novamente.</span></div>
            ) : !overview ? (
              <div className="lp-empty"><span>O documento ainda está em branco. Abra o GDD, escreva o elevator pitch e volte para sincronizar.</span></div>
            ) : (
              <div className="lp-stack">
                {parsedGdd.pitch && <section className="lp-hero c-green"><span className="lp-tile big"><Gamepad2 /></span><div><div className="lp-kicker">O jogo em um parágrafo</div><p>{parsedGdd.pitch}</p></div></section>}
                {parsedGdd.usp && <section className="lp-sec c-amber"><div className="lp-sh"><span className="lp-tile"><Sparkles /></span><div><h3>O diferencial</h3><p>O que este jogo tem que os outros do gênero não têm.</p></div></div><p className="lp-text">{parsedGdd.usp}</p></section>}
                {parsedGdd.pillars.length > 0 && <section className="lp-sec c-purple"><div className="lp-sh"><span className="lp-tile"><CheckCircle2 /></span><div><h3>Pilares de design</h3><p>Princípios que decidem o que entra no jogo e o que fica de fora.</p></div></div><div className="lp-cols">{parsedGdd.pillars.map((item, index) => <article key={`${item.name}-${index}`} className={`lp-item ${['c-purple', 'c-green', 'c-amber', 'c-blue'][index % 4]}`}><h4>{item.name || `Pilar ${index + 1}`}</h4><p>{item.text}</p></article>)}</div></section>}
                {parsedGdd.mechanics.length > 0 && <section className="lp-sec c-teal"><div className="lp-sh"><span className="lp-tile"><Check /></span><div><h3>Mecânicas principais</h3><p>O que o jogador faz, uma regra por mecânica.</p></div></div><div className="lp-cols">{parsedGdd.mechanics.map((item, index) => <article key={`${item.name}-${index}`} className="lp-item c-teal">{item.name && <h4>{item.name}</h4>}<p>{item.text}</p></article>)}</div></section>}
                {(parsedGdd.scope.essential || parsedGdd.scope.nice || parsedGdd.scope.out) && <section className="lp-sec c-coral"><div className="lp-sh"><span className="lp-tile"><Flag /></span><div><h3>Escopo</h3><p>O que entra na primeira versão e o que fica de fora.</p></div></div><div className="lp-scope">
                  <div className="c-green"><span className="lp-tile sm"><Check /></span><b>Essencial</b><p>{parsedGdd.scope.essential || 'Não informado'}</p></div>
                  <div className="c-amber"><span className="lp-tile sm"><Clock3 /></span><b>Desejável</b><p>{parsedGdd.scope.nice || 'Não informado'}</p></div>
                  <div className="c-red"><span className="lp-tile sm"><Check /></span><b>Fora do escopo</b><p>{parsedGdd.scope.out || 'Não informado'}</p></div>
                </div></section>}
                {parsedGdd.story.length > 0 && <section className="lp-sec c-rose"><div className="lp-sh"><span className="lp-tile"><BookOpen /></span><div><h3>História</h3><p>Os eixos da narrativa. O roteiro completo fica em um documento à parte.</p></div></div><div className="lp-cols">{parsedGdd.story.map((item, index) => <article key={`${item.label}-${index}`} className="lp-item c-rose"><h4>{item.label || `Elemento ${index + 1}`}</h4><p>{item.text}</p></article>)}</div></section>}
                {parsedGdd.art.images > 0 && <section className="lp-sec c-blue"><div className="lp-sh"><span className="lp-tile"><Image /></span><div><h3>Arte de apoio</h3></div></div><div className="lp-gallery">{Array.from({ length: Math.min(parsedGdd.art.images, 8) }, (_, index) => <div key={index}>Imagem {index + 1}</div>)}</div></section>}
              </div>
            )
          )}

          {tab === 'team' && (
            <section>
              <div className="lp-h"><div><h3>Equipe atual</h3><p>Pessoas que fazem parte do projeto.</p></div></div>
              {teamMembers.length ? <div className="lp-people">{teamMembers.map(member => (
                <article key={member} className="lp-person"><div className="lp-avatar">{initials(member)}</div><div><b>{member}</b><div className="lp-roles"><span className="lp-chip">Equipe do projeto</span></div></div></article>
              ))}</div> : <div className="lp-empty"><span>Nenhum membro cadastrado na equipe deste projeto.</span></div>}
            </section>
          )}

          {tab === 'tasks' && (
            <>
              <div className="lp-toolbar">
                <div className="lp-seg" role="tablist" aria-label="Forma de ver as tarefas">
                  <button role="tab" aria-selected={taskView === 'kanban'} onClick={() => setTaskView('kanban')}>Quadro</button>
                  <button role="tab" aria-selected={taskView === 'delivery'} onClick={() => setTaskView('delivery')}>Por entrega</button>
                </div>
                <span className="lp-sum"><b>{projectTasks.filter(task => taskBoardStatus(task) === 'done').length} de {projectTasks.length}</b> feitas</span>
                <span className="lp-toolbar-r">
                  <select aria-label="Filtrar por área" value={taskArea} onChange={event => setTaskArea(event.target.value)}>
                    <option>Todas</option>{[...new Set(projectTasks.map(task => task.area).filter(Boolean))].map(area => <option key={area}>{area}</option>)}
                  </select>
                  <select aria-label="Filtrar por responsável" value={taskResponsibility} onChange={event => setTaskResponsibility(event.target.value)}>
                    {['Todos', 'Com responsável', 'Sem responsável'].map(value => <option key={value}>{value}</option>)}
                  </select>
                  {canManage && <button className="lp-btn small primary" onClick={() => {
                    setAddingTask(true);
                    window.setTimeout(() => document.querySelector<HTMLInputElement>('#new-project-task input')?.focus(), 0);
                  }}><Plus />Nova tarefa</button>}
                </span>
              </div>
              <p className="lp-legend"><span className="lp-chip red">Crítica</span> bloqueia o jogo <span className="lp-chip amber">Importante</span> melhora muito <span className="lp-chip blue">Polish</span> acabamento</p>
              {canManage && addingTask && <form id="new-project-task" onSubmit={addTask} className="lp-tcard adding lp-task-form">
                <input value={taskTitle} onChange={event => setTaskTitle(event.target.value)} placeholder="O que precisa ser feito?" aria-label="Título da tarefa" required />
                <div className="lp-sel3">
                  <select value={taskAreaValue} onChange={event => setTaskAreaValue(event.target.value)} aria-label="Área">
                    <option value="">Sem área</option>{taskAreas.map(area => <option key={area} value={area}>{area}</option>)}
                  </select>
                  <select value={taskPriority} onChange={event => setTaskPriority(event.target.value as TaskPriority)} aria-label="Criticidade">
                    {priorityOrder.map(priority => <option key={priority} value={priority}>{priorityLabel[priority]}</option>)}
                  </select>
                  <input type="date" value={taskDeadline} onChange={event => setTaskDeadline(event.target.value)} aria-label="Prazo" />
                </div>
                <input value={taskDelivery} onChange={event => setTaskDelivery(event.target.value)} placeholder="Entrega esperada" aria-label="Entrega esperada" />
                <div className="lp-row"><button className="lp-btn small primary" type="submit"><Plus />Adicionar</button><button className="lp-btn small" type="button" onClick={() => setAddingTask(false)}>Cancelar</button></div>
              </form>}
              {taskView === 'kanban' ? (
                <div className="lp-board">
                  {boardColumns.map((column, columnIndex) => {
                    const columnTasks = filteredTasks.filter(task => taskBoardStatus(task) === column.id);
                    return <section className="lp-col" key={column.id}>
                      <h3>{column.title} <span>{columnTasks.length}</span></h3>
                      {column.id === 'todo' && addingTask && canManage && <p className="lp-colempty">Preencha a tarefa no formulário acima.</p>}
                      {columnTasks.length ? columnTasks.map(task => {
                        const taskId = task.id || task.title;
                        const priority = priorityFor(task);
                        return <article className={`lp-tcard p-${priorityClass[priority]} ${column.id === 'done' ? 'done' : ''}`} key={taskId}>
                          <div className="t">{task.title}</div>
                          <div className="lp-tfoot">
                            {task.area && <span className="lp-chip">{task.area}</span>}
                            <button className={`lp-chip lp-pr ${priorityClass[priority]}`} onClick={() => void updateTaskPriority(task)} title="Clique para mudar a criticidade">{priorityLabel[priority]}</button>
                            {task.claimedBy && <span className="lp-avatar sm" title={task.claimedBy}>{initials(task.claimedBy)}</span>}
                            <span className="lp-move">
                              {columnIndex > 0 && <button className="lp-ib" onClick={() => void moveTask(task, boardColumns[columnIndex - 1].id)} aria-label={`Mover para ${boardColumns[columnIndex - 1].title}`}><ArrowLeft /></button>}
                              {columnIndex < boardColumns.length - 1 && <button className="lp-ib" onClick={() => void moveTask(task, boardColumns[columnIndex + 1].id)} aria-label={`Mover para ${boardColumns[columnIndex + 1].title}`}><ArrowRight /></button>}
                            </span>
                          </div>
                        </article>;
                      }) : !addingTask && <p className="lp-colempty">Nada aqui ainda</p>}
                    </section>;
                  })}
                </div>
              ) : (
                <div>
                  <div className="lp-h"><div><h3>Entregas</h3><p>Marcos do projeto. Tarefas sem uma entrega continuam aparecendo.</p></div></div>
                  {Array.from(new Set(filteredTasks.map(task => task.delivery?.trim() || 'Sem entrega'))).map(delivery => {
                    const deliveryTasks = filteredTasks.filter(task => (task.delivery?.trim() || 'Sem entrega') === delivery);
                    const doneCount = deliveryTasks.filter(task => taskBoardStatus(task) === 'done').length;
                    const targetDate = deliveryTasks.find(task => task.deadline)?.deadline;
                    return <section className="lp-ms" key={delivery}>
                      <div className="lp-ms-head"><h3>{delivery}</h3><small>{targetDate ? `alvo ${formatDate(targetDate)} · ` : ''}{doneCount} de {deliveryTasks.length} feitas</small><span className="lp-bar"><i style={{ width: `${deliveryTasks.length ? Math.round(doneCount / deliveryTasks.length * 100) : 0}%` }} /></span></div>
                      {deliveryTasks.map(task => <div className={`lp-trow ${taskBoardStatus(task) === 'done' ? 'done' : ''}`} key={task.id || task.title}>
                        <span className="t">{task.title}</span><span>{task.area && <span className="lp-chip">{task.area}</span>}</span>
                        <button className={`lp-chip ${priorityClass[priorityFor(task)]}`} onClick={() => void updateTaskPriority(task)}>{priorityLabel[priorityFor(task)]}</button>
                        <span className="lp-muted">{task.claimedBy || 'Sem responsável'}</span>
                        {canManage ? <select aria-label="Status da tarefa" value={taskBoardStatus(task)} onChange={event => void moveTask(task, event.target.value as BoardStatus)}>
                          {boardColumns.map(column => <option key={column.id} value={column.id}>{column.title}</option>)}
                        </select> : <span className="lp-chip">{boardColumns.find(column => column.id === taskBoardStatus(task))?.title}</span>}
                      </div>)}
                    </section>;
                  })}
                  {!filteredTasks.length && <div className="lp-empty"><span>Nenhuma tarefa cadastrada para este projeto.</span></div>}
                </div>
              )}
            </>
          )}

          {tab === 'opportunities' && (
            <>
              <div className="lp-h"><div><h3>Vagas abertas</h3><p>Oportunidades vinculadas a este projeto.</p></div></div>
              {canEditProject && !showOpeningForm && <button className="lp-btn small amber lp-publish-vacancy" onClick={() => setShowOpeningForm(true)}><Plus />Publicar vaga</button>}
              {canEditProject && showOpeningForm && <form className="lp-form" onSubmit={addOpening}>
                <div className="lp-two">
                  <div className="lp-field"><label htmlFor="opening-role">Função</label><input id="opening-role" name="role" required placeholder="Ex.: artista 2D para tilesets" /></div>
                  <div className="lp-field"><label htmlFor="opening-description">O que a pessoa vai entregar</label><input id="opening-description" name="description" placeholder="Descreva a entrega" /></div>
                </div>
                <div className="lp-row"><button className="lp-btn amber" type="submit"><Plus />Publicar vaga</button><button className="lp-btn" type="button" onClick={() => setShowOpeningForm(false)}>Cancelar</button></div>
              </form>}
              {projectOpenings.length ? <div className="lp-cards">{projectOpenings.map(opening => {
                const age = daysSince(opening.openedAt) || 0;
                return <article className="lp-card vaga" key={opening.id || opening.role}>
                  <div className="lp-row"><span className="lp-chip amber">{opening.role}</span>{opening.acceptsBeginners && <span className="lp-chip green">Aceita quem está começando</span>}</div>
                  <h4>{opening.role}</h4><p>{opening.description}</p>
                  <div className="lp-card-foot"><small>Aberta há {age} d · tempo {opening.estimatedTime || 'não informado'}</small><span className="lp-chip">{opening.status}</span></div>
                </article>;
              })}</div> : <div className="lp-empty"><span>Nenhuma vaga aberta neste projeto.</span></div>}
              <div className="lp-h"><div><h3>Mural de tarefas</h3><p>Tarefas abertas que podem ser assumidas por membros da liga.</p></div></div>
              {projectTasks.filter(task => task.status === 'aberta' && !task.boardStatus).length ? (
                <div className="lp-cards">{projectTasks.filter(task => task.status === 'aberta' && !task.boardStatus).map(task => <article className="lp-card tarefa" key={task.id || task.title}>
                  <div className="lp-row"><span className="lp-chip green">{task.area}</span><span className="lp-chip">Tamanho {task.size}</span></div>
                  <h4>{task.title}</h4><p>{task.deliverySpecs}</p><div className="lp-card-foot"><small>Prazo {formatDate(task.deadline)}</small>{task.claimedBy && <span className="lp-chip amber">Pegaram: {task.claimedBy}</span>}</div>
                </article>)}</div>
              ) : <div className="lp-empty"><span>Nenhuma tarefa avulsa aberta.</span></div>}
            </>
          )}

          {tab === 'devlog' && (
            <>
              <div className="lp-h"><div><h3>Devlog</h3><p>O que andou no projeto, em uma linha por check-in.</p></div>
                {canManage && <button className="lp-btn small primary" onClick={() => setShowCheckinForm(value => !value)}>{showCheckinForm ? 'Fechar' : 'Registrar check-in'}</button>}
              </div>
              {canManage && showCheckinForm && <form className="lp-form" onSubmit={event => void addDevlog(event)}>
                <div className="lp-field"><label htmlFor="devlog-title">Título do check-in</label><input id="devlog-title" value={devlogTitle} onChange={event => setDevlogTitle(event.target.value)} required placeholder="Ex.: Check-in da quinzena" /></div>
                <div className="lp-field"><label htmlFor="devlog-summary">O que andou?</label><textarea id="devlog-summary" value={devlogSummary} onChange={event => setDevlogSummary(event.target.value)} required placeholder="O que avançou no projeto?" /></div>
                <div className="lp-field"><label htmlFor="devlog-blockers">O que travou? (opcional)</label><textarea id="devlog-blockers" value={devlogBlockers} onChange={event => setDevlogBlockers(event.target.value)} placeholder="Bloqueios" /></div>
                <div className="lp-field"><label htmlFor="devlog-next">Próximos passos (opcional)</label><textarea id="devlog-next" value={devlogNext} onChange={event => setDevlogNext(event.target.value)} placeholder="O que vem agora?" /></div>
                <button className="lp-btn primary" type="submit"><Check />Registrar</button>
              </form>}
              {(project.devlogs || []).length ? <div className="lp-timeline">{(project.devlogs || []).map(item => (
                <article className="lp-entry" key={item.id}>
                  <time dateTime={item.date}>{formatDate(item.date)} · {item.author}</time>
                  <h4>{item.title}</h4><p>{item.summary}</p>
                  {(item.blockers || item.nextSteps) && <div className="more">{item.blockers && <>Travou: {item.blockers} </>}{item.nextSteps && <>Próximos passos: {item.nextSteps}</>}</div>}
                  {canManage && <button className="lp-ib lp-entry-delete" onClick={() => void removeDevlog(item.id)} aria-label="Excluir registro"><Trash2 /></button>}
                </article>
              ))}</div> : <div className="lp-empty"><span>Nenhum registro ainda.</span></div>}
            </>
          )}

          {tab === 'files' && (
            <>
              <div className="lp-h"><div><h3>Documentos</h3><p>O GDD é lido pelo site. Os outros documentos ficam aqui como referência.</p></div>
                {canEditProject && <button className="lp-btn small" onClick={() => void createGoogleDocument('script')} disabled={creatingDocument !== null}><Plus />{creatingDocument === 'script' ? 'Criando...' : 'Criar roteiro'}</button>}
              </div>
              <div className="lp-list">{documentRows.map((item, index) => {
                const url = safeExternalUrl(item.url || '');
                return <div className="lp-frow" key={`${item.name}-${index}`}>
                  <div><b>{item.name}</b><small>{item.type}</small></div>
                  <div className="lp-row">{item.parsed && item.url && <span className="lp-chip green">Lido pelo site</span>}
                    {url ? <a className="lp-btn small" href={url} target="_blank" rel="noreferrer"><ExternalLink />Abrir</a> : <span className="lp-muted">Não informado</span>}
                  </div>
                </div>;
              })}</div>
              {canEditProject && <form className="lp-form lp-file-form" onSubmit={event => void addFile(event)}>
                <div className="lp-two">
                  <div className="lp-field"><label htmlFor="file-name">Nome do arquivo</label><input id="file-name" value={fileName} onChange={event => setFileName(event.target.value)} required placeholder="Ex.: Pesquisa de referências" /></div>
                  <div className="lp-field"><label htmlFor="file-url">Link</label><input id="file-url" type="url" value={fileUrl} onChange={event => setFileUrl(event.target.value)} required placeholder="https://..." /></div>
                </div>
                <button className="lp-btn primary" type="submit"><Plus />Adicionar arquivo</button>
              </form>}
              {(project.files || []).length > 0 && <div className="lp-list lp-added-files">{(project.files || []).map(item => {
                const url = safeExternalUrl(item.url);
                return <div className="lp-frow" key={item.id}>
                  <div><b>{item.name}</b><small>{item.type || 'Arquivo do projeto'}</small></div>
                  <div className="lp-row">{url ? <a className="lp-btn small" href={url} target="_blank" rel="noreferrer"><ExternalLink />Abrir</a> : <span className="lp-muted">Link inválido</span>}
                    {canEditProject && <button className="lp-ib" onClick={() => void removeFile(item.id)} aria-label={`Remover ${item.name}`}><Trash2 /></button>}
                  </div>
                </div>;
              })}</div>}
              <div className="lp-h lp-links-heading"><div><h3>Links do projeto</h3><p>Tudo o que o time abre durante a produção.</p></div>
                {canEditProject && <button className="lp-btn small" onClick={() => void saveLinks()}><Link2 />Salvar links</button>}
              </div>
              <div className="lp-list">
                {projectLinks.map(item => <div className="lp-frow" key={item.name}>
                  <div><b>{item.name}</b><small>{item.description}</small></div>
                  <div className="lp-row">{canEditProject && <input className="lp-link-input" aria-label={item.name} value={item.value} onChange={event => item.setValue(event.target.value)} placeholder="https://..." />}
                    {safeExternalUrl(item.value) ? <a className="lp-btn small" href={safeExternalUrl(item.value)} target="_blank" rel="noreferrer"><ExternalLink />Abrir</a> : !canEditProject && <span className="lp-muted">Não informado</span>}
                  </div>
                </div>)}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
