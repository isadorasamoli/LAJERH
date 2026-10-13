# LAJE RH

Portal interno da Liga Acadêmica de Jogos Eletrônicos. O sistema reúne o cadastro dos membros, o acompanhamento do RH, o calendário e a organização dos projetos da liga.

## O que existe aqui

- Formulário de cadastro e atualização de dados dos membros;
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

## Autoria

Isadora Lima
