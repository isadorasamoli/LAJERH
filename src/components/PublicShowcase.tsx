import { useEffect, useState } from 'react';
import { ExternalLink, Gamepad2, Image as ImageIcon, Loader2, Play } from 'lucide-react';
import { ShowcaseEntry, loadShowcase } from '../lib/showcase';

/** Página pública (#vitrine): os jogos da LAJE, sem login. */
export default function PublicShowcase() {
  const [games, setGames] = useState<ShowcaseEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    document.title = 'Jogos da LAJE';
    loadShowcase().then(setGames).catch(err => { console.error(err); setError(true); setGames([]); });
    return () => { document.title = 'LAJE RH'; };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--color-bg-dark)] text-[var(--color-ink)] overflow-y-auto">
      <header className="border-b border-[var(--color-ink-faint)] bg-[rgba(12,12,14,0.8)]">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="./laje.png" alt="Logo LAJE" className="w-9 h-9 object-contain" />
            <div>
              <div className="font-bold uppercase tracking-tight">LAJE</div>
              <div className="text-[11px] text-gray-400">Liga Acadêmica de Jogos Eletrônicos · CIn UFPE</div>
            </div>
          </div>
          <a href="#" className="text-xs text-gray-400 hover:text-white underline underline-offset-4">Membros: entrar no portal</a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-10">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Jogos da LAJE</h1>
        <p className="text-gray-400 mt-2 max-w-2xl">Jogos feitos por estudantes do Centro de Informática da UFPE na Liga Acadêmica de Jogos Eletrônicos.</p>

        {games === null ? (
          <div className="flex justify-center py-24"><Loader2 className="animate-spin text-emerald-400" /></div>
        ) : !games.length ? (
          <p className="mt-12 text-gray-400">{error ? 'Não consegui carregar os jogos agora. Tente de novo mais tarde.' : 'Os primeiros jogos chegam em breve.'}</p>
        ) : (
          <div className="grid gap-6 mt-10 sm:grid-cols-2 lg:grid-cols-3">
            {games.map(g => (
              <article key={g.id} className="bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] flex flex-col overflow-hidden">
                <div className="h-44 border-b border-[var(--color-ink-faint)] bg-[radial-gradient(ellipse_at_50%_0%,rgba(16,185,129,0.12),transparent_70%)]">
                  {g.cover ? <img src={g.cover} alt={`Imagem do jogo ${g.name}`} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-gray-600"><ImageIcon size={30} /></div>}
                </div>
                <div className="p-5 flex flex-col gap-3 flex-1">
                  <div>
                    <h2 className="text-lg font-bold text-white">{g.name}</h2>
                    <p className="text-xs text-amber-300/90">{[g.genre, g.engine, g.semester].filter(Boolean).join(' · ')}</p>
                  </div>
                  {g.pitch && <p className="text-sm text-gray-300 leading-relaxed line-clamp-5">{g.pitch}</p>}
                  {g.team.length > 0 && <p className="text-xs text-gray-500">Equipe: {g.team.join(', ')}</p>}
                  <div className="mt-auto flex flex-wrap gap-2 pt-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"><Gamepad2 size={12} />{g.status}</span>
                    {g.itchUrl && <a href={g.itchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold"><ExternalLink size={12} />itch.io</a>}
                    {g.buildUrl && <a href={g.buildUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700"><Play size={12} />Jogar</a>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
