import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, Star } from 'lucide-react';
import { Playtest, loadPlaytest, sendFeedback } from '../lib/playtests';

/** Formulário público de playtest (#playtest/{id}). Abre sem login. */
export default function PlaytestFeedbackForm({ playtestId }: { playtestId: string }) {
  const [playtest, setPlaytest] = useState<Playtest | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [rating, setRating] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadPlaytest(playtestId).then(p => { setPlaytest(p); setAnswers(p ? p.questions.map(() => '') : []); }).catch(() => setPlaytest(null));
  }, [playtestId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!playtest) return;
    if (!rating) { setError('Dê uma nota de 1 a 5 estrelas.'); return; }
    if (!answers.some(a => a.trim())) { setError('Responda pelo menos uma pergunta.'); return; }
    try {
      setSending(true);
      setError('');
      await sendFeedback(playtest, name, rating, answers);
      setSent(true);
    } catch (err) {
      console.error(err);
      setError('Não consegui enviar. A sessão pode ter sido encerrada.');
    } finally {
      setSending(false);
    }
  };

  const field = 'w-full bg-[#0f0f11] border border-[var(--color-ink-faint)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-accent)]';

  return (
    <div className="min-h-screen bg-[var(--color-bg-dark)] text-[var(--color-ink)] overflow-y-auto">
      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-8">
          <img src="./laje.png" alt="Logo LAJE" className="w-9 h-9 object-contain" />
          <span className="text-sm text-gray-400">Playtest · LAJE</span>
        </div>

        {playtest === undefined ? <div className="flex justify-center py-24"><Loader2 className="animate-spin text-emerald-400" /></div>
          : !playtest ? <p className="text-gray-300">Este link de playtest não existe ou foi apagado.</p>
          : sent ? (
            <div className="text-center py-16">
              <CheckCircle2 className="mx-auto text-emerald-400" size={40} />
              <h1 className="text-2xl font-bold mt-4">Obrigado por testar!</h1>
              <p className="text-gray-400 mt-2">Suas respostas foram para o time de {playtest.projectName}.</p>
            </div>
          ) : !playtest.open ? (
            <p className="text-gray-300">Esta sessão de playtest de {playtest.projectName} já foi encerrada. Obrigado pelo interesse!</p>
          ) : (
            <form onSubmit={e => void submit(e)} className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold">{playtest.projectName}</h1>
                <p className="text-gray-400 mt-1">{playtest.title}</p>
                {playtest.buildUrl && <a href={playtest.buildUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-4 px-3 py-1.5 text-sm bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold"><ExternalLink size={14} />Abrir o jogo</a>}
              </div>
              <label className="block">
                <span className="block text-xs uppercase text-gray-400 mb-1.5">Seu nome (opcional)</span>
                <input className={field} value={name} onChange={e => setName(e.target.value)} maxLength={120} />
              </label>
              <fieldset>
                <legend className="text-xs uppercase text-gray-400 mb-2">Nota geral</legend>
                <div className="flex gap-1" role="radiogroup" aria-label="Nota de 1 a 5">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} estrela${n > 1 ? 's' : ''}`} onClick={() => setRating(n)} className="p-1 cursor-pointer">
                      <Star size={28} className={n <= rating ? 'fill-amber-400 text-amber-400' : 'text-gray-600'} />
                    </button>
                  ))}
                </div>
              </fieldset>
              {playtest.questions.map((q, i) => (
                <label key={i} className="block">
                  <span className="block text-sm text-gray-200 mb-1.5">{q}</span>
                  <textarea className={`${field} h-24 resize-y`} maxLength={2000} value={answers[i] || ''} onChange={e => setAnswers(prev => prev.map((a, j) => j === i ? e.target.value : a))} />
                </label>
              ))}
              {error && <p className="text-sm text-amber-300" role="alert">{error}</p>}
              <button type="submit" disabled={sending} className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold disabled:opacity-60 cursor-pointer">{sending ? 'Enviando…' : 'Enviar respostas'}</button>
            </form>
          )}
      </div>
    </div>
  );
}
