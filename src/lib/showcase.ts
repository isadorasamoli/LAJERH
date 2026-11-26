/**
 * Vitrine pública dos jogos (#vitrine, sem login).
 *
 * Fica numa coleção à parte, showcase/{projectId}, só com o que pode ser público.
 * O líder publica e atualiza pela página do projeto. Nada do documento do projeto
 * (contatos, tarefas, devlog) fica aberto.
 */
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { ProjectItem } from './projects';
import { teamNames } from './portal';

export interface ShowcaseEntry {
  id: string;
  name: string;
  genre: string;
  engine: string;
  status: string;
  semester: string;
  pitch: string;
  cover: string;
  itchUrl: string;
  buildUrl: string;
  team: string[];
  updatedAt: number;
}

const safeUrl = (u?: string) => {
  try {
    const url = new URL(u || '');
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
};

export async function loadShowcase(): Promise<ShowcaseEntry[]> {
  const snap = await getDocs(collection(db, 'showcase'));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<ShowcaseEntry, 'id'>) }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function isInShowcase(projectId: string) {
  const snap = await getDoc(doc(db, 'showcase', projectId));
  return snap.exists();
}

export async function publishToShowcase(project: ProjectItem, cover: string) {
  if (!project.id) throw new Error('Projeto sem identificador.');
  const entry: Omit<ShowcaseEntry, 'id'> = {
    name: project.name,
    genre: project.genre || '',
    engine: project.engine || '',
    status: project.status || '',
    semester: project.semester || '',
    pitch: (project.elevatorPitch || project.description || '').slice(0, 1200),
    cover: cover || '',
    itchUrl: safeUrl(project.itchUrl),
    buildUrl: safeUrl(project.buildUrl),
    team: teamNames(project.teamMembers, project.leader).slice(0, 40),
    updatedAt: Date.now(),
  };
  await setDoc(doc(db, 'showcase', project.id), entry);
}

export async function removeFromShowcase(projectId: string) {
  await deleteDoc(doc(db, 'showcase', projectId));
}
