import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { db } from './firebase';
import { handleFirestoreError, OperationType } from './utils';
import { logAuditAction } from './audit';

export interface ProjectItem {
  id?: string;
  name: string;
  status: 'ideia' | 'em análise' | 'aprovado' | 'em produção' | 'em andamento' | 'pausado' | 'concluído' | 'cancelado' | string;
  engine: string;
  genre: string;
  leader: string;
  leaderUid?: string;
  leaderDiscord?: string;
  responsibleDirector?: string;
  responsibleDirectorUid?: string;
  teamMemberUids?: string[];
  semester?: string;
  description: string;
  elevatorPitch?: string;
  diferencial?: string;
  pilares?: string;
  targetScope?: string;
  lastCheckInDate?: string;
  lastCheckInNotes?: string;
  repositoryUrl?: string;
  boardsUrl?: string;
  driveUrl?: string;
  buildUrl?: string;
  itchUrl?: string;
  gddUrl?: string;
  gddDocumentId?: string;
  scriptUrl?: string;
  scriptDocumentId?: string;
  files?: ProjectFileItem[];
  devlogs?: ProjectDevlogItem[];
  teamMembers?: string;
  coverEmoji?: string;
  createdAt: number;
}

export interface ProjectFileItem {
  id: string;
  name: string;
  url: string;
  type?: string;
  createdAt: number;
}

export interface ProjectDevlogItem {
  id: string;
  date: string;
  author: string;
  title: string;
  summary: string;
  nextSteps?: string;
  blockers?: string;
  createdAt: number;
}

export interface OpeningItem {
  id?: string;
  role: string;
  projectId: string;
  projectName: string;
  description: string;
  acceptsBeginners: boolean;
  estimatedTime: 'pouco' | 'médio' | 'bastante' | string;
  status: 'aberta' | 'preenchida' | 'cancelada';
  openedAt: number;
  filledBy?: string;
}

export interface TaskItem {
  id?: string;
  title: string;
  projectId: string;
  projectName: string;
  area: 'arte' | 'código' | 'áudio' | 'narrativa' | 'testes' | 'divulgação' | string;
  deliverySpecs: string;
  size: 'pequena' | 'média' | 'grande';
  beginnerFriendly: boolean;
  deadline?: string;
  referenceUrl?: string;
  helper?: string;
  status: 'aberta' | 'pegaram' | 'entregue' | 'cancelada';
  claimedBy?: string;
  claimedByEmail?: string;
  claimedAt?: number;
  deliveredAt?: number;
  boardStatus?: 'todo' | 'doing' | 'done';
  priority?: 'baixa' | 'media' | 'alta' | 'bloqueadora';
  delivery?: string;
  createdAt: number;
}

export interface ProposalItem {
  id?: string;
  proposerName: string;
  proposerDiscord: string;
  proposerEmail: string;
  proposerUid?: string;
  projectTitle: string;
  oneSentencePitch: string;
  genreAndReferences: string;
  differentiation: string;
  engine: string;
  projectScopeAndDeadline: string;
  teamAndNeeds: string;
  visualAttachmentsUrl?: string;
  status: 'recebido' | 'em análise' | 'aprovado' | 'aprovado com escopo menor' | 'precisa de ajustes' | 'não aprovado';
  boardFeedback?: string;
  respondedAt?: number;
  createdAt: number;
}

export const INITIAL_PROJECTS: Omit<ProjectItem, 'id'>[] = [];
export const INITIAL_OPENINGS: Omit<OpeningItem, 'id'>[] = [];
export const INITIAL_TASKS: Omit<TaskItem, 'id'>[] = [];

export async function ensureProjectsSeeded() {
  return;
}

// Helper to wipe all seeded projects, openings and tasks from Firestore
export async function clearAllProjectsAndOpenings() {
  try {
    const [projSnap, openSnap, taskSnap] = await Promise.all([
      getDocs(collection(db, 'projects')),
      getDocs(collection(db, 'openings')),
      getDocs(collection(db, 'tasks'))
    ]);

    await Promise.all([
      ...projSnap.docs.map(d => deleteDoc(doc(db, 'projects', d.id))),
      ...openSnap.docs.map(d => deleteDoc(doc(db, 'openings', d.id))),
      ...taskSnap.docs.map(d => deleteDoc(doc(db, 'tasks', d.id)))
    ]);
    return true;
  } catch (err) {
    console.error('Error clearing projects and openings:', err);
    throw err;
  }
}
