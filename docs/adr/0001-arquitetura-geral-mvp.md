# ADR-0001: Arquitetura geral do MVP

**Status:** Aceita (2026-08-25)

## Contexto

O Personal Assistant tinha, até este ponto, apenas um protótipo de UX
front-end puro (`prototype/index.html`, `mobile.html`, `desktop.html`,
`assets/`), sem backend, sem persistência e sem IA real. O objetivo agora é
sair do protótipo para um MVP funcional de ponta a ponta: captura no
celular (com funcionamento offline), sincronização, transcrição e
interpretação por IA na nuvem, e revisão/confirmação humana no desktop
antes de qualquer persistência oficial.

O pedido original orienta explicitamente a usar como referência o padrão de
desenvolvimento já praticado no AgroMind (`C:\Source\AgroMind`): backend
Node/Express/Sequelize/PostgreSQL em camadas, frontend Vue/Vite, Docker
Compose separado por ambiente, ADRs numeradas, e testes com o runner nativo
do Node — sem copiar cegamente a estrutura, só os princípios que fazem
sentido aqui.

## Decisão

- **Monorepo** com `backend/` e `frontend/` como projetos irmãos (mesmo
  padrão do AgroMind), mais `docs/` (com `adr/`) e `docker/` na raiz.
- **Backend**: Node.js + Express, API REST sob `/api/v1`, `/health` fora do
  prefixo (não é recurso de domínio). Camadas: `controllers` (parsing de
  request/response) → `services` (regra de negócio) → `repositories`
  (acesso a dados via Sequelize) → `models`. Logger estruturado (`pino`),
  middleware central de tratamento de erros, validação de entrada nos
  controllers.
- **Banco de dados**: PostgreSQL, acessado via Sequelize + `sequelize-cli`
  para migrations. Migrations são a fonte da verdade do schema (nunca
  `sequelize.sync()`), UUID como chave primária **gerado na aplicação**
  (`crypto.randomUUID()`), tabelas e colunas em `snake_case`, `created_at`/
  `updated_at` em toda tabela — mesmas convenções do AgroMind.
- **Frontend**: Vue 3 (Composition API, `<script setup>`) + Vite, um único
  app responsivo e instalável como PWA (decisão detalhada na ADR-0003).
  Camada de serviços HTTP sempre separada da UI.
- **Testes**: `node:test` (runner nativo do Node) no backend, sem framework
  de teste como dependência — mesmo padrão do AgroMind. Cobertura focada
  nas áreas críticas listadas no pedido (idempotência de sincronização,
  separação IA/persistência, etc.), não em cobertura artificial.
- **Docker**: dois arquivos Compose, um propósito cada —
  `docker/compose.dev.yml` (infraestrutura de apoio ao desenvolvimento
  local: Postgres) e `docker/compose.prod.yml` (Postgres + backend +
  frontend containerizados, prontos para publicação). Mesmo raciocínio do
  ADR-0008 do AgroMind.
- **Modelo de dados deliberadamente mínimo e provisório** (ADR-0008 deste
  projeto) — sem tentar antecipar o sistema legado do personal trainer.

## Alternativas consideradas

- **Réplicar a estrutura do AgroMind ao pé da letra**, incluindo PrimeVue no
  frontend e a mesma árvore de `collectors`/`jobs`. Rejeitada — o Personal
  Assistant não é uma plataforma de coleta de dados; copiar estrutura sem
  necessidade real geraria pastas vazias e dependências sem uso (o próprio
  `CLAUDE.md` do AgroMind proíbe isso). Reaproveitamos só os princípios
  (camadas, convenções de banco, ADRs, testes) que fazem sentido aqui.
- **Uma stack diferente (ex.: NestJS, Prisma, Next.js).** Rejeitada — sem
  motivo técnico para divergir da stack já validada em produção pelo
  usuário no AgroMind, e o pedido original já direciona para
  Node/Express/Vue.

## Consequências

- Curva de aprendizado baixa para quem já trabalha no AgroMind — mesmas
  convenções de banco, mesma forma de rodar testes, mesmo raciocínio de
  Docker dev/prod.
- Toda decisão de modelo de dados deste MVP é assumidamente provisória
  (ver ADR-0008) — refatorações de schema são esperadas quando o sistema
  legado for analisado.
- Nenhuma infraestrutura de coleta/job pipeline do AgroMind é reaproveitada
  diretamente; o pipeline de IA deste projeto tem desenho próprio (ver
  ADR-0006 e ADR-0009).
