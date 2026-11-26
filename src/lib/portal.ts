/**
 * Dados compartilhados pelas páginas do portal (Meu painel, portfólio, saúde dos projetos...).
 * Tudo lido direto do Firestore; as regras decidem o que cada pessoa pode ver.
 */
import { User } from 'firebase/auth';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from './firebase';
import type { OpeningItem, ProjectItem, TaskItem } from './projects';

export interface MemberProfile {
  name: string;
  email: string;
  leagueRole: string;
  roleFocus: string;
  currentProjects: string;
  course: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  duration: string;
}

export const norm = (s?: string | null) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const sameEmail = (a?: string | null, b?: string | null) => !!a && !!b && norm(a) === norm(b);

/**
 * Cadastro (Formulário RH) da pessoa logada.
 * Procura pelo e-mail primeiro: quando a diretoria cadastra alguém pelo painel, o documento
 * fica com o userId de quem cadastrou, então o userId sozinho pode apontar para outra pessoa.
 * Pelo userId, só vale se o e-mail do cadastro estiver vazio ou for o mesmo do login.
 */
export async function loadMyProfile(user: User): Promise<MemberProfile | null> {
  const email = user.email || '';
  const tries = [
    ...(email ? [query(collection(db, 'responses'), where('email', '==', email))] : []),
    ...(email && email !== email.toLowerCase() ? [query(collection(db, 'responses'), where('email', '==', email.toLowerCase()))] : []),
    query(collection(db, 'responses'), where('userId', '==', user.uid)),
  ];
  for (const q of tries) {
    try {
      const snap = await getDocs(q);
      const match = snap.docs.find(d => !d.data().email || sameEmail(d.data().email, email));
      if (match) {
        const d = match.data();
        return {
          name: d.name || user.displayName || '',
          email: d.email || user.email || '',
          leagueRole: d.leagueRole || '',
          roleFocus: d.roleFocus || '',
          currentProjects: d.currentProjects || '',
          course: d.course || '',
        };
      }
    } catch {
      // segue para a próxima tentativa
    }
  }
  return null;
}

export async function loadProjects(): Promise<ProjectItem[]> {
  const snap = await getDocs(query(collection(db, 'projects'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as ProjectItem) }));
}

export async function loadTasks(): Promise<TaskItem[]> {
  const snap = await getDocs(query(collection(db, 'tasks'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as TaskItem) }));
}

export async function loadOpenings(): Promise<OpeningItem[]> {
  const snap = await getDocs(query(collection(db, 'openings'), orderBy('openedAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as OpeningItem) }));
}

export async function loadEvents(): Promise<CalendarEvent[]> {
  const snap = await getDocs(query(collection(db, 'events'), orderBy('date', 'asc')));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<CalendarEvent, 'id'>) }));
}

/** Nomes do campo teamMembers ("Ana (Programação), Bia (Arte)") sem a função entre parênteses. */
export const teamNames = (teamMembers?: string, leader?: string) => {
  const seen = new Set<string>();
  return [leader || '', ...(teamMembers || '').split(/[,;\n]/)]
    .map(raw => raw.replace(/\([^)]*\)\s*$/, '').trim())
    .filter(name => {
      const key = norm(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

/** A pessoa faz parte do projeto? Confere conta (uid) e, para projetos antigos, o nome. */
export function isInProject(project: ProjectItem, user: User, profileName?: string) {
  if (project.leaderUid === user.uid || project.responsibleDirectorUid === user.uid) return true;
  if (project.teamMemberUids?.includes(user.uid)) return true;
  const names = teamNames(project.teamMembers, project.leader).map(norm);
  return [profileName, user.displayName].filter(Boolean).some(n => names.includes(norm(n)));
}

export const daysSince = (value?: string | number) => {
  if (!value) return null;
  const t = typeof value === 'number' ? value : new Date(value.length === 10 ? `${value}T12:00:00` : value).getTime();
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86_400_000);
};

export const fmtDate = (value?: string | number, withTime = false) => {
  if (!value) return '';
  const d = typeof value === 'number' ? new Date(value) : new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', withTime
    ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/** "2 horas", "1h30", "90 min" -> horas (número). Sem número reconhecível, conta 1 hora. */
export function durationHours(duration?: string) {
  const s = norm(duration);
  const h = /(\d+(?:[.,]\d+)?)\s*h/.exec(s);
  const m = /(\d+)\s*min/.exec(s);
  const hm = /(\d+)\s*h\s*(\d+)/.exec(s);
  if (hm) return Number(hm[1]) + Number(hm[2]) / 60;
  if (h) return Number(h[1].replace(',', '.'));
  if (m) return Number(m[1]) / 60;
  const n = /(\d+(?:[.,]\d+)?)/.exec(s);
  return n ? Number(n[1].replace(',', '.')) : 1;
}

export const isDone = (t: TaskItem) => t.status === 'entregue' || t.boardStatus === 'done';
export const isMine = (t: TaskItem, user: User) => sameEmail(t.claimedByEmail, user.email);
