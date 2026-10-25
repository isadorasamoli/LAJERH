import { FormEvent, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { Code2, ExternalLink, GitBranch, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { db } from '../lib/firebase';

interface InformalProjectsProps {
  user: User;
  isAdmin: boolean;
}

interface InformalProject {
  id: string;
  userId: string;
  authorName: string;
  title: string;
  description: string;
  status: string;
  genre: string;
  engine: string;
  repositoryUrl: string;
  demoUrl: string;
  teamMembers: string;
  technologies: string;
  createdAt: number;
}

const emptyForm = {
  title: '', description: '', status: 'Em desenvolvimento', genre: '',
  engine: '', repositoryUrl: '', demoUrl: '', teamMembers: '', technologies: ''
};

export default function InformalProjects({ user, isAdmin }: InformalProjectsProps) {
  const [projects, setProjects] = useState<InformalProject[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadProjects = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'informalProjects'));
      const items = snapshot.docs.map(item => ({ id: item.id, ...item.data() } as InformalProject));
      items.sort((a, b) => b.createdAt - a.createdAt);
      setProjects(items);
    } catch (error) {
      console.error('Erro ao carregar projetos informais:', error);
      toast.error('Não foi possível carregar os projetos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProjects(); }, []);

  const visibleProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return projects;
    return projects.filter(project =>
      [project.title, project.description, project.genre, project.technologies, project.authorName]
        .some(value => value.toLowerCase().includes(term))
    );
  }, [projects, search]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const created = {
        ...form,
        userId: user.uid,
        authorName: user.displayName || user.email || 'Membro',
        authorEmail: user.email || '',
        createdAt: Date.now()
      };
      const saved = await addDoc(collection(db, 'informalProjects'), created);
      setProjects(previous => [{ id: saved.id, ...created }, ...previous]);
      setForm(emptyForm);
      setIsModalOpen(false);
      toast.success('Projeto informal publicado!');
    } catch (error) {
      console.error('Erro ao publicar projeto informal:', error);
      toast.error('Não foi possível publicar o projeto.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (project: InformalProject) => {
    if (!window.confirm(`Excluir o projeto "${project.title}"?`)) return;
    try {
      await deleteDoc(doc(db, 'informalProjects', project.id));
      setProjects(previous => previous.filter(item => item.id !== project.id));
      toast.success('Projeto removido.');
    } catch (error) {
      console.error('Erro ao excluir projeto informal:', error);
      toast.error('Não foi possível excluir o projeto.');
    }
  };

  return (
    <section className="w-full max-w-6xl mx-auto space-y-7 pb-12">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-emerald-400 text-xs uppercase tracking-widest">Portfólio da LAJE</p>
          <h2 className="text-3xl font-bold text-white">Projetos Informais</h2>
          <p className="text-gray-400 mt-2 max-w-2xl">Compartilhe jogos criados por você ou em processo de criação. É um espaço para encontrar colaboradores, dar visibilidade às ideias e registrar o progresso dos projetos.</p>
        </div>
        <button type="button" onClick={() => setIsModalOpen(true)} className="px-4 py-3 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold cursor-pointer flex items-center gap-2 whitespace-nowrap">
          <Plus size={18} /> Adicionar projeto
        </button>
      </header>

      <div className="flex items-center gap-3 border border-[var(--color-ink-faint)] bg-[rgba(255,255,255,0.02)] px-3 py-2">
        <Search size={18} className="text-gray-500" />
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome, gênero, tecnologia ou autor..." className="w-full bg-transparent outline-none text-sm text-white" />
      </div>

      {loading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500" /></div> : visibleProjects.length === 0 ? (
        <div className="p-10 text-center border border-dashed border-[var(--color-ink-faint)] text-gray-400">Nenhum projeto encontrado. Adicione o primeiro jogo da comunidade.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibleProjects.map(project => (
            <article key={project.id} className="border border-[var(--color-ink-faint)] bg-[rgba(255,255,255,0.02)] p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div><h3 className="text-xl font-bold text-white">{project.title}</h3><p className="text-xs text-gray-500">Por {project.authorName} · {new Date(project.createdAt).toLocaleDateString('pt-BR')}</p></div>
                <span className="px-2 py-1 text-[10px] uppercase font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">{project.status}</span>
              </div>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{project.description}</p>
              <div className="flex flex-wrap gap-2 text-xs text-gray-400">
                {project.genre && <span className="px-2 py-1 bg-gray-800">Gênero: {project.genre}</span>}
                {project.engine && <span className="px-2 py-1 bg-gray-800">Engine: {project.engine}</span>}
                {project.technologies && <span className="px-2 py-1 bg-gray-800">Tecnologias: {project.technologies}</span>}
              </div>
              {project.teamMembers && <p className="text-xs text-gray-400"><strong className="text-gray-300">Equipe:</strong> {project.teamMembers}</p>}
              <div className="flex flex-wrap gap-2 pt-2">
                {project.repositoryUrl && <a href={project.repositoryUrl} target="_blank" rel="noreferrer" className="px-3 py-2 border border-gray-700 text-gray-300 hover:text-white inline-flex items-center gap-2 text-xs"><GitBranch size={15} /> GitHub <ExternalLink size={12} /></a>}
                {project.demoUrl && <a href={project.demoUrl} target="_blank" rel="noreferrer" className="px-3 py-2 border border-emerald-500/30 text-emerald-400 inline-flex items-center gap-2 text-xs"><Code2 size={15} /> Jogar / Demo <ExternalLink size={12} /></a>}
                {(isAdmin || project.userId === user.uid) && <button type="button" onClick={() => handleDelete(project)} className="ml-auto p-2 text-red-400 hover:bg-red-500/10 cursor-pointer" title="Excluir projeto"><Trash2 size={16} /></button>}
              </div>
            </article>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setIsModalOpen(false)}>
          <form onSubmit={handleSubmit} onClick={event => event.stopPropagation()} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#121216] border border-emerald-500/30 p-6 space-y-4">
            <div className="flex justify-between items-center"><h3 className="text-xl font-bold text-white">Adicionar projeto informal</h3><button type="button" onClick={() => setIsModalOpen(false)} className="text-gray-400 cursor-pointer"><X /></button></div>
            <p className="text-xs text-gray-400">Além do GitHub, recomendamos incluir uma demo, tecnologias usadas e o que você procura para o projeto.</p>
            <label className="block text-xs uppercase text-gray-400">Nome do jogo *<input required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} className="mt-2 w-full bg-transparent border border-gray-700 p-3 text-white" /></label>
            <label className="block text-xs uppercase text-gray-400">Descrição e estado atual *<textarea required rows={5} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="Conceito, o que já foi feito e próximos passos..." className="mt-2 w-full bg-transparent border border-gray-700 p-3 text-white" /></label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block text-xs uppercase text-gray-400">Status<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })} className="mt-2 w-full bg-[#121216] border border-gray-700 p-3 text-white"><option>Ideia</option><option>Em desenvolvimento</option><option>Em testes</option><option>Publicado</option><option>Pausado</option></select></label>
              <label className="block text-xs uppercase text-gray-400">Gênero<input value={form.genre} onChange={event => setForm({ ...form, genre: event.target.value })} placeholder="RPG, puzzle..." className="mt-2 w-full bg-transparent border border-gray-700 p-3 text-white" /></label>
              <label className="block text-xs uppercase text-gray-400">Engine / framework<input value={form.engine} onChange={event => setForm({ ...form, engine: event.target.value })} placeholder="Godot, Unity..." className="mt-2 w-full bg-transparent border border-gray-700 p-3 text-white" /></label>
              <label className="block text-xs uppercase text-gray-400">Tecnologias<input value={form.technologies} onChange={event => setForm({ ...form, technologies: event.target.value })} placeholder="C#, GDScript..." className="mt-2 w-full bg-transparent border border-gray-700 p-3 text-white" /></label>
            </div>
            <label className="block text-xs uppercase text-gray-400">Link do GitHub<input type="url" value={form.repositoryUrl} onChange={event => setForm({ ...form, repositoryUrl: event.target.value })} placeholder="https://github.com/..." className="mt-2 w-full bg-transparent border border-gray-700 p-3 text-white" /></label>
            <label className="block text-xs uppercase text-gray-400">Link da demo / página do jogo<input type="url" value={form.demoUrl} onChange={event => setForm({ ...form, demoUrl: event.target.value })} placeholder="https://itch.io/..." className="mt-2 w-full bg-transparent border border-gray-700 p-3 text-white" /></label>
            <label className="block text-xs uppercase text-gray-400">Equipe / colaboradores<input value={form.teamMembers} onChange={event => setForm({ ...form, teamMembers: event.target.value })} className="mt-2 w-full bg-transparent border border-gray-700 p-3 text-white" /></label>
            <button disabled={saving} className="w-full py-3 bg-emerald-500 text-gray-950 font-bold cursor-pointer disabled:opacity-50">{saving ? 'Publicando...' : 'Publicar projeto'}</button>
          </form>
        </div>
      )}
    </section>
  );
}
