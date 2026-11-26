/**
 * Dados e permissões da página de projeto.
 *
 * Os dados ficam no documento do projeto (`projects/{id}`) e em três subcoleções:
 *   projects/{id}/boardTasks   tarefas internas do time (quadro e por entrega)
 *   projects/{id}/deliveries   entregas / marcos
 *   projects/{id}/checkins     devlog e check-in quinzenal
 *
 * Quem pode o quê é garantido pelas regras do Firestore (firestore.rules).
 * As funções de papel aqui só decidem o que a tela mostra.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import type { ProjectItem } from './projects';

export type ProjectRole = 'member' | 'team' | 'leader' | 'director';

export const AREAS = ['Game design', 'Narrativa', 'Programação', 'Arte', 'Sound design', 'Level design', 'Testes e produção'];
export const BOARD_COLUMNS = ['A fazer', 'Fazendo', 'Feito'] as const;
export type BoardStatus = (typeof BOARD_COLUMNS)[number];
export const PRIORITIES = ['Crítica', 'Importante', 'Polish'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const DOC_TYPES = ['Roteiro', 'Referência', 'Planilha', 'Outro'];

export interface ProjectLinks {
  boards?: string;
  drive?: string;
}

export interface ProjectDocLink {
  name: string;
  url: string;
  type: string;
}

export interface BoardTask {
  id?: string;
  title: string;
  area: string;
  priority: Priority;
  status: BoardStatus;
  owners: string[];
  ownerEmails: string[];
  deliveryId: string;
  createdAt: number;
  createdBy: string;
}

export interface Delivery {
  id?: string;
  name: string;
  due: string; // AAAA-MM-DD
  createdAt: number;
}

export interface CheckIn {
  id?: string;
  date: string; // AAAA-MM-DD
  author: string;
  authorEmail: string;
  done: string;
  blocked: string;
  needsPeople: string;
  createdAt: number;
}

/** Campos novos do projeto. Todos opcionais, então os projetos antigos continuam válidos. */
export interface ProjectPageFields {
  leaderEmail?: string;
  teamEmails?: string[];
  gddUrl?: string;
  gddTemplate?: string;
  links?: ProjectLinks;
  docs?: ProjectDocLink[];
}

export type FullProject = ProjectItem & ProjectPageFields;

export const normEmail = (e?: string | null) => (e || '').trim().toLowerCase();

export function getProjectRole(project: FullProject, email: string, isAdmin: boolean): ProjectRole {
  const me = normEmail(email);
  if (isAdmin) return 'director';
  if (me && normEmail(project.leaderEmail) === me) return 'leader';
  if (me && (project.teamEmails || []).map(normEmail).includes(me)) return 'team';
  return 'member';
}

export const isProductionRole = (r: ProjectRole) => r !== 'member';
export const canEditProject = (r: ProjectRole) => r === 'leader' || r === 'director';

/** "Ana, João Pedro e Rennan" -> ["Ana", "João Pedro", "Rennan"] */
export function splitNames(s?: string): string[] {
  return (s || '')
    .split(/[,;\n]|\se\s/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export interface TeamMember {
  name: string;
  roles: string[];
}

/**
 * "Ana (Programação), Bianca (Arte), Ana (Game Design)" -> [{ Ana, [Programação, Game Design] }, { Bianca, [Arte] }]
 * O líder entra primeiro e não se repete.
 */
export function parseTeam(teamMembers?: string, leader?: string): TeamMember[] {
  const out: TeamMember[] = [];
  const add = (raw: string) => {
    const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(raw.trim());
    const name = (m ? m[1] : raw).trim();
    const roles = m ? m[2].split(/[\/,]/).map((r) => r.trim()).filter(Boolean) : [];
    if (!name) return;
    const key = name.toLowerCase();
    const found = out.find((x) => x.name.toLowerCase() === key);
    if (found) roles.forEach((r) => !found.roles.includes(r) && found.roles.push(r));
    else out.push({ name, roles });
  };
  if (leader) add(leader);
  (teamMembers || '').split(/[,;\n]/).forEach(add);
  return out;
}

/** Linhas do tipo "Nome - texto" ou "Nome: texto" viram itens com título. */
export function splitItems(s?: string): { name: string; text: string }[] {
  return (s || '')
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^([^:\-–—]{2,48}?)\s*[:\-–—]\s+(.+)$/.exec(l);
      return m ? { name: m[1].trim(), text: m[2].trim() } : { name: '', text: l };
    });
}

