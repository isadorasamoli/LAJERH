import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from './lib/firebase';
import { sendWelcomeEmail } from './lib/workspace';
import { initAuth, googleSignIn, logout, getAccessToken } from './lib/auth';
import { Terminal, LayoutDashboard, LogOut, Calendar as CalendarIcon, Moon, Sun, Settings, History, Gamepad2, HelpCircle, FileText, Home, UserRound, Trophy, BookOpen, Activity, Lightbulb } from 'lucide-react';
import Form from './components/Form';
import Dashboard from './components/Dashboard';
import CalendarTab from './components/CalendarTab';
import AdminSettings from './components/AdminSettings';
import AuditLogs from './components/AuditLogs';
import ProjectsHub from './components/ProjectsHub';
import DirectorioDoubts from './components/DirectorioDoubts';
import AdminAccessBlocked from './components/AdminAccessBlocked';
import ExtensionProjectsAdmin from './components/ExtensionProjectsAdmin';
import InformalProjects from './components/InformalProjects';
import HomePanel from './components/HomePanel';
import MemberPortfolio from './components/MemberPortfolio';
import ProjectHealth from './components/ProjectHealth';
import GameJams from './components/GameJams';
import ResourceLibrary from './components/ResourceLibrary';
import PublicShowcase from './components/PublicShowcase';
import PlaytestFeedbackForm from './components/PlaytestFeedbackForm';
import AttendanceCheckin from './components/AttendanceCheckin';
import { loadMyProfile } from './lib/portal';
import { toast } from 'react-hot-toast';

export type TabType = 'home' | 'form' | 'projects' | 'informal' | 'calendar' | 'jams' | 'resources' | 'portfolio' | 'doubts'
  | 'health' | 'dashboard' | 'extension' | 'logs' | 'settings';
export const ADMIN_TABS: TabType[] = ['health', 'dashboard', 'extension', 'logs', 'settings'];
const VALID_TABS: TabType[] = ['home', 'form', 'projects', 'informal', 'calendar', 'jams', 'resources', 'portfolio', 'doubts', 'health', 'dashboard', 'extension', 'logs', 'settings'];

type NavItem = { id: TabType; label: string; short?: string; icon: typeof Home };
const NAV_GROUPS: Array<{ title: string; adminOnly?: boolean; items: NavItem[] }> = [
  {
    title: 'Aplicações',
    items: [
      { id: 'home', label: 'Meu painel', icon: Home },
      { id: 'form', label: 'Formulário RH', short: 'Formulário', icon: Terminal },
      { id: 'projects', label: 'Projetos & Oportunidades', icon: Gamepad2 },
      { id: 'informal', label: 'Projetos Informais', icon: Lightbulb },
      { id: 'calendar', label: 'Calendário', icon: CalendarIcon },
      { id: 'jams', label: 'Game jams', icon: Trophy },
      { id: 'resources', label: 'Recursos', icon: BookOpen },
      { id: 'portfolio', label: 'Meu portfólio', icon: UserRound },
      { id: 'doubts', label: 'Dúvidas ao Diretório', icon: HelpCircle },
    ],
  },
  {
    title: 'Administração',
    adminOnly: true,
    items: [
      { id: 'health', label: 'Saúde dos projetos', icon: Activity },
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'extension', label: 'Projetos de Extensão', icon: FileText },
      { id: 'logs', label: 'Log de Alterações', short: 'Logs', icon: History },
      { id: 'settings', label: 'Administradores', icon: Settings },
    ],
  },
];

/**
 * Páginas que abrem sem login: #vitrine e #playtest/{id}.
 * #presenca/{eventoId}/{codigo} pede login e registra a presença depois.
 */
