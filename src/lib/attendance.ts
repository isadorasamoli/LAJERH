/**
 * Presença em eventos por QR code.
 *
 *   eventAttendanceCodes/{eventId}  { code }      só a diretoria lê e escreve
 *   attendance/{eventId}_{uid}      presença      a pessoa cria a própria, com o código certo
 *
 * O QR code aponta para #presenca/{eventId}/{code}. A regra do Firestore confere o código.
 * As horas do certificado vêm sempre da duração do evento no calendário, não do registro.
 */
import { User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';

export interface AttendanceRecord {
  id: string;
  eventId: string;
  uid: string;
  email: string;
  name: string;
  eventTitle: string;
  eventDate: string;
  createdAt: number;
}

const randomCode = () => {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 16);
};

/** Devolve o código do evento, criando um se ainda não existir (só diretoria). */
export async function getOrCreateAttendanceCode(eventId: string, createdBy: string) {
  const ref = doc(db, 'eventAttendanceCodes', eventId);
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data().code) return String(snap.data().code);
  const code = randomCode();
  await setDoc(ref, { code, createdAt: Date.now(), createdBy });
  return code;
}

export const attendanceUrl = (eventId: string, code: string) =>
  `${window.location.origin}${window.location.pathname}#presenca/${eventId}/${code}`;

export async function registerAttendance(user: User, eventId: string, code: string, name: string) {
  const event = await getDoc(doc(db, 'events', eventId));
  if (!event.exists()) throw new Error('Evento não encontrado. O QR code pode ser de um evento apagado.');
  const data = event.data();
  const id = `${eventId}_${user.uid}`;
  const existing = await getDoc(doc(db, 'attendance', id)).catch(() => null);
  if (existing?.exists()) return { title: String(data.title || 'Evento'), already: true };
  await setDoc(doc(db, 'attendance', id), {
    eventId,
    uid: user.uid,
    email: (user.email || '').toLowerCase(),
    name,
    eventTitle: String(data.title || 'Evento'),
    eventDate: String(data.date || ''),
    code,
    createdAt: Date.now(),
  });
  return { title: String(data.title || 'Evento'), already: false };
}

export async function loadMyAttendance(user: User): Promise<AttendanceRecord[]> {
  const snap = await getDocs(query(collection(db, 'attendance'), where('uid', '==', user.uid)));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<AttendanceRecord, 'id'>) }))
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
}

export async function loadEventAttendance(eventId: string): Promise<AttendanceRecord[]> {
  const snap = await getDocs(query(collection(db, 'attendance'), where('eventId', '==', eventId)));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<AttendanceRecord, 'id'>) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
