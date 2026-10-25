import { FormEvent, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { CheckCircle, FileText, Loader2, Send } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { db } from '../lib/firebase';
import { exportExtensionProjectPDF, ExtensionProjectData } from '../lib/exportExtensionProjectPDF';

interface ExtensionProjectFormProps {
  user: User;
  onBack: () => void;
}

type FormState = Required<Omit<ExtensionProjectData, 'id' | 'createdAt' | 'authorName' | 'authorEmail'>>;

const initialState: FormState = {
  title: '', coordinator: '', institution: 'Universidade Federal de Pernambuco',
  department: '', area: 'Tecnologia e Desenvolvimento de Jogos', duration: '',
  location: '', sustainableDevelopmentGoal: '', summary: '', keywords: '', justification: '', generalObjective: '',
  specificObjectives: '', methodology: '', targetAudience: '', expectedResults: '',
  possibleCoordinators: '', schedule: '', team: '', references: '', budget: ''
};

const fields: Array<{ key: keyof FormState; label: string; rows: number; required?: boolean; placeholder?: string }> = [
  { key: 'title', label: 'Título da proposta', rows: 1, required: true },
  { key: 'coordinator', label: 'Coordenação / responsável', rows: 1, required: true },
  { key: 'department', label: 'Departamento, curso ou unidade', rows: 1 },
  { key: 'duration', label: 'Duração prevista', rows: 1 },
  { key: 'location', label: 'Local de realização', rows: 1 },
  {
    key: 'sustainableDevelopmentGoal',
    label: '1. Objetivo de Desenvolvimento Sustentável',
    rows: 4,
    required: true,
    placeholder: 'Exemplo: ODS 4 - Educação de Qualidade: promover a formação interdisciplinar em desenvolvimento de jogos digitais.'
  },
  { key: 'summary', label: '2. Resumo da Ação', rows: 5, required: true },
  {
    key: 'keywords',
    label: '3. Palavras-chave',
    rows: 2,
    required: true,
    placeholder: 'Exemplo: jogos digitais; extensão universitária; formação interdisciplinar; tecnologia; inovação.'
  },
  { key: 'justification', label: '4. Justificativa', rows: 7, required: true },
  {
    key: 'generalObjective',
    label: '5. Objetivos Gerais',
    rows: 5,
    required: true,
    placeholder: 'Exemplo: Fortalecer a formação acadêmica e profissional em desenvolvimento de jogos digitais por meio de uma ação extensionista interdisciplinar.'
  },
  { key: 'specificObjectives', label: '6. Objetivos Específicos', rows: 6, required: true },
  {
    key: 'methodology',
    label: '6. Metodologia',
    rows: 8,
    required: true,
    placeholder: 'Exemplo: realização de minicursos introdutórios, oficinas práticas e uma game jam com equipes multidisciplinares.'
  },
  { key: 'targetAudience', label: '8. Público-alvo', rows: 4, required: true },
  {
    key: 'expectedResults',
    label: '7. Resultados Esperados',
    rows: 6,
    required: true,
    placeholder: 'Exemplo: capacitar estudantes, estimular a colaboração entre áreas e desenvolver protótipos de jogos digitais.'
  },
  {
    key: 'possibleCoordinators',
    label: '8. Possíveis Professores Coordenadores do Projeto',
    rows: 5,
    placeholder: 'Exemplo: Prof. Geber Ramalho: Professor de Jogos Digitais no Cin/UFPE com ampla experiência do mercado e contatos do Estado.'
  },
  { key: 'schedule', label: '10. Cronograma', rows: 6 },
  { key: 'team', label: '11. Equipe Executora', rows: 5 },
  {
    key: 'references',
    label: '9. Referências',
    rows: 5,
    placeholder: 'Exemplo: ABRAGAMES. Pesquisa da Indústria Brasileira de Games. 2023.\nUNESCO. Educação para o desenvolvimento sustentável.'
  },
  { key: 'budget', label: '13. Orçamento e Recursos', rows: 4 }
];

export default function ExtensionProjectForm({ user, onBack }: ExtensionProjectFormProps) {
  const [form, setForm] = useState<FormState>(initialState);
  const [submitted, setSubmitted] = useState<ExtensionProjectData | null>(null);
  const [saving, setSaving] = useState(false);
  const [myProjects, setMyProjects] = useState<ExtensionProjectData[]>([]);

  useEffect(() => {
    const load = async () => {
      const snapshot = await getDocs(query(collection(db, 'extensionProjects'), where('userId', '==', user.uid)));
      setMyProjects(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as ExtensionProjectData)));
    };
    load().catch(error => console.error('Erro ao carregar propostas de extensão:', error));
  }, [user.uid]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const data: ExtensionProjectData & { userId: string; status: string } = {
        ...form, userId: user.uid, authorName: user.displayName || user.email || 'Membro',
        authorEmail: user.email || '', createdAt: Date.now(), status: 'enviada'
      };
      const created = await addDoc(collection(db, 'extensionProjects'), data);
      const result = { ...data, id: created.id };
      setSubmitted(result);
      setMyProjects(previous => [result, ...previous]);
      toast.success('Proposta de extensão enviada ao RH!');
    } catch (error) {
      console.error('Erro ao salvar proposta de extensão:', error);
      toast.error('Não foi possível enviar a proposta.');
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <div className="w-full max-w-2xl mx-auto mt-12 p-8 border border-emerald-500/20 bg-emerald-500/10 text-center flex flex-col items-center">
        <CheckCircle size={64} className="text-emerald-500 mb-6" />
        <h2 className="text-2xl font-bold text-white mb-2">Proposta enviada</h2>
        <p className="text-gray-400">O RH já pode consultar e exportar este projeto no padrão acadêmico.</p>
        <button type="button" onClick={() => { setSubmitted(null); setForm(initialState); }} className="mt-8 px-6 py-2.5 bg-emerald-500 text-gray-950 font-bold cursor-pointer">Cadastrar outra proposta</button>
        <button type="button" onClick={onBack} className="mt-3 text-sm text-gray-400 hover:text-white cursor-pointer">Voltar ao formulário de membro</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-3xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between gap-4">
        <div><p className="text-emerald-400 text-xs uppercase tracking-widest">Novo modelo</p><h2 className="text-3xl font-bold text-white">Projeto de Extensão</h2></div>
        <button type="button" onClick={onBack} className="text-sm text-gray-400 hover:text-white cursor-pointer">Formulário de membro</button>
      </div>
      <div className="p-4 border border-emerald-500/30 bg-emerald-500/5 text-sm text-gray-300">Preencha a proposta acadêmica. Os campos serão organizados automaticamente no PDF conforme o modelo de projeto de extensão.</div>
      {myProjects.length > 0 && <p className="text-xs text-gray-500">{myProjects.length} proposta(s) enviada(s) por você.</p>}
      <section className="p-6 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] space-y-5">
        {fields.map(field => (
          <label key={field.key} className="block space-y-2">
            <span className="text-xs font-semibold uppercase text-gray-400">{field.label}{field.required ? ' *' : ''}</span>
            {field.rows === 1 ? (
              <input required={field.required} value={form[field.key]} onChange={event => setForm(previous => ({ ...previous, [field.key]: event.target.value }))} className="w-full bg-transparent border border-[var(--color-ink-faint)] p-3 text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]" />
            ) : (
              <textarea required={field.required} rows={field.rows} placeholder={field.placeholder} value={form[field.key]} onChange={event => setForm(previous => ({ ...previous, [field.key]: event.target.value }))} className="w-full bg-transparent border border-[var(--color-ink-faint)] p-3 text-[var(--color-ink)] placeholder:text-gray-500 outline-none focus:border-[var(--color-accent)] resize-y" />
            )}
          </label>
        ))}
      </section>
      <button type="submit" disabled={saving} className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold cursor-pointer disabled:opacity-50 flex justify-center items-center gap-2">
        {saving ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />} Enviar proposta ao RH
      </button>
      <button type="button" onClick={() => exportExtensionProjectPDF({ ...form, authorName: user.displayName || user.email || '' })} className="w-full py-3 border border-emerald-500/40 text-emerald-400 font-bold cursor-pointer flex justify-center items-center gap-2">
        <FileText size={18} /> Pré-visualizar PDF
      </button>
    </form>
  );
}
