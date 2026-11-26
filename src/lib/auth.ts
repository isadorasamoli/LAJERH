import { signInWithPopup, onAuthStateChanged, User, GoogleAuthProvider } from 'firebase/auth';
import { auth, provider } from './firebase';

const TOKEN_STORAGE_KEY = 'laje_gmail_token';
let isSigningIn = false;
let cachedAccessToken: string | null = typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_STORAGE_KEY) : null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (!cachedAccessToken && typeof window !== 'undefined') {
        cachedAccessToken = sessionStorage.getItem(TOKEN_STORAGE_KEY);
      }
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken || '');
    } else {
      cachedAccessToken = null;
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      }
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedAccessToken = credential?.accessToken || '';
    if (cachedAccessToken && typeof window !== 'undefined') {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, cachedAccessToken);
    }
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (error.code === 'auth/popup-closed-by-user') {
      return null;
    }
    const details = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
    if (
      details.includes('não concluiu o processo de verificação') ||
      details.includes('verification') ||
      details.includes('access_denied') ||
      details.includes('acesso bloqueado')
    ) {
      const verificationError = new Error(
        'O projeto OAuth do Google ainda não está aprovado ou sua conta não foi adicionada como usuário de teste.'
      );
      (verificationError as any).code = 'auth/oauth-not-verified';
      throw verificationError;
    }
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (!cachedAccessToken && typeof window !== 'undefined') {
    cachedAccessToken = sessionStorage.getItem(TOKEN_STORAGE_KEY);
  }
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  }
};
