import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { CalendarCheck, CircleAlert, Loader2 } from 'lucide-react';
import { registerAttendance } from '../lib/attendance';
import { loadMyProfile } from '../lib/portal';
import { btn, panel } from './PortalUI';

/** Aberta pelo QR code do evento (#presenca/{eventId}/{code}). Registra a presença de quem está logado. */
export default function AttendanceCheckin({ user, eventId, code, onDone }: { user: User; eventId: string; code: string; onDone: () => void }) {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'ok'; title: string; already: boolean } | { kind: 'error'; message: string }>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const profile = await loadMyProfile(user).catch(() => null);
        const name = profile?.name || user.displayName || user.email || 'Membro';
        const result = await registerAttendance(user, eventId, code, name);
        if (active) setState({ kind: 'ok', ...result });
      } catch (err: any) {
        const denied = String(err?.code || err?.message || '').includes('permission');
        if (active) setState({ kind: 'error', message: denied ? 'Este QR code não vale mais ou foi trocado. Peça à diretoria o código atual.' : (err?.message || 'Não consegui registrar a presença.') });
      }
    })();
    return () => { active = false; };
  }, [user, eventId, code]);

  return (
    <div className="w-full max-w-md mx-auto mt-10 text-center">
      <div className={`${panel} p-8 flex flex-col items-center gap-4`}>
        {state.kind === 'loading' && <><Loader2 className="animate-spin text-emerald-400" size={32} /><p className="text-gray-300">Registrando sua presença…</p></>}
        {state.kind === 'ok' && <>
          <CalendarCheck className="text-emerald-400" size={36} />
          <h2 className="text-xl font-bold text-white">{state.already ? 'Presença já registrada' : 'Presença registrada!'}</h2>
          <p className="text-sm text-gray-300">{state.title}</p>
          <p className="text-xs text-gray-500">As horas entram no seu portfólio e na declaração de horas.</p>
          <button className={btn.primary} onClick={onDone}>Ver meu portfólio</button>
        </>}
        {state.kind === 'error' && <>
          <CircleAlert className="text-amber-400" size={36} />
          <h2 className="text-xl font-bold text-white">Não deu certo</h2>
          <p className="text-sm text-gray-300">{state.message}</p>
          <button className={btn.ghost} onClick={onDone}>Voltar ao portal</button>
        </>}
      </div>
    </div>
  );
}
