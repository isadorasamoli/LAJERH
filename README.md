# LAJE RH

Portal interno da Liga Acadêmica de Jogos Eletrônicos. O sistema reúne o cadastro dos membros, o acompanhamento do RH, o calendário e a organização dos projetos da liga.

## O que existe aqui

- Formulário de cadastro e atualização de dados dos membros;
- Formulário de projetos de extensão com exportação acadêmica em PDF;
- Dashboard administrativo com filtros, aniversários e exportação de relatórios;
- Catálogo de projetos, vagas e tarefas pontuais;
- Calendário de eventos;
- Registro de alterações para a diretoria;
- Controle de administradores com Firebase Authentication e Firestore.

## Desenvolvimento

```bash
npm install
npm run dev
```

O build de produção pode ser conferido com `npm run build`. As configurações do Firebase ficam nas variáveis usadas por `src/lib/firebase.ts`.

## Deploy no Render

Este projeto está configurado como um **Static Site** no Render:

- **Build command:** `npm ci && npm run build`
- **Publish directory:** `dist`

Se você preferir criar o serviço manualmente no painel do Render, use as mesmas opções acima. O arquivo [`render.yaml`](./render.yaml) já deixa essa configuração pronta para importação automática.

Para navegação do lado do cliente funcionar corretamente em rotas internas, o projeto também inclui [`public/_redirects`](./public/_redirects) com fallback para `index.html`.

## Configuração do login com Google

O login usa o projeto Firebase `gen-lang-client-0083667359` e solicita acesso ao Gmail. A criação e leitura dos documentos do projeto é feita no servidor pelo Firebase Functions.

1. No Firebase Console, habilite **Google** em Authentication > Sign-in method.
2. Em Authentication > Settings > Authorized domains, adicione o domínio em que o site está hospedado (por exemplo, o domínio `.onrender.com` ou o domínio personalizado).
3. No Google Cloud Console, abra o projeto cujo número é `596328139785` e configure APIs & Services > OAuth consent screen.
4. Enquanto o aplicativo estiver em modo de teste, adicione todas as contas que devem entrar em **Test users**. Para liberar o acesso a usuários externos, defina o status de publicação como produção e conclua a verificação quando exigida pelos escopos solicitados.
5. Em Credentials, confirme que o cliente OAuth `596328139785-b6h53tm4495gcqp1bvadoa65edle5ee6.apps.googleusercontent.com` possui como origem JavaScript o domínio do Firebase e o domínio real do site. Para o popup do Firebase, confirme também o redirecionamento `https://gen-lang-client-0083667359.firebaseapp.com/__/auth/handler`.

Se a tela continuar bloqueando o acesso depois disso, o escopo do Gmail exigido pelo aplicativo precisa ser aprovado na tela de consentimento OAuth ou o usuário precisa permanecer na lista de testes.

## Workspace dos projetos e Google Drive

O workspace usa Firebase Functions para criar documentos a partir dos modelos da LAJE e exportar o GDD em Markdown. A conta de serviço da função acessa a pasta compartilhada; nenhuma chave privada ou escopo do Drive é enviado ao navegador.

1. Habilite a Google Drive API no projeto Google Cloud associado ao Firebase.
2. Crie os modelos de GDD e roteiro na pasta compartilhada da LAJE. Compartilhe a pasta com a identidade de runtime do Firebase Functions com permissão para criar arquivos e conceda a ela o papel `Cloud Datastore User` no projeto Firebase.
3. Instale o Firebase CLI, selecione o projeto correto (`gen-lang-client-0083667359`) e rode `npm --prefix functions install` e `npm --prefix functions run build`.
4. Rode `firebase deploy --only functions,firestore:rules`. Na primeira implantação, informe os IDs da pasta compartilhada e dos modelos quando o Firebase solicitar os parâmetros `LAJE_DRIVE_FOLDER_ID`, `LAJE_GDD_TEMPLATE_ID` e `LAJE_SCRIPT_TEMPLATE_ID`.
5. Configure `VITE_LAJE_FUNCTIONS_REGION` no ambiente de build do Render se a função não estiver em `us-central1`.

As funções e as regras apontam para o banco Firestore nomeado `ai-studio-c7ee8b41-8fd4-4036-af2a-f7dd4640756a` usado pelo app. Documentos GDD já existentes precisam estar diretamente nessa pasta compartilhada para serem exibidos pelo portal. O líder, a diretoria responsável e a equipe precisam ser associados a contas de membros no formulário do projeto para receber permissões. Projetos antigos sem esses UIDs continuam editáveis por administradores até que a diretoria os associe. A função usa a identidade de runtime do Firebase; não baixe nem adicione chaves JSON de service account ao repositório.

## Autoria

Isadora Lima
