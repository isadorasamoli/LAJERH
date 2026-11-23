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

O login usa o projeto Firebase `gen-lang-client-0083667359` e solicita acesso ao Drive e ao Gmail.

1. No Firebase Console, habilite **Google** em Authentication > Sign-in method.
2. Em Authentication > Settings > Authorized domains, adicione o domínio em que o site está hospedado (por exemplo, o domínio `.onrender.com` ou o domínio personalizado).
3. No Google Cloud Console, abra o projeto cujo número é `596328139785` e configure APIs & Services > OAuth consent screen.
4. Enquanto o aplicativo estiver em modo de teste, adicione todas as contas que devem entrar em **Test users**. Para liberar o acesso a usuários externos, defina o status de publicação como produção e conclua a verificação quando exigida pelos escopos solicitados.
5. Em Credentials, confirme que o cliente OAuth `596328139785-b6h53tm4495gcqp1bvadoa65edle5ee6.apps.googleusercontent.com` possui como origem JavaScript o domínio do Firebase e o domínio real do site. Para o popup do Firebase, confirme também o redirecionamento `https://gen-lang-client-0083667359.firebaseapp.com/__/auth/handler`.

Se a tela continuar bloqueando o acesso depois disso, os escopos Drive/Gmail exigidos pelo aplicativo precisam ser aprovados na tela de consentimento OAuth ou o usuário precisa permanecer na lista de testes.

## Autoria

Isadora Lima
