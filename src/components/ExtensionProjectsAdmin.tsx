import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { Download, FileText, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { db } from '../lib/firebase';
import { exportExtensionProjectPDF, ExtensionProjectData } from '../lib/exportExtensionProjectPDF';

export default function ExtensionProjectsAdmin() {
  const [projects, setProjects] = useState<Array<ExtensionProjectData & { id: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocs(collection(db, 'extensionProjects')).then(snapshot => {
      const items = snapshot.docs.map(item => ({ id: item.id, ...item.data() } as ExtensionProjectData & { id: string }));
      items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setProjects(items);
    }).catch(error => {
      console.error('Erro ao carregar propostas de extensão:', error);
      toast.error('Não foi possível carregar as propostas.');
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-500" /></div>;

  return (
    <section className="w-full max-w-5xl mx-auto space-y-6">
      <div><p className="text-emerald-400 text-xs uppercase tracking-widest">Administração</p><h2 className="text-3xl font-bold text-white">Projetos de Extensão</h2><p className="text-gray-400 mt-2">Propostas enviadas pelos membros e exportação no formato acadêmico.</p></div>
      {projects.length === 0 ? <div className="p-8 border border-[var(--color-ink-faint)] text-gray-400">Nenhuma proposta enviada ainda.</div> : (
        <div className="space-y-3">
          {projects.map(project => (
            <div key={project.id} className="p-5 border border-[var(--color-ink-faint)] bg-[rgba(255,255,255,0.02)] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div><h3 className="font-bold text-white">{project.title || 'Sem título'}</h3><p className="text-sm text-gray-400">{project.authorName || project.authorEmail || 'Autor não informado'} · {project.createdAt ? new Date(project.createdAt).toLocaleDateString('pt-BR') : 'Sem data'}</p></div>
              <button type="button" onClick={() => { try { exportExtensionProjectPDF(project); toast.success('PDF da proposta gerado!'); } catch (error) { console.error(error); toast.error('Erro ao gerar o PDF.'); } }} className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-sm cursor-pointer flex items-center justify-center gap-2">
                <Download size={16} /> <FileText size={16} /> Exportar PDF
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
