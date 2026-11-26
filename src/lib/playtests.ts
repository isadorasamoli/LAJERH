/**
 * Playtests.
 *
 *   playtests/{id}           sessão de teste       qualquer um lê (para o formulário abrir sem login); o time cria
 *   playtestFeedback/{auto}  resposta de quem testou  qualquer um envia, enquanto a sessão estiver aberta; só o time lê
 *
 * O formulário público fica em #playtest/{id}.
 */
import { addDoc, collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase';

export interface Playtest {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  buildUrl: string;
  questions: string[];
  open: boolean;
  createdAt: number;
  createdBy: string;
}

export interface PlaytestFeedback {
  id: string;
  playtestId: string;
  projectId: string;
  testerName: string;
  rating: number;
  answers: string[];
  createdAt: number;
}

export const DEFAULT_QUESTIONS = [
  'Onde você travou ou ficou sem saber o que fazer?',
  'Você entendeu o objetivo e as regras? Explique com suas palavras.',
  'O que você mais gostou?',
  'O que você mudaria primeiro?',
];

export const playtestUrl = (id: string) => `${window.location.origin}${window.location.pathname}#playtest/${id}`;

export async function loadProjectPlaytests(projectId: string): Promise<Playtest[]> {
  const snap = await getDocs(query(collection(db, 'playtests'), where('projectId', '==', projectId)));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Playtest, 'id'>) })).sort((a, b) => b.createdAt - a.createdAt);
}

export async function loadPlaytest(id: string): Promise<Playtest | null> {
  const snap = await getDoc(doc(db, 'playtests', id));
  return snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Playtest, 'id'>) } : null;
}

export async function createPlaytest(data: Omit<Playtest, 'id' | 'createdAt' | 'open'>) {
  const ref = await addDoc(collection(db, 'playtests'), { ...data, open: true, createdAt: Date.now() });
  return ref.id;
}

export const setPlaytestOpen = (id: string, open: boolean) => updateDoc(doc(db, 'playtests', id), { open });

export async function loadFeedback(playtestId: string, projectId: string): Promise<PlaytestFeedback[]> {
  const snap = await getDocs(query(collection(db, 'playtestFeedback'), where('playtestId', '==', playtestId), where('projectId', '==', projectId)));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<PlaytestFeedback, 'id'>) })).sort((a, b) => b.createdAt - a.createdAt);
}

export async function sendFeedback(p: Playtest, testerName: string, rating: number, answers: string[]) {
  await addDoc(collection(db, 'playtestFeedback'), {
    playtestId: p.id,
    projectId: p.projectId,
    testerName: testerName.trim().slice(0, 120),
    rating,
    answers: answers.map(a => a.trim().slice(0, 2000)),
    createdAt: Date.now(),
  });
}
