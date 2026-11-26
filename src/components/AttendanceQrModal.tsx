import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Loader2, RefreshCw, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth } from '../lib/firebase';
import { AttendanceRecord, attendanceUrl, getOrCreateAttendanceCode, loadEventAttendance } from '../lib/attendance';
import { btn, mono } from './PortalUI';

/** QR code de presença de um evento (só diretoria) e a lista de quem já registrou. */
export default function AttendanceQrModal({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [qr, setQr] = useState('');
  const [list, setList] = useState<AttendanceRecord[]>([]);
  const [error, setError] = useState('');

  const refresh = () => loadEventAttendance(eventId).then(setList).catch(() => setList([]));

  useEffect(() => {
    let active = true;
    getOrCreateAttendanceCode(eventId, auth.currentUser?.email || '')
      .then(async code => {
        const link = attendanceUrl(eventId, code);
        const image = await QRCode.toDataURL(link, { width: 320, margin: 1, color: { dark: '#0c0c0e', light: '#ffffff' } });
        if (active) { setUrl(link); setQr(image); }
      })
      .catch(err => { console.error(err); if (active) setError('Não consegui gerar o QR code. Confira se as regras do Firestore foram publicadas.'); });
    refresh();
    const timer = window.setInterval(refresh, 15000);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className="w-full max-w-lg max-h-[92vh] overflow-auto bg-[#111113] border border-gray-700 p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Presença no evento</h3>
            <p className="text-xs text-gray-400 mt-1">Mostre este QR code no telão. Cada membro lê com o celular, entra com a conta da LAJE e a presença fica registrada.</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-gray-400 hover:text-white cursor-pointer"><X size={18} /></button>
        </div>

        {error ? <p className="text-sm text-amber-300">{error}</p> : !qr ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-emerald-400" /></div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <img src={qr} alt="QR code de presença" className="w-64 h-64 bg-white p-2" />
            <button className={btn.ghost} onClick={() => navigator.clipboard.writeText(url).then(() => toast.success('Link copiado.'))}>
              <Copy size={13} /> Copiar link de presença
            </button>
          </div>
        )}

        <div className="mt-6 border-t border-gray-800 pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[11px] ${mono} uppercase text-gray-400`}>{list.length} {list.length === 1 ? 'presença' : 'presenças'}</span>
            <button className="text-gray-400 hover:text-white cursor-pointer" onClick={refresh} aria-label="Atualizar lista"><RefreshCw size={14} /></button>
          </div>
          {list.length ? (
            <ul className="text-sm text-gray-200 space-y-1 max-h-48 overflow-auto">
              {list.map(a => <li key={a.id}>{a.name} <span className="text-gray-500 text-xs">{a.email}</span></li>)}
            </ul>
          ) : <p className="text-xs text-gray-500">Ninguém registrou ainda. A lista atualiza sozinha a cada 15 segundos.</p>}
        </div>
      </div>
    </div>
  );
}