export const daysSince = (isoDate: string) =>
  Math.floor((Date.now() - new Date(isoDate + (isoDate.length === 10 ? 'T12:00:00' : '')).getTime()) / 86400000);

export const fmtDay = (isoDate?: string) =>
  isoDate ? new Date(isoDate + (isoDate.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '';

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function docIdFromUrl(url: string): string | null {
  const m = /\/document\/d\/([a-zA-Z0-9_-]+)/.exec(url || '');
  return m ? m[1] : null;
}

/**
 * Link "fazer uma cópia" do Google Docs. Não precisa de servidor: o líder faz a cópia
 * no próprio Drive e depois cola o link na página.
 * IDs dos modelos vêm de VITE_GDD_TEMPLATE_PITCH, VITE_GDD_TEMPLATE_COMPLETO e VITE_DOC_TEMPLATE_ROTEIRO.
 */
export function templateCopyUrl(kind: 'pitch' | 'completo' | 'roteiro'): string | null {
  const env = (import.meta as any).env || {};
  const id = { pitch: env.VITE_GDD_TEMPLATE_PITCH, completo: env.VITE_GDD_TEMPLATE_COMPLETO, roteiro: env.VITE_DOC_TEMPLATE_ROTEIRO }[kind];
  return id ? `https://docs.google.com/document/d/${id}/copy` : null;
}

/* ---------- Firestore ---------- */

const sub = (projectId: string, name: string) => collection(db, 'projects', projectId, name);

/**
 * Carrega as subcoleções de forma independente: se uma falhar (por exemplo, sem permissão),
 * as outras continuam aparecendo. `failed` lista o que não carregou.
 */
export async function loadProjectData(projectId: string, includePrivate: boolean) {
  const [c, t, d] = await Promise.allSettled([
    getDocs(query(sub(projectId, 'checkins'), orderBy('createdAt', 'desc'))),
    includePrivate ? getDocs(query(sub(projectId, 'boardTasks'), orderBy('createdAt', 'asc'))) : Promise.resolve(null),
    includePrivate ? getDocs(query(sub(projectId, 'deliveries'), orderBy('due', 'asc'))) : Promise.resolve(null),
  ]);
  const failed: string[] = [];
  const rows = <T,>(r: PromiseSettledResult<any>, label: string): T[] => {
    if (r.status === 'rejected') {
      console.error(`Erro ao carregar ${label}:`, r.reason);
      failed.push(label);
      return [];
    }
    return r.value ? r.value.docs.map((x: any) => ({ id: x.id, ...x.data() })) : [];
  };
  return {
    checkins: rows<CheckIn>(c, 'devlog'),
    boardTasks: rows<BoardTask>(t, 'tarefas'),
    deliveries: rows<Delivery>(d, 'entregas'),
    failed,
  };
}

export const updateProject = (projectId: string, data: Partial<FullProject>) =>
  updateDoc(doc(db, 'projects', projectId), data as any);

export const addBoardTask = (projectId: string, t: Omit<BoardTask, 'id'>) => addDoc(sub(projectId, 'boardTasks'), t);
export const updateBoardTask = (projectId: string, taskId: string, data: Partial<BoardTask>) =>
  updateDoc(doc(db, 'projects', projectId, 'boardTasks', taskId), data as any);
export const deleteBoardTask = (projectId: string, taskId: string) => deleteDoc(doc(db, 'projects', projectId, 'boardTasks', taskId));

export const addDelivery = (projectId: string, d: Omit<Delivery, 'id'>) => addDoc(sub(projectId, 'deliveries'), d);
export const addCheckIn = (projectId: string, c: Omit<CheckIn, 'id'>) => addDoc(sub(projectId, 'checkins'), c);
