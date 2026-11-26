import { FormEvent, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, ExternalLink, Plus, Star } from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { ProjectItem } from '../lib/projects';
import {
  DEFAULT_QUESTIONS, Playtest, PlaytestFeedback, createPlaytest, loadFeedback,
  loadProjectPlaytests, playtestUrl, setPlaytestOpen,
} from '../lib/playtests';

/** Sessões de playtest do projeto, com link público de resposta e as respostas recebidas. Usa as classes .lp-* da página. */
export default function PlaytestsPanel({ project, userName }: { project: ProjectItem; userName: string }) {
  const [list, setList] = useState<Playtest[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [buildUrl, setBuildUrl] = useState(project.buildUrl || '');
  const [questions, setQuestions] = useState(DEFAULT_QUESTIONS.join('\n'));
  const [openId, setOpenId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, PlaytestFeedback[]>>({});

  const reload = () => project.id && loadProjectPlaytests(project.id).then(setList).catch(() => setList([]));
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [project.id]);

  const toggleOpen = async (p: Playtest) => {
    if (openId === p.id) { setOpenId(null); return; }
    setOpenId(p.id);
    if (!feedback[p.id]) {
      const rows = await loadFeedback(p.id, p.projectId).catch(() => []);
      setFeedback(prev => ({ ...prev, [p.id]: rows }));
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!project.id || !title.trim()) return;
    const qs = questions.split('\n').map(q => q.trim()).filter(Boolean).slice(0, 10);
    try {
      const id = await createPlaytest({ projectId: project.id, projectName: project.name, title: title.trim(), buildUrl: buildUrl.trim(), questions: qs, createdBy: userName });
      await navigator.clipboard.writeText(playtestUrl(id)).catch(() => undefined);
      toast.success('Playtest criado. O link de resposta foi copiado.');
      setTitle('');
      setCreating(false);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível criar o playtest.');
    }
  };

  return (
    <section className="lp-playtests">
      <div className="lp-h lp-links-heading">
        <div><h3>Playtests</h3><p>Crie uma sessão de teste e mande o link para quem vai jogar. A pessoa responde sem login; as respostas aparecem só para o time.</p></div>
        {!creating && <button className="lp-btn small primary" onClick={() => setCreating(true)}><Plus />Novo playtest</button>}
      </div>

      {creating && (
        <form className="lp-form" onSubmit={e => void create(e)}>
          <div className="lp-two">
            <div className="lp-field"><label htmlFor="pt-title">Nome da sessão</label><input id="pt-title" value={title} onChange={e => setTitle(e.target.value)} required placeholder="Ex.: Tenda da sereia, versão 0.3" /></div>
            <div className="lp-field"><label htmlFor="pt-build">Link da build (opcional)</label><input id="pt-build" type="url" value={buildUrl} onChange={e => setBuildUrl(e.target.value)} placeholder="https://..." /></div>
          </div>
          <div className="lp-field"><label htmlFor="pt-q">Perguntas, uma por linha</label><textarea id="pt-q" value={questions} onChange={e => setQuestions(e.target.value)} style={{ height: 140 }} /></div>
          <div className="lp-row"><button className="lp-btn primary" type="submit"><Plus />Criar e copiar link</button><button className="lp-btn" type="button" onClick={() => setCreating(false)}>Cancelar</button></div>
        </form>
      )}

      {list.length ? (
        <div className="lp-list">
          {list.map(p => {
            const rows = feedback[p.id];
            const avg = rows?.length ? (rows.reduce((s, r) => s + r.rating, 0) / rows.length).toFixed(1) : null;
            return (
              <div key={p.id} className="lp-frow lp-playtest">
                <div>
                  <b>{p.title}</b>
                  <small>{new Date(p.createdAt).toLocaleDateString('pt-BR')} · {p.open ? 'recebendo respostas' : 'encerrado'}{avg ? ` · nota média ${avg}` : ''}</small>
                </div>
                <div className="lp-row">
                  <button className="lp-btn small" onClick={() => navigator.clipboard.writeText(playtestUrl(p.id)).then(() => toast.success('Link copiado.'))}><Copy />Link</button>
                  <a className="lp-btn small" href={playtestUrl(p.id)} target="_blank" rel="noreferrer"><ExternalLink />Abrir</a>
                  <button className="lp-btn small" onClick={() => setPlaytestOpen(p.id, !p.open).then(reload)}>{p.open ? 'Encerrar' : 'Reabrir'}</button>
                  <button className="lp-btn small soft" onClick={() => void toggleOpen(p)}>{openId === p.id ? <ChevronUp /> : <ChevronDown />}Respostas</button>
                </div>
                {openId === p.id && (
                  <div className="lp-feedback">
                    {!rows ? <p className="lp-muted">Carregando…</p> : !rows.length ? <p className="lp-muted">Nenhuma resposta ainda.</p> : rows.map(r => (
                      <article key={r.id} className="lp-feedback-item">
                        <header><b>{r.testerName || 'Anônimo'}</b><span className="lp-stars">{Array.from({ length: 5 }, (_, i) => <Star key={i} className={i < r.rating ? 'on' : ''} />)}</span><small>{new Date(r.createdAt).toLocaleString('pt-BR')}</small></header>
                        {p.questions.map((q, i) => r.answers[i] ? <p key={i}><span>{q}</span>{r.answers[i]}</p> : null)}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : !creating && <div className="lp-empty"><span>Nenhum playtest ainda.</span></div>}
    </section>
  );
}
