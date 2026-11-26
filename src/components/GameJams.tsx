import { FormEvent, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { ExternalLink, Plus, Trophy, Users, Vote } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  Jam, JamPhase, JamTeam, JamVote, PHASES, castVote, createJam, createTeam, deleteTeam,
  loadJams, loadTeams, loadVotes, setJamPhase, updateTeam,
} from '../lib/jams';
import { fmtDate, loadMyProfile, sameEmail } from '../lib/portal';
import { Empty, Field, Loading, PageHeader, SectionTitle, btn, chip, chipColor, input, panel } from './PortalUI';

const phaseLabel = (p: JamPhase) => PHASES.find(x => x.id === p)?.label || p;
const phaseColor: Record<JamPhase, string> = { inscricoes: chipColor.green, andamento: chipColor.amber, votacao: chipColor.purple, encerrada: chipColor.gray };

export default function GameJams({ user, isAdmin }: { user: User; isAdmin: boolean }) {
  const [jams, setJams] = useState<Jam[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', theme: '', description: '', startsAt: '', endsAt: '' });
  const [myName, setMyName] = useState(user.displayName || user.email?.split('@')[0] || 'Membro');

  const reload = () => loadJams().then(list => { setJams(list); if (!selected && list[0]) setSelected(list[0].id); }).catch(() => setJams([]));
  useEffect(() => {
    reload();
    loadMyProfile(user).then(p => p?.name && setMyName(p.name)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const ref = await createJam({ ...form, title: form.title.trim(), theme: form.theme.trim(), description: form.description.trim() });
      toast.success('Jam criada com inscrições abertas.');
      setCreating(false);
      setForm({ title: '', theme: '', description: '', startsAt: '', endsAt: '' });
      setSelected(ref.id);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível criar a jam.');
    }
  };

  if (!jams) return <Loading />;
  const jam = jams.find(j => j.id === selected) || null;

  return (
    <div className="w-full max-w-5xl mx-auto pb-16 text-left">
      <PageHeader
        icon={<Trophy size={26} />}
        title="Game jams"
        subtitle="Jams internas da LAJE: inscrição de times, envio dos jogos e votação"
        actions={isAdmin && !creating ? <button className={btn.primary} onClick={() => setCreating(true)}><Plus size={13} /> Nova jam</button> : undefined}
      />

      {creating && (
        <form onSubmit={e => void submit(e)} className={`${panel} border-l-4 border-l-emerald-500 p-5 mb-8 grid gap-4`}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome da jam"><input className={input} required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex.: LAJE Jam de Inverno" /></Field>
            <Field label="Tema" hint="Pode revelar só no início da jam."><input className={input} value={form.theme} onChange={e => setForm({ ...form, theme: e.target.value })} /></Field>
            <Field label="Começa em"><input className={input} type="date" required value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} /></Field>
            <Field label="Termina em"><input className={input} type="date" required value={form.endsAt} onChange={e => setForm({ ...form, endsAt: e.target.value })} /></Field>
          </div>
          <Field label="Regras e informações"><textarea className={`${input} h-24 resize-y`} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Tamanho dos times, engines permitidas, como entregar..." /></Field>
          <div className="flex gap-2"><button className={btn.primary} type="submit">Criar jam</button><button className={btn.ghost} type="button" onClick={() => setCreating(false)}>Cancelar</button></div>
        </form>
      )}

      {!jams.length ? <Empty>{isAdmin ? 'Nenhuma jam ainda. Crie a primeira.' : 'Nenhuma jam marcada ainda. Fique de olho!'}</Empty> : (
        <>
          <div className="flex flex-wrap gap-2 mb-8">
            {jams.map(j => (
              <button key={j.id} onClick={() => setSelected(j.id)} className={`${selected === j.id ? btn.soft : btn.ghost}`}>
                {j.title} <span className={`${chip} ${phaseColor[j.phase]} ml-1`}>{phaseLabel(j.phase)}</span>
              </button>
            ))}
          </div>
          {jam && <JamDetail key={jam.id} jam={jam} user={user} myName={myName} isAdmin={isAdmin} onChanged={reload} />}
        </>
      )}
    </div>
  );
}

function JamDetail({ jam, user, myName, isAdmin, onChanged }: { jam: Jam; user: User; myName: string; isAdmin: boolean; onChanged: () => void }) {
  const [teams, setTeams] = useState<JamTeam[]>([]);
  const [votes, setVotes] = useState<JamVote[]>([]);
  const [teamName, setTeamName] = useState('');

  const reload = () => {
    loadTeams(jam.id).then(setTeams).catch(() => setTeams([]));
    loadVotes(jam.id).then(setVotes).catch(() => setVotes([]));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [jam.id]);

  const myTeam = teams.find(t => t.memberEmails.some(e => sameEmail(e, user.email)));
  const myVote = votes.find(v => v.uid === user.uid);
  const canJoin = jam.phase === 'inscricoes' || jam.phase === 'andamento';
  const showResults = jam.phase === 'encerrada' || isAdmin;
  const tally = (id: string) => votes.filter(v => v.teamId === id).length;
  const ranked = [...teams].sort((a, b) => tally(b.id) - tally(a.id));

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); reload(); } catch (err) { toast.error(err instanceof Error ? err.message : 'Não deu certo.'); }
  };

  return (
    <div className="space-y-10">
      <section className={`${panel} p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-white">{jam.title}</h3>
            <p className="text-xs text-gray-400 mt-1">{fmtDate(jam.startsAt)} a {fmtDate(jam.endsAt)}</p>
          </div>
          {isAdmin ? (
            <select aria-label="Fase da jam" value={jam.phase} onChange={e => setJamPhase(jam.id, e.target.value as JamPhase).then(onChanged)} className="bg-[#161619] border border-[var(--color-ink-faint)] py-1.5 px-2 text-xs text-gray-200">
              {PHASES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          ) : <span className={`${chip} ${phaseColor[jam.phase]}`}>{phaseLabel(jam.phase)}</span>}
        </div>
        {jam.theme && jam.phase !== 'inscricoes' && <p className="mt-4 text-lg"><span className="text-gray-400 text-sm">Tema: </span><b className="text-emerald-300">{jam.theme}</b></p>}
        {jam.theme && jam.phase === 'inscricoes' && <p className="mt-4 text-sm text-gray-400">O tema é revelado quando a jam começar.</p>}
        {jam.description && <p className="mt-3 text-sm text-gray-300 whitespace-pre-line">{jam.description}</p>}
      </section>

      <section>
        <SectionTitle title={`Times (${teams.length})`} subtitle={canJoin ? 'Crie um time ou entre num existente. Cada pessoa fica em um time.' : undefined} />
        {canJoin && !myTeam && (
          <form onSubmit={e => { e.preventDefault(); if (teamName.trim()) void run(() => createTeam(user, myName, jam.id, teamName.trim()), 'Time criado.').then(() => setTeamName('')); }} className="flex flex-wrap gap-2 mb-4">
            <input className={`${input} max-w-xs`} value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="Nome do seu time" required />
            <button className={btn.primary} type="submit"><Plus size={13} /> Criar time</button>
          </form>
        )}
        {teams.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {(showResults && jam.phase === 'encerrada' ? ranked : teams).map((t, i) => {
              const mine = myTeam?.id === t.id;
              const owner = t.ownerUid === user.uid;
              return (
                <article key={t.id} className={`${panel} p-5 flex flex-col gap-3 ${mine ? 'border-emerald-500/40' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-white">{jam.phase === 'encerrada' && i < 3 ? ['🥇 ', '🥈 ', '🥉 '][i] : ''}{t.name}</h4>
                      <p className="text-xs text-gray-500 flex items-center gap-1"><Users size={12} /> {t.members.join(', ')}</p>
                    </div>
                    {showResults && <span className={`${chip} ${chipColor.purple}`}>{tally(t.id)} {tally(t.id) === 1 ? 'voto' : 'votos'}</span>}
                  </div>
                  {t.gameUrl ? (
                    <a className={`${btn.soft} self-start`} href={t.gameUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> {t.gameTitle || 'Jogar'}</a>
                  ) : <p className="text-xs text-gray-500">Jogo ainda não enviado.</p>}

                  {owner && jam.phase !== 'encerrada' && <SubmitGame team={t} onSave={data => run(() => updateTeam(t.id, data), 'Jogo salvo.')} />}

                  <div className="flex flex-wrap gap-2">
                    {canJoin && !myTeam && <button className={btn.ghost} onClick={() => void run(() => updateTeam(t.id, { members: [...t.members, myName], memberEmails: [...t.memberEmails, (user.email || '').toLowerCase()] }), 'Você entrou no time.')}>Entrar no time</button>}
                    {canJoin && mine && !owner && <button className={btn.ghost} onClick={() => void run(() => updateTeam(t.id, { members: t.members.filter((_, j) => !sameEmail(t.memberEmails[j], user.email)), memberEmails: t.memberEmails.filter(e => !sameEmail(e, user.email)) }), 'Você saiu do time.')}>Sair do time</button>}
                    {(owner || isAdmin) && jam.phase !== 'encerrada' && <button className={btn.danger} onClick={() => void run(() => deleteTeam(t.id), 'Time removido.')}>Apagar time</button>}
                    {jam.phase === 'votacao' && !mine && t.gameUrl && (
                      <button className={myVote?.teamId === t.id ? btn.primary : btn.ghost} onClick={() => void run(() => castVote(user, jam.id, t.id), 'Voto registrado.')}>
                        <Vote size={13} /> {myVote?.teamId === t.id ? 'Seu voto' : 'Votar'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : <Empty>Nenhum time inscrito ainda.</Empty>}
        {jam.phase === 'votacao' && <p className="text-xs text-gray-500 mt-4">Um voto por pessoa; dá para trocar até a votação fechar. Não vale votar no próprio time.</p>}
        {isAdmin && jam.phase !== 'encerrada' && <p className="text-xs text-gray-500 mt-2">Diretoria: os votos aparecem para você durante a jam; os membros veem o resultado quando ela for encerrada.</p>}
      </section>
    </div>
  );
}

function SubmitGame({ team, onSave }: { team: JamTeam; onSave: (data: Partial<JamTeam>) => Promise<void> }) {
  const [title, setTitle] = useState(team.gameTitle);
  const [url, setUrl] = useState(team.gameUrl);
  return (
    <form className="grid gap-2" onSubmit={e => { e.preventDefault(); void onSave({ gameTitle: title.trim(), gameUrl: url.trim() }); }}>
      <input className={input} value={title} onChange={e => setTitle(e.target.value)} placeholder="Nome do jogo" />
      <div className="flex gap-2">
        <input className={input} type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="Link do jogo (itch.io...)" />
        <button className={btn.soft} type="submit">Salvar</button>
      </div>
    </form>
  );
}