const getSpecialRoute = () => {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [name, a, b] = hash.split('/');
  if (name === 'vitrine') return { kind: 'showcase' as const };
  if (name === 'playtest' && a) return { kind: 'playtest' as const, id: a };
  if (name === 'presenca' && a && b) return { kind: 'attendance' as const, eventId: a, code: b };
  return null;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [specialRoute, setSpecialRoute] = useState(getSpecialRoute);

  useEffect(() => {
    const onHash = () => setSpecialRoute(getSpecialRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userLeagueRole, setUserLeagueRole] = useState<string>('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const getTabFromUrl = (): TabType | null => {
    try {
      const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase().trim();
      const validTabs = VALID_TABS;
      if (validTabs.includes(hash as TabType)) {
        return hash as TabType;
      }
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab')?.toLowerCase().trim();
      if (tabParam && validTabs.includes(tabParam as TabType)) {
        return tabParam as TabType;
      }
    } catch {
      // ignore
    }
    return null;
  };

  const sanitizeAndSetUrl = (tab: TabType) => {
    try {
      const cleanUrl = `${window.location.pathname}${tab !== 'home' ? `#${tab}` : ''}`;
      window.history.replaceState(null, '', cleanUrl);
    } catch {
      // ignore
    }
  };

  const handleTabChange = (targetTab: TabType) => {
    if (ADMIN_TABS.includes(targetTab)) {
      if (!isAdmin) {
        toast.error('Acesso restrito: Privilégios de administrador necessários.');
        setActiveTab('home');
        sanitizeAndSetUrl('home');
        return;
      }
    }
    setActiveTab(targetTab);
    sanitizeAndSetUrl(targetTab);
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const checkUserRoleAndTheme = async (currentUser: User) => {
      try {
        let adminStatus = false;
        const userEmail = currentUser.email?.toLowerCase().trim() || '';
        const isSuperAdminEmail = userEmail === 'isadora.mlima@ufpe.br' || userEmail === 'isadora.mlima@ufpe' || userEmail.startsWith('isadora.mlima@ufpe') || userEmail === 'isadorasdml@gmail.com';
        if (isSuperAdminEmail) {
          adminStatus = true;
        } else {
          const adminDoc = await getDoc(doc(db, 'admins', userEmail));
          adminStatus = adminDoc.exists() && adminDoc.data().email?.toLowerCase().trim() === userEmail;
        }
        setIsAdmin(adminStatus);

        // Cargo vem do cadastro da própria pessoa (busca pelo e-mail; ver loadMyProfile).
        const myProfile = await loadMyProfile(currentUser);
        const role = myProfile?.leagueRole || (isSuperAdminEmail ? 'RH' : '');
        setUserLeagueRole(role);
        const isRH = role.toLowerCase().includes('rh') || role.toLowerCase().includes('recursos humanos') || role.toLowerCase().includes('diretório') || role.toLowerCase().includes('diretoria') || isSuperAdminEmail;
        if (isRH) {
          adminStatus = true;
          setIsAdmin(true);
        }

        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        const currentData = userSnap.exists() ? userSnap.data() : {};
        if (currentData.theme) {
          setTheme(currentData.theme);
        }
        await setDoc(userRef, {
          ...currentData,
          isRH,
          isDiretorio: isRH,
          leagueRole: role,
          theme: currentData.theme || 'dark'
        }, { merge: true });
      } catch (err) {
        console.error("Failed to fetch user roles", err);
      }
    };

    const checkAndSendEmails = async (currentUser: User, currentToken: string) => {
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        const q = query(collection(db, 'events'), where('date', '>=', new Date().toISOString()), orderBy('date', 'asc'));
        const querySnapshot = await getDocs(q);
        const futureEvents = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));

        const userData = userSnap.exists() ? userSnap.data() : {};
        if (userData.hasReceivedWelcomeEmail !== true) {
          if (currentToken) {
            try {
              await sendWelcomeEmail(currentToken, currentUser.email || '', currentUser.displayName || 'Membro', futureEvents);
            } catch (e) {
              console.info("Boas-vindas por e-mail direto suprimido:", e);
            }
          }
          await setDoc(userRef, {
            ...userData,
            hasReceivedWelcomeEmail: true,
            lastEmailSentAt: Date.now(),
            theme: userData.theme || 'dark'
          }, { merge: true });
        }
      } catch (error) {
        console.error("Error processing emails:", error);
      }
    };

    const unsubscribe = initAuth(
      (u, t) => {
        setUser(u);
        setToken(t);
        setNeedsAuth(false);
        if (u) {
          checkUserRoleAndTheme(u);
          checkAndSendEmails(u, t);
        }
      },
      () => setNeedsAuth(true)
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const syncRouteWithPermissions = () => {
      const urlTab = getTabFromUrl();
      if (urlTab) {
        if (ADMIN_TABS.includes(urlTab)) {
          if (!isAdmin) {
            toast.error('Acesso restrito: Privilégios de administrador necessários.');
            setActiveTab('home');
            sanitizeAndSetUrl('home');
            return;
          }
        }
        setActiveTab(urlTab);
      } else {
        if (ADMIN_TABS.includes(activeTab) && !isAdmin) {
          setActiveTab('home');
          sanitizeAndSetUrl('home');
        }
      }
    };

    syncRouteWithPermissions();

    const handleUrlChange = () => {
      syncRouteWithPermissions();
    };

    window.addEventListener('hashchange', handleUrlChange);
    window.addEventListener('popstate', handleUrlChange);

    return () => {
      window.removeEventListener('hashchange', handleUrlChange);
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, [isAdmin]);

  // Se o estado de isAdmin for falso ou for revogado, forçar saída de abas administrativas imediatamente
  useEffect(() => {
    if (!isAdmin && ADMIN_TABS.includes(activeTab)) {
      setActiveTab('home');
      sanitizeAndSetUrl('home');
    }
  }, [isAdmin, activeTab]);

  const toggleTheme = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    if (user) {
      try {
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, { theme: newTheme }, { merge: true });
        toast.success(`Modo ${newTheme === 'dark' ? 'escuro' : 'claro'} ativado`);
      } catch (error) {
        console.error("Error updating theme", error);
      }
    }
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setToken(result.accessToken);
        setUser(result.user);
        setNeedsAuth(false);
        const userEmail = result.user.email?.toLowerCase().trim() || '';
        let adminStatus = false;
        const isSuperAdminEmail = userEmail === 'isadora.mlima@ufpe.br' || userEmail === 'isadora.mlima@ufpe' || userEmail.startsWith('isadora.mlima@ufpe');
        if (isSuperAdminEmail) {
          adminStatus = true;
        } else {
          const adminDoc = await getDoc(doc(db, 'admins', userEmail));
          adminStatus = adminDoc.exists() && adminDoc.data().email?.toLowerCase().trim() === userEmail;
        }
        setIsAdmin(adminStatus);

        // Cargo vem do cadastro da própria pessoa (busca pelo e-mail; ver loadMyProfile).
        const myProfile = await loadMyProfile(result.user);
        const role = myProfile?.leagueRole || '';
        setUserLeagueRole(role);
        const isRH = role.toLowerCase().includes('rh') || role.toLowerCase().includes('recursos humanos') || role.toLowerCase().includes('diretório') || role.toLowerCase().includes('diretoria') || isSuperAdminEmail;
        if (isRH) {
          adminStatus = true;
          setIsAdmin(true);
        }
        const userRef = doc(db, 'users', result.user.uid);
        await setDoc(userRef, { isRH, isDiretorio: isRH, leagueRole: role }, { merge: true });
      }
    } catch (err: any) {
      console.error('Login failed:', err);
      const messages: Record<string, string> = {
        'auth/unauthorized-domain': `Este domínio (${window.location.hostname}) ainda não foi autorizado no Firebase. Adicione-o em Authentication > Settings > Authorized domains.`,
        'auth/operation-not-allowed': 'O login com Google ainda não está habilitado no Firebase.',
        'auth/oauth-not-verified': 'Acesso bloqueado pelo Google: publique o consentimento OAuth ou adicione sua conta em Usuários de teste no Google Cloud Console.',
        'auth/popup-blocked': 'O navegador bloqueou a janela de login. Permita pop-ups para este site e tente novamente.',
        'auth/popup-closed-by-user': 'A janela de login foi fechada antes da conclusão.',
      };
      setLoginError(messages[err?.code] || 'Não foi possível entrar com o Google. Verifique o console do navegador para mais detalhes.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Páginas públicas: abrem com ou sem login.
  if (specialRoute?.kind === 'showcase') return <PublicShowcase />;
  if (specialRoute?.kind === 'playtest') return <PlaytestFeedbackForm playtestId={specialRoute.id} />;

  if (needsAuth) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-dark)] flex items-center justify-center text-[var(--color-ink)] font-sans">
        <div className="w-full max-w-md p-8 border border-[var(--color-ink-faint)] bg-[rgba(255,255,255,0.02)] transition-colors">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-20 h-20 flex items-center justify-center">
              <img
                src="./laje.png"
                alt="Logo LAJE"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h1 className="font-['Syne'] text-[1.8rem] uppercase font-bold tracking-[-0.04em] mb-2 text-[var(--color-ink)]">Laje RH</h1>
              <p className="font-['Space_Mono'] uppercase tracking-[0.1em] text-[0.7rem] text-[var(--color-ink-muted)]">Acesso Restrito ao Portal</p>
              <p className="mt-4 text-sm leading-6 text-[var(--color-ink-muted)]">
                Portal administrativo da Liga Acadêmica de Jogos Eletrônicos da UFPE para cadastro de membros,
                gestão de projetos, eventos e comunicação interna da LAJE.
              </p>
            </div>
            
            <button 
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-3 bg-[var(--color-ink-faint)] hover:bg-[rgba(255,255,255,0.1)] border-none text-[var(--color-ink)] py-3 px-4 transition-all duration-200 font-bold disabled:opacity-50 cursor-pointer"
            >
              <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center">
                <svg viewBox="0 0 48 48" className="w-4 h-4">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  <path fill="none" d="M0 0h48v48H0z"></path>
                </svg>
              </div>
              {isLoggingIn ? 'Autenticando...' : 'ENTRAR COM GOOGLE'}
            </button>
            {loginError && (
              <p className="w-full text-left text-sm text-red-400" role="alert">
                {loginError}
              </p>
            )}
            <nav className="flex items-center justify-center gap-5 text-xs text-[var(--color-ink-muted)]">
              <a href="/privacy.html" className="hover:text-[var(--color-ink)] underline underline-offset-4">
                Política de Privacidade
              </a>
              <a href="/terms.html" className="hover:text-[var(--color-ink)] underline underline-offset-4">
                Termos de Serviço
              </a>
            </nav>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-hidden grid grid-cols-1 md:grid-cols-[240px_1fr] grid-rows-[auto_1fr] bg-[var(--color-bg-dark)] text-[var(--color-ink)]">
      <header className="col-span-full px-8 py-4 border-b border-[var(--color-ink-faint)] flex justify-between items-center bg-[rgba(12,12,14,0.8)] backdrop-blur-md z-[100]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 flex items-center justify-center">
            <img
              src="./laje.png"
              alt="Logo LAJE"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-[1.2rem] font-['Syne'] font-bold tracking-[-0.04em] text-[var(--color-ink)] uppercase">Laje RH</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[var(--color-accent)] font-['Space_Mono'] text-[0.75rem] hidden sm:inline-block uppercase tracking-[0.1em]">{user?.email}</span>
          <div className="flex items-center gap-3">
            <button 
              onClick={logout}
              className="bg-transparent border-none cursor-pointer text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] flex items-center gap-1.5 font-medium text-[0.85rem] transition-colors"
            >
              <LogOut size={18} />
              Sair
            </button>
          </div>
        </div>
      </header>

      <aside className="hidden md:flex border-r border-[var(--color-ink-faint)] py-8 px-4 flex-col gap-1 overflow-y-auto">
        {NAV_GROUPS.filter(group => !group.adminOnly || isAdmin).map(group => (
          <div key={group.title} className="flex flex-col gap-1 mb-4">
            <div className="font-['Space_Mono'] uppercase tracking-[0.1em] text-[0.7rem] mb-2 px-4 opacity-50">{group.title}</div>
            {group.items.map(item => (
              <button
                key={item.id}
                onClick={() => handleTabChange(item.id)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-md font-medium text-[0.9rem] transition-all w-full text-left border-none cursor-pointer ${
                  activeTab === item.id
                    ? 'bg-[var(--color-ink-faint)] text-[var(--color-ink)]'
                    : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[rgba(255,255,255,0.03)]'
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </aside>

      <main className="app-main p-8 overflow-y-auto bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.05),transparent_40%)]">
        {/* Navegação compacta para telas menores */}
        <nav className="flex md:hidden flex-wrap gap-2 mb-8 pb-2">
          {NAV_GROUPS.filter(group => !group.adminOnly || isAdmin).flatMap(group => group.items).map(item => (
            <button
              key={item.id}
              onClick={() => handleTabChange(item.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
                activeTab === item.id
                  ? 'bg-[var(--color-ink-faint)] text-[var(--color-ink)]'
                  : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] bg-[rgba(255,255,255,0.03)]'
              }`}
            >
              {item.short || item.label}
            </button>
          ))}
        </nav>

        <div className="w-full">
          {specialRoute?.kind === 'attendance' && user && (
            <AttendanceCheckin
              user={user}
              eventId={specialRoute.eventId}
              code={specialRoute.code}
              onDone={() => { window.history.replaceState(null, '', window.location.pathname); setSpecialRoute(null); handleTabChange('portfolio'); }}
            />
          )}
          {specialRoute?.kind !== 'attendance' && <>
          {activeTab === 'home' && user && <HomePanel user={user} isAdmin={isAdmin} onNavigate={tab => handleTabChange(tab)} />}
          {activeTab === 'portfolio' && user && <MemberPortfolio user={user} />}
          {activeTab === 'jams' && user && <GameJams user={user} isAdmin={isAdmin} />}
          {activeTab === 'resources' && user && <ResourceLibrary user={user} isAdmin={isAdmin} />}
          {activeTab === 'health' && isAdmin && <ProjectHealth />}
          {activeTab === 'form' && <Form user={user} token={token || ''} />}
          {activeTab === 'projects' && (() => {
            const currentEmail = user?.email?.toLowerCase().trim() || '';
            const isSuper = currentEmail === 'isadora.mlima@ufpe.br' || currentEmail === 'isadora.mlima@ufpe' || currentEmail.startsWith('isadora.mlima@ufpe') || currentEmail === 'isadorasdml@gmail.com';
            const isRHUser = isSuper || userLeagueRole.toLowerCase().includes('rh') || userLeagueRole.toLowerCase().includes('recursos humanos') || userLeagueRole.toLowerCase().includes('diretório') || userLeagueRole.toLowerCase().includes('diretoria');
            return (
              <ProjectsHub 
                isAdmin={isAdmin} 
                isSuperAdmin={isSuper}
                isRH={isRHUser}
                currentUserEmail={user?.email || ''} 
                currentUserName={user?.displayName || user?.email?.split('@')[0] || 'Membro'} 
                currentUserRole={userLeagueRole}
                token={token || ''}
              />
            );
          })()}
          {activeTab === 'informal' && user && <InformalProjects user={user} isAdmin={isAdmin} />}
          {activeTab === 'calendar' && <CalendarTab isAdmin={isAdmin} token={token || ''} />}
          {activeTab === 'doubts' && (() => {
            const currentEmail = user?.email?.toLowerCase().trim() || '';
            const isSuper = currentEmail === 'isadora.mlima@ufpe.br' || currentEmail === 'isadora.mlima@ufpe' || currentEmail.startsWith('isadora.mlima@ufpe') || currentEmail === 'isadorasdml@gmail.com';
            const isRHUser = isSuper || userLeagueRole.toLowerCase().includes('rh') || userLeagueRole.toLowerCase().includes('recursos humanos') || userLeagueRole.toLowerCase().includes('diretório') || userLeagueRole.toLowerCase().includes('diretoria');
            return (
              <DirectorioDoubts
                isAdmin={isAdmin}
                isSuperAdmin={isSuper}
                isRH={isRHUser}
                currentUserEmail={user?.email || ''}
                currentUserName={user?.displayName || user?.email?.split('@')[0] || 'Membro'}
                currentUserUid={user?.uid || ''}
                currentUserRole={userLeagueRole}
                token={token || ''}
              />
            );
          })()}
          
          {activeTab === 'dashboard' && (() => {
            const currentEmail = user?.email?.toLowerCase().trim() || '';
            const isSuper = currentEmail === 'isadora.mlima@ufpe.br' || currentEmail === 'isadora.mlima@ufpe' || currentEmail.startsWith('isadora.mlima@ufpe') || currentEmail === 'isadorasdml@gmail.com';
            const isRHUser = isSuper || userLeagueRole.toLowerCase().includes('rh') || userLeagueRole.toLowerCase().includes('recursos humanos') || userLeagueRole.toLowerCase().includes('diretório') || userLeagueRole.toLowerCase().includes('diretoria');
            return isAdmin ? (
              <Dashboard 
                isAdmin={isAdmin} 
                isSuperAdmin={isSuper}
                isRH={isRHUser}
                currentUserEmail={user?.email || ''}
                currentUserName={user?.displayName || user?.email?.split('@')[0] || 'Administrador'}
                currentUserUid={user?.uid || ''}
                onNavigateTab={handleTabChange} 
              />
            ) : (
              <AdminAccessBlocked 
                title="Acesso Restrito: Dashboard" 
                onNavigateHome={() => handleTabChange('form')} 
              />
            );
          })()}

          {activeTab === 'extension' && (
            isAdmin ? <ExtensionProjectsAdmin /> : (
              <AdminAccessBlocked
                title="Acesso Restrito: Projetos de Extensão"
                onNavigateHome={() => handleTabChange('form')}
              />
            )
          )}

          {activeTab === 'logs' && (
            isAdmin ? (
              <AuditLogs 
                isAdmin={isAdmin} 
                currentUserEmail={user?.email || ''} 
                onNavigateHome={() => handleTabChange('form')} 
              />
            ) : (
              <AdminAccessBlocked 
                title="Acesso Restrito: Log de Alterações" 
                onNavigateHome={() => handleTabChange('form')} 
              />
            )
          )}

          {activeTab === 'settings' && (
            isAdmin ? (
              <AdminSettings 
                isAdmin={isAdmin} 
                onNavigateHome={() => handleTabChange('form')} 
              />
            ) : (
              <AdminAccessBlocked
                title="Acesso Restrito: Administradores"
                onNavigateHome={() => handleTabChange('form')}
              />
            )
          )}
          </>}
        </div>
      </main>
    </div>
  );
}
