/**
 * Aniversários visíveis para todos os membros.
 *
 * Os cadastros (responses) têm dados pessoais e só a diretoria lê. Por isso os aniversários
 * ficam numa lista à parte, birthdays/{responseId}, só com nome, dia/mês ("DD/MM", sem ano,
 * então a idade não aparece) e função na liga. Quando alguém da diretoria abre o calendário,
 * a lista é atualizada a partir dos cadastros; ex-membros saem dela.
 */
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

export interface PublicBirthday {
  id: string;
  name: string;
  birthday: string; // "DD/MM"
  leagueRole: string;
}

/** "2001-08-15", "15/08/2001", "15-08-2001" -> "15/08". Devolve '' se não reconhecer. */
export function dayMonth(raw: string): string {
  const s = (raw || '').trim();
  let d: number | null = null;
  let m: number | null = null;
  const parts = s.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) { m = Number(parts[1]); d = Number(parts[2]); }
    else { d = Number(parts[0]); m = Number(parts[1]); }
  } else if (parts.length === 2) {
    d = Number(parts[0]); m = Number(parts[1]);
  }
  if (!d || !m || d < 1 || d > 31 || m < 1 || m > 12) return '';
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

export async function loadPublicBirthdays(): Promise<PublicBirthday[]> {
  const snap = await getDocs(collection(db, 'birthdays'));
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<PublicBirthday, 'id'>) }));
}

/** Só diretoria. Grava apenas o que mudou, para não reescrever a lista a cada visita. */
export async function syncPublicBirthdays(members: Array<{ memberId: string; name: string; birthday: string; leagueRole: string }>) {
  const current = new Map((await loadPublicBirthdays()).map(b => [b.id, b]));
  const wanted = new Map<string, Omit<PublicBirthday, 'id'>>();
  members.forEach(m => {
    const birthday = dayMonth(m.birthday);
    if (birthday) wanted.set(m.memberId, { name: (m.name || 'Membro').slice(0, 120), birthday, leagueRole: (m.leagueRole || '').slice(0, 200) });
  });

  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
  wanted.forEach((data, id) => {
    const old = current.get(id);
    if (!old || old.name !== data.name || old.birthday !== data.birthday || old.leagueRole !== data.leagueRole) {
      ops.push(b => b.set(doc(db, 'birthdays', id), { ...data, updatedAt: Date.now() }));
    }
  });
  current.forEach((_, id) => {
    if (!wanted.has(id)) ops.push(b => b.delete(doc(db, 'birthdays', id)));
  });

  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach(op => op(batch));
    await batch.commit();
  }
  return ops.length;
}
