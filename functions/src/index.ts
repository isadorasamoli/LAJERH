import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { google } from 'googleapis';
import { defineString } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

initializeApp();

const db = getFirestore('ai-studio-c7ee8b41-8fd4-4036-af2a-f7dd4640756a');
const driveFolderId = defineString('LAJE_DRIVE_FOLDER_ID');
const gddTemplateId = defineString('LAJE_GDD_TEMPLATE_ID');
const scriptTemplateId = defineString('LAJE_SCRIPT_TEMPLATE_ID');
const driveScope = 'https://www.googleapis.com/auth/drive';

type DocumentKind = 'gdd' | 'script';
type Project = {
  name?: string;
  gddUrl?: string;
  scriptUrl?: string;
  gddDocumentId?: string;
  scriptDocumentId?: string;
  leaderUid?: string;
  responsibleDirectorUid?: string;
  teamMemberUids?: string[];
};

function requireAuth(uid: string | undefined): asserts uid is string {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Entre na sua conta para acessar o projeto.');
  }
}

function parseDocumentKind(value: unknown): DocumentKind {
  if (value !== 'gdd' && value !== 'script') {
    throw new HttpsError('invalid-argument', 'Tipo de documento inválido.');
  }
  return value;
}

function parseProjectId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    throw new HttpsError('invalid-argument', 'Projeto inválido.');
  }
  return value;
}

function getDocumentId(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsedUrl = new URL(url);
    if (!['docs.google.com', 'drive.google.com'].includes(parsedUrl.hostname)) return null;
    const pathMatch = parsedUrl.pathname.match(/\/(?:document|file)\/d\/([a-zA-Z0-9_-]+)/);
    return pathMatch?.[1] || parsedUrl.searchParams.get('id');
  } catch {
    return null;
  }
}

async function isPortalAdmin(uid: string, email?: string | null): Promise<boolean> {
  const normalizedEmail = email?.trim().toLowerCase();
  if (
    normalizedEmail === 'isadora.mlima@ufpe.br' ||
    normalizedEmail === 'isadorasdml@gmail.com' ||
    normalizedEmail?.startsWith('isadora.mlima@ufpe')
  ) {
    return true;
  }

  const [admin, lowerAdmin, profile, response] = await Promise.all([
    normalizedEmail ? db.doc(`admins/${normalizedEmail}`).get() : Promise.resolve(null),
    email && email !== normalizedEmail ? db.doc(`admins/${email}`).get() : Promise.resolve(null),
    db.doc(`users/${uid}`).get(),
    db.collection('responses').where('userId', '==', uid).limit(1).get()
  ]);
  if (admin?.exists || lowerAdmin?.exists) return true;

  const profileData = profile.data() || {};
  const role = String(profileData.leagueRole || response.docs[0]?.data().leagueRole || '').toLowerCase();
  return profileData.isRH === true ||
    profileData.isDiretorio === true ||
    role.includes('rh') ||
    role.includes('recursos humanos') ||
    role.includes('diretoria') ||
    role.includes('diretório');
}

async function getProjectForManager(
  projectId: string,
  uid: string,
  email?: string | null
) {
  const projectRef = db.doc(`projects/${projectId}`);
  const projectSnapshot = await projectRef.get();
  if (!projectSnapshot.exists) {
    throw new HttpsError('not-found', 'Projeto não encontrado.');
  }

  const project = projectSnapshot.data() as Project;
  const isManager = await isPortalAdmin(uid, email) ||
    project.leaderUid === uid ||
    project.responsibleDirectorUid === uid ||
    (Array.isArray(project.teamMemberUids) && project.teamMemberUids.includes(uid));
  if (!isManager) {
    throw new HttpsError('permission-denied', 'Você não tem permissão para gerenciar este projeto.');
  }
  return { project, projectRef };
}

async function getDrive() {
  const auth = new google.auth.GoogleAuth({ scopes: [driveScope] });
  return google.drive({ version: 'v3', auth });
}

export const createProjectDocument = onCall(async request => {
  requireAuth(request.auth?.uid);
  const projectId = parseProjectId(request.data?.projectId);
  const kind = parseDocumentKind(request.data?.kind);
  const { project, projectRef } = await getProjectForManager(
    projectId,
    request.auth.uid,
    request.auth.token.email
  );
  const templateId = (kind === 'gdd' ? gddTemplateId.value() : scriptTemplateId.value()).trim();
  const folderId = driveFolderId.value().trim();
  if (!templateId || !folderId) {
    throw new HttpsError('failed-precondition', 'Os modelos e a pasta compartilhada da LAJE ainda não foram configurados.');
  }

  try {
    const drive = await getDrive();
    const copy = await drive.files.copy({
      fileId: templateId,
      supportsAllDrives: true,
      requestBody: {
        name: `${project.name || 'Projeto'} - ${kind === 'gdd' ? 'GDD' : 'Roteiro'}`,
        parents: [folderId]
      }
    });
    const documentId = copy.data.id;
    if (!documentId) {
      throw new Error('A API do Drive não retornou o ID do documento copiado.');
    }

    const url = `https://docs.google.com/document/d/${documentId}/edit`;
    await projectRef.update({
      [`${kind}DocumentId`]: documentId,
      [`${kind}Url`]: url
    });
    return { documentId, url };
  } catch (error) {
    const errorCode = typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : 'unknown';
    console.error('Falha ao criar documento do projeto no Drive.', { projectId, kind, errorCode });
    throw new HttpsError('internal', 'Não foi possível criar o documento no Drive. Verifique a configuração e o acesso da conta de serviço.');
  }
});

export const getProjectDocumentMarkdown = onCall(async request => {
  requireAuth(request.auth?.uid);
  const projectId = parseProjectId(request.data?.projectId);
  const kind = parseDocumentKind(request.data?.kind);
  const projectSnapshot = await db.doc(`projects/${projectId}`).get();
  if (!projectSnapshot.exists) {
    throw new HttpsError('not-found', 'Projeto não encontrado.');
  }

  const project = projectSnapshot.data() as Project;
  const documentUrl = project[`${kind}Url`];
  const documentId = documentUrl
    ? getDocumentId(documentUrl)
    : project[`${kind}DocumentId`] || null;
  if (!documentId) {
    throw new HttpsError('failed-precondition', 'Este projeto ainda não tem um documento Google válido.');
  }
  const folderId = driveFolderId.value().trim();
  if (!folderId) {
    throw new HttpsError('failed-precondition', 'A pasta compartilhada da LAJE ainda não foi configurada.');
  }

  try {
    const drive = await getDrive();
    const metadata = await drive.files.get({
      fileId: documentId,
      fields: 'id,mimeType,parents',
      supportsAllDrives: true
    });
    if (
      metadata.data.mimeType !== 'application/vnd.google-apps.document' ||
      !metadata.data.parents?.includes(folderId)
    ) {
      throw new HttpsError(
        'failed-precondition',
        'O GDD precisa ser um Google Docs dentro da pasta compartilhada da LAJE.'
      );
    }

    const exported = await drive.files.export(
      { fileId: documentId, mimeType: 'text/markdown' },
      { responseType: 'stream' }
    );
    const chunks: Buffer[] = [];
    for await (const chunk of exported.data) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return { markdown: Buffer.concat(chunks).toString('utf8') };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const errorCode = typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : 'unknown';
    console.error('Falha ao exportar GDD como Markdown.', { projectId, kind, errorCode });
    throw new HttpsError('internal', 'Não foi possível carregar o documento. Verifique o acesso da conta de serviço e tente novamente.');
  }
});
