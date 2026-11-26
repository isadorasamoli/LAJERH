import { FormEvent, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query } from 'firebase/firestore';
import { BookOpen, ExternalLink, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { db } from '../lib/firebase';
import { norm } from '../lib/portal';
import { Empty, Field, Loading, PageHeader, btn, chip, chipColor, input, panel } from './PortalUI';

/**
 * Banco de recursos: tutoriais, assets livres, ferramentas e modelos.
 * resources/{id}: qualquer membro adiciona; quem adicionou ou a diretoria remove.
 */
interface Resource {
  id: string;
  title: string;
  url: string;
  area: string;
  kind: string;
  description: string;
  addedBy: string;
  addedByUid: string;
  createdAt: number;
}

const AREAS = ['Programação', 'Arte', 'Som', 'Game design', 'Narrativa', 'Produção', 'Geral'];
const KINDS = ['Tutorial', 'Assets livres', 'Ferramenta', 'Modelo da LAJE', 'Leitura', 'Outro'];

const safeUrl = (u: string) => {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
};

export default function ResourceLibrary({ user, isAdmin }: { user: User; isAdmin: boolean }) {
  const [items, setItems] = useState<Resource[] | null>(null);
  const [area, setArea] = useState('Todas');
  const [kind, setKind] = useState('Todos');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', url: '', area: AREAS[0], kind: KINDS[0], description: '' });

  const reload = () => getDocs(query(collection(db, 'resources'), orderBy('createdAt', 'desc')))
    .then(s => setItems(s.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Resource, 'id'>) }))))
    .catch(() => setItems([]));
  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => (items || []).filter(r =>
    (area === 'Todas' || r.area === area) && (kind === 'Todos' || r.kind === kind)
    && (!search || norm(`${r.title} ${r.description}`).includes(norm(search)))), [items, area, kind, search]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const url = safeUrl(form.url.trim());
    if (!url) { toast.error('Use um link que comece com https://'); return; }
    try {
      await addDoc(collection(db, 'resources'), {
        ...form, title: form.title.trim(), description: form.description.trim(), url,
        addedBy: user.displayName || user.email || 'Membro', addedByUid: user.uid, createdAt: Date.now(),
      });
      toast.success('Recurso adicionado. Obrigado por compartilhar!');
      setForm({ title: '', url: '', area: AREAS[0], kind: KINDS[0], description: '' });
      setAdding(false);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível adicionar.');
    }
  };

  const remove = async (r: Resource) => {
    try {
      await deleteDoc(doc(db, 'resources', r.id));
      setItems(prev => (prev || []).filter(x => x.id !== r.id));
      toast.success('Recurso removido.');
    } catch {
      toast.error('Não foi possível remover.');
    }
  };

  const select = 'bg-[#161619] border border-[var(--color-ink-faint)] py-2 px-2 text-xs text-gray-300';

  return (
    <div className="w-full max-w-5xl mx-auto pb-16 text-left">
      <PageHeader
        icon={<BookOpen size={26} />}
        title="Recursos"
        subtitle="Tutoriais, assets livres, ferramentas e modelos que a liga recomenda"
        actions={!adding ? <button className={btn.primary} onClick={() => setAdding(true)}><Plus size={13} /> Compartilhar recurso</button> : undefined}
      />

      {adding && (
        <form onSubmit={e => void submit(e)} className={`${panel} border-l-4 border-l-emerald-500 p-5 mb-8 grid gap-4`}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Título"><input className={input} required maxLength={160} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Curso de pixel art do zero" /></Field>
            <Field label="Link"><input className={input} required type="url" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://..." /></Field>
            <Field label="Área"><select className={`${select} w-full`} value={form.area} onChange={e => setForm({ ...form, area: e.target.value })}>{AREAS.map(a => <option key={a}>{a}</option>)}</select></Field>
            <Field label="Tipo"><select className={`${select} w-full`} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>{KINDS.map(k => <option key={k}>{k}</option>)}</select></Field>
          </div>
          <Field label="Para que serve (opcional)"><textarea className={`${input} h-20 resize-y`} maxLength={600} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="flex gap-2"><button className={btn.primary} type="submit">Adicionar</button><button className={btn.ghost} type="button" onClick={() => setAdding(false)}>Cancelar</button></div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input className={`${input} pl-9`} value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar recurso" aria-label="Buscar recurso" />
        </div>
        <select className={select} aria-label="Área" value={area} onChange={e => setArea(e.target.value)}><option>Todas</option>{AREAS.map(a => <option key={a}>{a}</option>)}</select>
        <select className={select} aria-label="Tipo" value={kind} onChange={e => setKind(e.target.value)}><option>Todos</option>{KINDS.map(k => <option key={k}>{k}</option>)}</select>
      </div>

      {!items ? <Loading /> : !filtered.length ? (
        <Empty>{items.length ? 'Nenhum recurso com esse filtro.' : 'Nenhum recurso ainda. Compartilhe o primeiro!'}</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map(r => (
            <article key={r.id} className={`${panel} p-5 flex flex-col gap-3`}>
              <div className="flex flex-wrap gap-2">
                <span className={`${chip} ${chipColor.green}`}>{r.area}</span>
                <span className={`${chip} ${chipColor.gray}`}>{r.kind}</span>
              </div>
              <h4 className="font-bold text-white">{r.title}</h4>
              {r.description && <p className="text-sm text-gray-400 flex-1">{r.description}</p>}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <small className="text-xs text-gray-500">por {r.addedBy}</small>
                <div className="flex gap-2">
                  {(r.addedByUid === user.uid || isAdmin) && <button className={btn.danger} onClick={() => void remove(r)} aria-label={`Remover ${r.title}`}><Trash2 size={13} /></button>}
                  <a className={btn.soft} href={r.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Abrir</a>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
