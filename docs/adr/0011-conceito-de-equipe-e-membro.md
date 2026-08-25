# ADR-0011: Conceito de Equipe e Membro (multi-tenancy simples)

**Status:** Aceita (2026-08-25)

## Contexto

O Personal Assistant vai atender vários personal trainers, não um só. Até
aqui o sistema era single-tenant: `usuario` era o único limite de escopo —
`aluno.usuario_id` e `registro.usuario_id` isolavam os dados por personal
individual, o JWT só carregava `sub` (id do usuário), e o CLAUDE.md listava
"multi-tenant complexo" explicitamente como fora de escopo do MVP.

Esta ADR registra a decisão explícita e deliberada de trazer multi-tenancy
para dentro do MVP agora, representada no produto como **Equipe** (o
tenant) e **Membro** (a associação entre um usuário e uma equipe, com um
papel). A estrutura de dados e autenticação precisa nascer ciente desse
conceito desde já, mesmo que a interface de gestão de equipe permaneça
mínima por enquanto (só exibição, sem tela de convite/CRUD de membros).

## Decisão

- **`equipe`**: tabela nova, só `id` + `nome`. É o tenant — todo dado de
  domínio (`aluno`, `registro`) passa a ser compartilhado entre os membros
  de uma equipe, não mais isolado por usuário individual.
- **`membro`**: tabela de junção nova (`equipe_id` + `usuario_id` +
  `papel`), mesmo sendo **1:1 hoje** (um usuário pertence a exatamente uma
  equipe, via `UNIQUE(usuario_id)`). Modelada como junção deliberadamente,
  não como uma coluna `equipe_id` direto em `usuario`, para que suportar
  várias equipes por usuário no futuro seja só remover essa constraint —
  sem migração estrutural.
- **`papel`** (`owner` | `colaborador`) é gravado em `membro` e propagado
  para o JWT (`equipeId`, `papel`), mas **nenhuma autorização é aplicada
  por papel nesta entrega** — qualquer membro de uma equipe pode fazer tudo
  dentro dos dados dessa equipe (capturar, revisar, confirmar). Esta é a
  limitação mais importante desta ADR: o dado já existe, o enforcement não.
  Fica registrado como trabalho futuro esperado, não como esquecimento.
- **`aluno.usuario_id` é substituído por `aluno.equipe_id`** — um aluno
  passa a pertencer à equipe, visível a todos os seus membros. O campo
  antigo é removido, não mantido como auditoria: nunca foi usado para
  "quem cadastrou o aluno" em nenhuma tela, e mantê-lo numa entidade agora
  compartilhada pela equipe seria enganoso (de qual membro seria a posse?).
- **`registro.equipe_id` é adicionado ao lado de `registro.usuario_id`**
  (que continua existindo, inalterado) — mesmo padrão de redundância que
  `registro` já tinha entre `aluno_id` e `usuario_id`. `equipe_id` vira a
  chave de escopo/autorização; `usuario_id` passa a significar só "quem
  capturou este Registro" (auditoria), deixando de ser usado para checagem
  de posse.
- **`validacao.usuario_id` não muda.** Continua sendo "quem confirmou",
  exigido pela ADR-0007. Não ganha `equipe_id` próprio — é alcançável via
  `registro.equipe_id` quando necessário.
- **Provisionamento continua só via CLI** (`scripts/criar-usuario.js`),
  sem cadastro público e sem tela nova de gestão de equipe — ganha dois
  modos: criar uma equipe nova (primeiro membro, papel `owner`) ou entrar
  numa equipe existente identificada pelo e-mail de um membro já existente
  (papel `colaborador`).

## Alternativas consideradas

- **`equipe_id` direto em `usuario`** (sem tabela `membro`). Rejeitada:
  resolveria o caso 1:1 de hoje, mas exigiria uma migração estrutural
  quebrando compatibilidade no dia em que um usuário precisar pertencer a
  mais de uma equipe — a tabela de junção custa pouco agora e evita essa
  reescrita depois.
- **Suportar N:N (usuário em várias equipes) desde já**, com seletor de
  "equipe ativa" na interface. Rejeitada por ora — não há necessidade de
  produto hoje, e adicionaria uma superfície de UI (troca de equipe) que
  não foi pedida. A tabela `membro` já deixa esse caminho pronto para
  quando for preciso: basta remover a constraint de unicidade.
- **Aplicar controle de acesso por papel já nesta entrega** (ex.: só
  `owner` acessa `/admin` ou confirma registros). Rejeitada — decisão
  explícita de manter esta entrega focada em estrutura de dados, não em
  regras de autorização; fica para uma ADR futura quando houver critério
  de produto definido sobre o que cada papel pode fazer.
- **Tela de gestão de equipe/membro no `/admin` já nesta entrega**
  (convidar, remover, trocar papel). Rejeitada — consistente com o
  princípio deste MVP de não construir interface além do necessário; o
  CLI já resolve o provisionamento real hoje.

## Consequências

- Todo código que escopava dados por `usuario_id` precisou ser reauditado:
  `aluno.repository.js`, `registro.repository.js`, `registro.service.js`,
  `registro-confirmacao.service.js`, `registro-sync.service.js`,
  `auth.middleware.js`, `auth.service.js`, e os controllers que liam
  `req.usuarioId` para fins de escopo — todos passam a usar `req.equipeId`.
- Bases de dados existentes (dev seed ou produção) precisam de uma
  migração de dados: para cada `usuario` já existente, gera-se uma
  `equipe` e um `membro` (`papel: owner`) automaticamente, antes de
  `aluno`/`registro` ganharem `equipe_id` obrigatório.
- O CLAUDE.md deixa de listar "multi-tenant complexo" como fora de escopo;
  passa a listar especificamente "múltiplas equipes por usuário e controle
  de acesso por papel" como o que ainda falta — multi-tenancy básica não
  está mais fora de escopo, só suas variantes mais complexas.
- Login (`POST /api/v1/auth/login`) muda de forma: `usuario` na resposta
  ganha `equipe` e `papel`; o JWT ganha `equipeId`/`papel` além de `sub`.
  Qualquer client dessa API (o próprio frontend) precisa ler o novo campo
  para exibir o nome da equipe.
