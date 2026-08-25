# ADR-0003: Frontend único responsivo com PWA (sem PrimeVue)

**Status:** Aceita (2026-08-25)

## Contexto

O protótipo existe como dois HTMLs separados e independentes —
`mobile.html` (captura) e `desktop.html` (gestão/validação) — cada um com
seu próprio CSS e JS, sem nada em comum além do arquivo de dados mock
(`assets/data.js`). A seção 8 do pedido de implementação, porém, descreve
**um** frontend: "Vue.js, Vite, arquitetura de componentes organizada,
aplicação responsiva, PWA" — no singular.

Isso é uma decisão real de arquitetura (duas aplicações separadas vs. uma
única aplicação com duas experiências), com impacto direto em autenticação,
camada de serviços HTTP, build e deploy — por isso vira ADR em vez de ser
assumida silenciosamente.

## Decisão

- **Um único app Vue 3 + Vite**, instalável como PWA, com dois grupos de
  rotas:
  - `/captura/*` — experiência mobile-first, otimizada para uso durante o
    treino (poucos toques, foco em iniciar/gravar/finalizar Registro),
    funciona offline.
  - `/admin/*` — experiência desktop, painel de gestão e validação
    (dashboard, alunos, revisão da IA, histórico, configurações).
  - `/login` — autenticação, comum aos dois modos.
- Autenticação (token JWT), camada de serviços HTTP (`src/services/`) e
  design tokens são **compartilhados** entre os dois modos — evita duplicar
  lógica de sessão e chamadas de API em dois códigos-fonte separados.
- O manifesto da PWA (`vite-plugin-pwa`) aponta `start_url` para `/captura`
  — é a experiência pensada para ser "instalada" e usada em campo; o modo
  `/admin` continua acessível pelo mesmo app, mas não é o ponto de entrada
  da instalação.
- **Sem PrimeVue** (diferente da ADR-0009 do AgroMind). O protótipo já
  define e valida uma linguagem visual própria (`assets/style.css`,
  `mobile.css`, `desktop.css`) — os componentes Vue portam esses estilos
  diretamente para SFCs, em vez de adotar uma biblioteca de componentes que
  imporia sua própria estética por cima do que já foi aprovado pelo
  usuário. O pedido também é explícito em "preservar a UX do protótipo".
- **Pinia desde o início** (também diferente da decisão inicial do
  AgroMind). Ao contrário do AgroMind na época da ADR-0009 — que não tinha
  nenhum caso real de estado compartilhado —, este projeto já nasce com
  dois casos reais e imediatos: sessão do usuário autenticado (usada nos
  dois modos) e estado da fila de sincronização offline (usado no modo
  captura, mas precisa sobreviver a navegação entre telas). O critério do
  AgroMind ("Pinia entra quando o primeiro caso real existir") continua
  válido — aqui o primeiro caso já existe no dia 1.

## Alternativas consideradas

- **Dois apps Vue separados** (um para captura, outro para admin), espelhando
  os dois HTMLs do protótipo. Rejeitada — contradiz a redação da seção 8
  ("aplicação responsiva", singular) e duplicaria autenticação, cliente
  HTTP e build/deploy sem benefício real: as duas experiências não têm
  requisitos de infraestrutura tão diferentes a ponto de justificar dois
  projetos (a única real assimetria — offline — fica isolada em
  `src/offline/`, usada só pelas rotas de captura).
- **PrimeVue**, para ficar consistente com o AgroMind. Rejeitada — a UX do
  protótipo já está desenhada e aprovada; adotar uma lib de componentes
  agora significaria redesenhar em cima dela ou brigar com o tema padrão
  para replicar o visual já validado, trabalho maior do que portar o CSS
  existente.
- **PWA cobrindo também o modo `/admin`** com cache agressivo de API.
  Rejeitada por ora — a validação humana no desktop é um fluxo online por
  natureza (revisar, corrigir e confirmar contra dados atualizados do
  servidor); cachear respostas de API ali criaria risco de o personal
  confirmar em cima de dado desatualizado. O service worker faz apenas
  precache do app shell, não das respostas de API.

## Consequências

- Um único `package.json`/build/deploy de frontend, um único domínio de
  autenticação.
- `src/offline/` (IndexedDB, fila de sincronização, gravador de áudio) é
  código exclusivo do modo `/captura` — o modo `/admin` nunca depende dele.
- Nenhuma dependência de biblioteca de componentes; os componentes de UI
  (botões, badges, cards, sheets) são escritos à mão a partir do CSS do
  protótipo, o que dá controle total sobre a fidelidade visual mas exige
  manter esses componentes por conta própria (sem correções/atualizações de
  terceiros).
- Pinia é dependência desde o primeiro commit do frontend, não uma adição
  posterior.
