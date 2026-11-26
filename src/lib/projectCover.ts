/**
 * Capa do projeto.
 *
 * Sem o Firebase Storage (que exige o plano Blaze), a imagem é reduzida no navegador
 * e guardada como data URL num documento à parte: projectCovers/{projectId}.
 * Fica fora do documento do projeto para a lista de projetos continuar leve.
 * Um documento do Firestore aceita até 1 MB; a imagem final fica bem abaixo disso.
 */
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

const MAX_WIDTH = 1600;
const MAX_HEIGHT = 900;
const MAX_BYTES = 700_000; // tamanho do texto do data URL
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

export async function loadProjectCover(projectId: string): Promise<string> {
  const snap = await getDoc(doc(db, 'projectCovers', projectId));
  return snap.exists() ? String(snap.data().image || '') : '';
}

export async function saveProjectCover(projectId: string, image: string, updatedBy: string) {
  await setDoc(doc(db, 'projectCovers', projectId), { image, updatedAt: Date.now(), updatedBy });
}

export async function removeProjectCover(projectId: string) {
  await deleteDoc(doc(db, 'projectCovers', projectId));
}

/** Reduz a imagem e devolve um JPEG em data URL. Lança Error com mensagem em português. */
export async function resizeCoverImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem (JPG, PNG ou WebP).');
  if (file.size > MAX_INPUT_BYTES) throw new Error('A imagem passa de 15 MB. Escolha uma menor.');

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Não consegui abrir essa imagem.'));
      el.src = url;
    });
    const scale = Math.min(1, MAX_WIDTH / img.naturalWidth, MAX_HEIGHT / img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Seu navegador não conseguiu processar a imagem.');
    ctx.fillStyle = '#141414'; // fundo para PNG transparente
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.85, 0.75, 0.65, 0.5, 0.4]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= MAX_BYTES) return data;
    }
    throw new Error('Não consegui deixar a imagem leve o bastante. Tente uma imagem mais simples.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
