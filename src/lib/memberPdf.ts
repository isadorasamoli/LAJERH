/**
 * PDFs do membro: portfólio na LAJE e declaração de horas em eventos.
 * A declaração é gerada pelo portal; para valer como certificado oficial,
 * a diretoria pode assinar e carimbar a versão impressa.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const GREEN: [number, number, number] = [16, 185, 129];
const PURPLE: [number, number, number] = [91, 44, 159];

function header(pdf: jsPDF, title: string) {
  pdf.setFillColor(...PURPLE);
  pdf.rect(0, 0, 210, 28, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text('LAJE', 15, 17);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Liga Acadêmica de Jogos Eletrônicos · CIn UFPE', 40, 17);
  pdf.setTextColor(20, 20, 20);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text(title, 15, 44);
}

function footer(pdf: jsPDF) {
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text(`Gerado pelo portal da LAJE em ${new Date().toLocaleDateString('pt-BR')} · página ${i} de ${pages}`, 15, 288);
  }
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');

export interface PortfolioData {
  name: string;
  email: string;
  role: string;
  course: string;
  projects: Array<{ name: string; roles: string; status: string; genre: string }>;
  tasks: Array<{ title: string; project: string; area: string; when: string }>;
  events: Array<{ title: string; date: string; hours: number }>;
}

export function downloadPortfolioPdf(d: PortfolioData) {
  const pdf = new jsPDF();
  header(pdf, `Portfólio de ${d.name}`);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(60, 60, 60);
  pdf.text([d.role, d.course, d.email].filter(Boolean).join(' · '), 15, 51);

  let y = 60;
  const section = (title: string, head: string[], body: string[][], empty: string) => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(...GREEN);
    pdf.text(title, 15, y);
    if (!body.length) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(110, 110, 110);
      pdf.text(empty, 15, y + 7);
      y += 18;
      return;
    }
    autoTable(pdf, {
      startY: y + 3,
      head: [head],
      body,
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: PURPLE },
      margin: { left: 15, right: 15 },
    });
    y = (pdf as any).lastAutoTable.finalY + 12;
  };

  section('Projetos', ['Projeto', 'Função', 'Gênero', 'Status'], d.projects.map(p => [p.name, p.roles || 'Equipe', p.genre, p.status]), 'Nenhum projeto registrado.');
  section('Tarefas entregues', ['Tarefa', 'Projeto', 'Área', 'Entrega'], d.tasks.map(t => [t.title, t.project, t.area, t.when]), 'Nenhuma tarefa entregue registrada.');
  const total = d.events.reduce((s, e) => s + e.hours, 0);
  section(`Eventos (${formatHours(total)})`, ['Evento', 'Data', 'Horas'], d.events.map(e => [e.title, e.date, formatHours(e.hours)]), 'Nenhuma presença registrada.');

  footer(pdf);
  pdf.save(`LAJE_Portfolio_${slug(d.name)}.pdf`);
}

export const formatHours = (h: number) => {
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  return min ? `${whole}h${String(min).padStart(2, '0')}` : `${whole}h`;
};

export function downloadHoursCertificatePdf(d: { name: string; email: string; events: Array<{ title: string; date: string; hours: number }> }) {
  const pdf = new jsPDF();
  header(pdf, 'Declaração de participação');
  const total = d.events.reduce((s, e) => s + e.hours, 0);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(30, 30, 30);
  const text = `Declaramos que ${d.name} (${d.email}) participou de ${d.events.length} ${d.events.length === 1 ? 'atividade' : 'atividades'} `
    + `da Liga Acadêmica de Jogos Eletrônicos (LAJE) do Centro de Informática da UFPE, totalizando ${formatHours(total)}, `
    + 'conforme a lista abaixo, registrada por presença no portal da liga.';
  pdf.text(pdf.splitTextToSize(text, 180), 15, 56);

  autoTable(pdf, {
    startY: 78,
    head: [['Atividade', 'Data', 'Carga horária']],
    body: d.events.map(e => [e.title, e.date, formatHours(e.hours)]),
    foot: [['Total', '', formatHours(total)]],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: PURPLE },
    footStyles: { fillColor: [237, 231, 246], textColor: 20 },
    margin: { left: 15, right: 15 },
  });
  const y = Math.min((pdf as any).lastAutoTable.finalY + 30, 262);
  pdf.setDrawColor(120, 120, 120);
  pdf.line(60, y, 150, y);
  pdf.setFontSize(10);
  pdf.text('Diretoria da LAJE', 105, y + 6, { align: 'center' });
  pdf.text(`Recife, ${new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}`, 105, y + 12, { align: 'center' });

  footer(pdf);
  pdf.save(`LAJE_Declaracao_Horas_${slug(d.name)}.pdf`);
}
