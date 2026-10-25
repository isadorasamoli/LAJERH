import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ExtensionProjectData {
  id?: string;
  title?: string;
  coordinator?: string;
  institution?: string;
  department?: string;
  area?: string;
  duration?: string;
  location?: string;
  sustainableDevelopmentGoal?: string;
  summary?: string;
  keywords?: string;
  justification?: string;
  generalObjective?: string;
  specificObjectives?: string;
  methodology?: string;
  targetAudience?: string;
  expectedResults?: string;
  possibleCoordinators?: string;
  schedule?: string;
  team?: string;
  references?: string;
  budget?: string;
  authorName?: string;
  authorEmail?: string;
  createdAt?: number;
}

const valueOrFallback = (value?: string) => value?.trim() || 'Não informado';

const sections: Array<{ key: keyof ExtensionProjectData; title: string }> = [
  { key: 'sustainableDevelopmentGoal', title: '1. Objetivo de Desenvolvimento Sustentável' },
  { key: 'summary', title: '2. Resumo da Ação' },
  { key: 'keywords', title: '3. Palavras-chave' },
  { key: 'justification', title: '4. Justificativa' },
  { key: 'generalObjective', title: '5. Objetivos Gerais' },
  { key: 'specificObjectives', title: '5.1. Objetivos Específicos' },
  { key: 'methodology', title: '6. Metodologia' },
  { key: 'targetAudience', title: '6.1. Público-alvo' },
  { key: 'expectedResults', title: '7. Resultados Esperados' },
  { key: 'possibleCoordinators', title: '8. Possíveis Professores Coordenadores do Projeto' },
  { key: 'schedule', title: '10. Cronograma' },
  { key: 'team', title: '11. Equipe Executora' },
  { key: 'references', title: '9. Referências' },
  { key: 'budget', title: '13. Orçamento e Recursos' }
];

export function exportExtensionProjectPDF(project: ExtensionProjectData): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const title = valueOrFallback(project.title);
  const dark: [number, number, number] = [22, 31, 42];
  const emerald: [number, number, number] = [16, 128, 96];
  const margin = 24;

  pdf.setFillColor(...dark);
  pdf.rect(0, 0, 210, 297, 'F');
  pdf.setFillColor(...emerald);
  pdf.rect(0, 0, 210, 8, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('times', 'bold');
  pdf.setFontSize(18);
  pdf.text('PROJETO DE EXTENSÃO', 105, 72, { align: 'center' });
  pdf.setFontSize(14);
  pdf.text('LAJE GAME LAB', 105, 84, { align: 'center' });
  pdf.setFont('times', 'normal');
  pdf.setFontSize(16);
  pdf.text(pdf.splitTextToSize(title, 150), 105, 112, { align: 'center' });
  pdf.setFontSize(11);
  pdf.setTextColor(205, 220, 214);
  pdf.text(`Coordenação: ${valueOrFallback(project.coordinator)}`, 105, 160, { align: 'center' });
  pdf.text(valueOrFallback(project.institution), 105, 168, { align: 'center' });
  pdf.text(`${valueOrFallback(project.department)} | ${valueOrFallback(project.area)}`, 105, 176, { align: 'center' });
  pdf.text(`Emitido em ${new Date().toLocaleDateString('pt-BR')}`, 105, 260, { align: 'center' });

  pdf.addPage();
  pdf.setFillColor(...emerald);
  pdf.rect(0, 0, 210, 5, 'F');
  pdf.setTextColor(...dark);
  pdf.setFont('times', 'bold');
  pdf.setFontSize(16);
  pdf.text(title, margin, 20);
  pdf.setFont('times', 'normal');
  pdf.setFontSize(10);
  pdf.text(`Coordenação: ${valueOrFallback(project.coordinator)}  |  Duração: ${valueOrFallback(project.duration)}`, margin, 28);
  pdf.text(`Local: ${valueOrFallback(project.location)}  |  Autor: ${valueOrFallback(project.authorName)}`, margin, 34);

  let y = 44;
  sections.forEach(({ key, title: sectionTitle }) => {
    const content = valueOrFallback(project[key] as string);
    autoTable(pdf, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'plain',
      styles: { font: 'times', fontSize: 11, textColor: [35, 35, 35], cellPadding: 3, overflow: 'linebreak' },
      body: [
        [{ content: sectionTitle, styles: { fontStyle: 'bold', fontSize: 12, textColor: dark, fillColor: [232, 241, 237], cellPadding: 4 } }],
        [{ content, styles: { minCellHeight: 12 } }]
      ],
      columnStyles: { 0: { cellWidth: 162 } },
      didDrawPage: (data) => {
        if (data.pageNumber > 1) {
          pdf.setFillColor(...emerald);
          pdf.rect(0, 0, 210, 4, 'F');
          pdf.setFont('times', 'italic');
          pdf.setFontSize(8);
          pdf.setTextColor(100, 100, 100);
          pdf.text(title, margin, 12);
        }
      }
    });
    const tableDocument = pdf as jsPDF & { lastAutoTable?: { finalY?: number } };
    y = (tableDocument.lastAutoTable?.finalY || y) + 5;
    if (y > 265) {
      pdf.addPage();
      y = 18;
    }
  });

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setFont('times', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text(`LAJE Game Lab | Projeto de Extensão | ${page}/${pages}`, 105, 288, { align: 'center' });
  }

  const safeName = title.replace(/[^\wÀ-ÿ-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'projeto-extensao';
  pdf.save(`${safeName}.pdf`);
}
