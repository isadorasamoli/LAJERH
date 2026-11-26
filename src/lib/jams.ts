/**
 * Game jams internas.
 *
 *   jams/{id}                 a jam (tema, datas, fase)        diretoria cria e muda a fase
 *   jamTeams/{id}             time inscrito e jogo enviado     qualquer membro cria; dono edita; outros só entram/saem
 *   jamVotes/{jamId}_{uid}    um voto por pessoa por jam       só durante a votação
 */
import { User } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase';

export type JamPhase = 'inscricoes' | 'andamento' | 'votacao' | 'encerrada';
export const PHASES: Array<{ id: JamPhase; label: string }> = [
  { id: 'inscricoes', label: 'Inscrições abertas' },
  { id: 'andamento', label: 'Em andamento' },
  { id: 'votacao', label: 'Votação' },
  { id: 'encerrada', label: 'Encerrada' },
];

export interface Jam {
  id: string;
  title: string;
  theme: string;
  description: string;
  startsAt: string;
  endsAt: string;
  phase: JamPhase;
  createdAt: number;
}

export interface JamTeam {
  id: string;
  jamId: string;
  name: string;
  members: string[];
  memberEmails: string[];
  ownerUid: string;
  gameTitle: string;
  gameUrl: string;
  createdAt: number;
}

export interface JamVote { id: string; jamId: string; uid: string; teamId: string }

export async function loadJams(): Promise<Jam[]> {
  const snap = await getDocs(query(collection(db, 'jams'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Jam, 'id'>) }));
}

export const createJam = (data: Omit<Jam, 'id' | 'createdAt' | 'phase'>) =>
  addDoc(collection(db, 'jams'), { ...data, phase: 'inscricoes', createdAt: Date.now() });

export const setJamPhase = (id: string, phase: JamPhase) => updateDoc(doc(db, 'jams', id), { phase });

export async function loadTeams(jamId: string): Promise<JamTeam[]> {
  const snap = await getDocs(query(collection(db, 'jamTeams'), where('jamId', '==', jamId)));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<JamTeam, 'id'>) })).sort((a, b) => a.createdAt - b.createdAt);
}

export const createTeam = (user: User, myName: string, jamId: string, name: string) =>
  addDoc(collection(db, 'jamTeams'), {
    jamId, name, members: [myName], memberEmails: [(user.email || '').toLowerCase()],
    ownerUid: user.uid, gameTitle: '', gameUrl: '', createdAt: Date.now(),
  });

export const updateTeam = (id: string, data: Partial<JamTeam>) => updateDoc(doc(db, 'jamTeams', id), data as any);
export const deleteTeam = (id: string) => deleteDoc(doc(db, 'jamTeams', id));

export async function loadVotes(jamId: string): Promise<JamVote[]> {
  const snap = await getDocs(query(collection(db, 'jamVotes'), where('jamId', '==', jamId)));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<JamVote, 'id'>) }));
}

export const castVote = (user: User, jamId: string, teamId: string) =>
  setDoc(doc(db, 'jamVotes', `${jamId}_${user.uid}`), { jamId, uid: user.uid, teamId, createdAt: Date.now() });
