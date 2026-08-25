# Personal Assistant — Memória do Projeto

## O que é o Personal Assistant

Aplicação para ajudar Personal Trainers a reduzir o trabalho operacional de
preenchimento de informações. O personal fala (ou digita) o que aconteceu
no treino/avaliação de um aluno; a IA transcreve, interpreta e estrutura os
dados; o personal revisa e confirma. Nunca o contrário — a IA nunca decide
sozinha o que vira dado oficial.

Fluxo central do produto:

```text
Personal → inicia um Registro → adiciona áudios e/ou textos → finaliza
  → sincronização → IA interpreta → dados estruturados
  → personal revisa → confirma → sistema persiste
```

## Conceito de Registro (não usar "Bloco")

**Registro** é a unidade de contexto do produto — um agrupador de quantas
entradas (áudio e/ou texto) o personal quiser capturar, processadas em
conjunto pela IA. "Bloco" foi o nome usado durante o protótipo; está
descontinuado. Nunca reintroduzir esse termo em código, UI ou documentação
novos.

- Fluxo: **iniciar Registro → adicionar entradas → finalizar Registro.**
  Depois de finalizado, o Registro não é mais editável no cliente.
- `registro.id` é **gerado no cliente** (`crypto.randomUUID()`) no momento
  de iniciar — é a chave de idempotência de toda a sincronização.
- Estados **locais** (só no dispositivo, nunca no servidor): `local`,
  `aguardando_sincronizacao`, `sincronizando`.
- Estados de **servidor** (`registro.status`): `recebido → transcrevendo →
  interpretando → aguardando_revisao → confirmado` (+ `erro_transcricao` /
  `erro_interpretacao`, retomáveis).

Detalhes e alternativas consideradas: `docs/adr/0002-conceito-de-registro.md`.

## Funcionamento offline (celular)

O app de captura funciona 100% offline: abrir, selecionar aluno, iniciar
Registro, gravar áudio, adicionar texto, finalizar — tudo sem rede. Dados
ficam em IndexedDB (metadados do Registro + Blob de áudio bruto em stores
separados). **Nenhuma transcrição acontece no dispositivo** — só depois da
sincronização, na nuvem.

Sincronização: fila própria baseada no status local dos Registros (sem
Background Sync do navegador), um Registro por requisição
(`multipart/form-data`, atômico), idempotente pelo `registro.id`. Ver
`docs/adr/0004-armazenamento-offline-cliente.md` e
`docs/adr/0005-estrategia-sincronizacao.md`.

## Processamento de IA

Depois de sincronizado, o pipeline roda **fora** do ciclo da requisição
HTTP (fila em processo, `docs/adr/0009-processamento-assincrono-em-
processo.md`):

```text
Registro (áudios + textos, na ordem de captura)
  → transcrição de cada áudio (Gemini)
  → contexto consolidado (texto + transcrições, ordem original)
  → interpretação (Gemini, saída estruturada)
  → resultado_ia (proposta, NUNCA dado oficial)
```

Provedor: **Google Gemini** (`@google/genai`) para os dois passos —
transcrição e interpretação — decisão registrada em
`docs/adr/0006-provedor-ia-gemini.md` (a API do Claude não aceita áudio como
entrada). O prompt de interpretação sempre instrui a IA a não inventar
informação que não esteja no conteúdo fornecido.

## Validação humana antes da persistência

`resultado_ia` é sempre proposta; `validacao` é sempre o dado oficial — as
duas tabelas nunca se confundem, e só o endpoint
`POST /api/v1/registros/:id/confirmar` cria uma `validacao` (transação
única com o avanço de `registro.status` para `confirmado`). Nenhum job,
worker ou processo automático tem permissão de escrita em `validacao`.
Antes de qualquer alteração que toque nesse fluxo, ler
`docs/adr/0007-separacao-ia-persistencia.md`.

## Arquitetura

```text
personal-assistant/
  CLAUDE.md
  docs/adr/                 decisões arquiteturais (ver índice abaixo)
  docs/deploy.md             publicação, health checks, backup
  prototype/                protótipo de UX original — referência, não é o app
  backend/
    src/
      config/                env.js, database.js
      controllers/            parsing de request/response
      services/               regra de negócio (inclui services/ia/ — Gemini)
      repositories/           acesso a dados (Sequelize)
      models/                 usuario, aluno, registro, registroEntrada,
                               arquivoAudio, transcricao, resultadoIa, validacao
      routes/
      jobs/                   processador-fila-ia.js (worker em processo)
      shared/{logger,middlewares,errors,utils}/
      app.js  server.js
    database/{migrations,seeders}/
    storage/audio/           arquivos de áudio (dev; produção usa volume Docker)
    Dockerfile  .dockerignore
  frontend/
    src/
      router/                 /login, /captura/*, /admin/*
      views/captura/           mobile-first, offline-first
      views/admin/             dashboard, alunos, revisão, histórico, config.
      components/  stores/ (Pinia)  services/ (HTTP)
      offline/                 IndexedDB, fila de sincronização, gravador
    Dockerfile  nginx.conf  .dockerignore
  docker/
    compose.dev.yml          Postgres + pgAdmin (backend/frontend rodam localmente)
    compose.prod.yml         Postgres + backend + frontend containerizados
```

Backend em camadas (controller → service → repository → model), Sequelize +
migrations como fonte da verdade do schema (nunca `sequelize.sync()`), UUID
gerado na aplicação, `snake_case` no banco, `created_at`/`updated_at` em
toda tabela — mesmas convenções do AgroMind (`C:\Source\AgroMind`), usado
como referência de padrão de desenvolvimento (ver
`docs/adr/0001-arquitetura-geral-mvp.md` para o que foi reaproveitado e o
que foi deliberadamente diferente, ex.: sem PrimeVue, ver
`docs/adr/0003-frontend-unico-pwa.md`).

Frontend: **um único app** Vue 3 + Vite + PWA, responsivo, com dois modos de
rota (`/captura` mobile-first offline, `/admin` gestão/validação) — não dois
apps separados. Sem PrimeVue (UX portada diretamente do protótipo). Pinia
desde o início (sessão + fila de sincronização são estado real e
compartilhado).

## Modelo de dados (provisório — ver ADR-0008)

Só as entidades necessárias para o fluxo: `usuario`, `aluno`, `registro`,
`registro_entrada`, `arquivo_audio`, `transcricao`, `resultado_ia`,
`validacao`. **Não antecipar o sistema legado do personal trainer** — nada
de entidades de plano de treino, catálogo de exercícios, avaliação física
estruturada etc. até que o legado seja analisado. Dados de domínio ficam
como JSON semiestruturado (`label`/`valor`/`obs`/`confidence`) dentro de
`resultado_ia`/`validacao`, não como schema relacional rígido.

## Como rodar localmente

```bash
# .env único na raiz (lido pelo Docker Compose e por backend/src/config/env.js)
cp .env.example .env   # ajustar GEMINI_API_KEY e JWT_SECRET

# infraestrutura (Postgres + pgAdmin)
docker compose --project-directory . -f docker/compose.dev.yml up -d

# backend
cd backend
npm install
npm run db:migrate
npm run db:seed        # cria um usuário de desenvolvimento (ver database/seeders)
npm run dev            # http://localhost:3000

# frontend
cd frontend
cp .env.example .env    # variáveis de build do Vite (própria pasta, diferente da raiz)
npm install
npm run dev             # http://localhost:5173, proxy /api e /health para o backend
```

## Como testar

```bash
cd backend && npm test   # node:test, integração usa o banco "test" (NODE_ENV=test)
cd frontend && npm test  # node:test, offline/db via fake-indexeddb, sem chamada HTTP real
```

Cobertura focada nas áreas críticas (não em cobertura artificial):
idempotência de sincronização (repositório e fila local), ordenação de
entradas, isolamento de falha do pipeline de IA, fila offline (sucesso
remove, falha retenta, offline nunca chama o servidor), e — o mais
importante — a garantia de que `validacao` só é criada pelo endpoint de
confirmação.

## Como buildar

```bash
cd backend && npm run build    # se aplicável (JS puro, normalmente não há build)
cd frontend && npm run build   # Vite — gera frontend/dist
```

## Como publicar

```bash
docker compose --project-directory . -f docker/compose.prod.yml pull
docker compose --project-directory . -f docker/compose.prod.yml up -d
docker exec $(docker compose --project-directory . -f docker/compose.prod.yml ps -q backend) npm run db:migrate
```

Backend nunca expõe porta no host (`expose`, não `ports`) — quem fica
exposto é o `frontend`, cujo nginx faz proxy interno de `/api` e `/health`
para o backend (mesma origem, sem CORS). Sem GitHub Actions/GHCR
configurado ainda neste MVP — `BACKEND_IMAGE`/`FRONTEND_IMAGE` em `.env`
apontam para onde as imagens publicadas manualmente ficarem. Health checks,
logs, backup do Postgres e do volume de áudio (`audio_data`), domínio/TLS:
`docs/deploy.md`.

## Variáveis de ambiente

Ver `.env.example` (raiz — único `.env` para Docker Compose e para o
backend, mesmo padrão do AgroMind) e `frontend/.env.example` (variáveis de
build do Vite, próprias da pasta `frontend/`). As sensíveis (nunca commitar
valor real): `GEMINI_API_KEY`, `JWT_SECRET`, `POSTGRES_PASSWORD`.

## Regras importantes para futuras alterações

- **"Registro"**, nunca "Bloco" — em qualquer nomenclatura nova.
- **A IA nunca grava dado oficial diretamente.** Toda alteração que toque em
  `resultado_ia` ou `validacao` deve preservar a separação da ADR-0007.
- **Transcrição só na nuvem**, nunca no dispositivo — não adicionar
  bibliotecas de STT local ao frontend.
- **Não antecipar o sistema legado.** Nenhuma entidade nova de "gestão de
  Personal Trainer" sem decisão explícita — o modelo atual é provisório
  (ADR-0008).
- **`registro.id` sempre nasce no cliente.** Qualquer endpoint que receba um
  Registro precisa ser idempotente por esse id.
- Toda decisão arquitetural relevante e difícil de reverter vira ADR em
  `docs/adr/`, numerada sequencialmente, com Contexto/Decisão/Alternativas
  consideradas/Consequências. Decisões operacionais ou de baixa relevância
  não geram ADR.
- Antes de qualquer implementação relevante: explicar o plano, aguardar
  aprovação quando a mudança alterar arquitetura, banco de dados ou
  comportamento existente.
- Fora de escopo neste MVP (não implementar sem decisão explícita nova):
  WhatsApp/Telegram, app nativo, pagamentos, prescrição avançada,
  dashboards/relatórios complexos, avaliação física completa, sistema
  completo de treinos, réplica do legado, multi-tenant complexo,
  confirmação automática da IA sem revisão humana.

## Índice de ADRs

| # | Título |
|---|---|
| 0001 | Arquitetura geral do MVP |
| 0002 | Conceito de Registro como unidade de contexto |
| 0003 | Frontend único responsivo com PWA (sem PrimeVue) |
| 0004 | Armazenamento offline no cliente (IndexedDB) |
| 0005 | Estratégia de sincronização |
| 0006 | Provedor de IA — Google Gemini |
| 0007 | Separação entre IA e persistência oficial |
| 0008 | Modelo de dados provisório do MVP |
| 0009 | Processamento assíncrono em processo (fila em memória) |
| 0010 | Armazenamento de arquivos de áudio (disco local em volume Docker) |

## Estado atual

MVP completo e verificado de ponta a ponta:

- **Backend**: auth (JWT), Aluno (CRUD simples escopado por usuário),
  sincronização de Registro (idempotente, multipart), pipeline de IA
  (Gemini, fila em processo), revisão/confirmação (`validacao` como único
  dado oficial). 28 testes automatizados (`node --test`, unitários +
  integração contra banco de teste dedicado).
- **Frontend**: app Vue 3 + Vite + PWA único (`/captura` mobile-first
  offline, `/admin` gestão/validação), IndexedDB + fila de sincronização
  própria, gravador de áudio (MediaRecorder). 8 testes automatizados
  (`node --test` + `fake-indexeddb`, `registros.service` mockado).
- **Docker**: `compose.dev.yml` (Postgres + pgAdmin) e `compose.prod.yml`
  (Postgres + backend + frontend) validados; Dockerfiles com healthcheck
  em ambos os serviços da aplicação.
- **Verificação end-to-end real**: fluxo completo exercitado contra
  Postgres real (Docker) e os dois servidores de desenvolvimento rodando —
  login → capturar Registro (texto e áudio) no modo `/captura` → sincronizar
  (idempotente, confirmado por reenvio) → pipeline de IA falha isolada sem
  derrubar o servidor (sem `GEMINI_API_KEY` configurada em dev) → revisar e
  confirmar no modo `/admin` → dado oficial persistido em `validacao`, nunca
  sobrescrito por reconfirmação. Navegação pelas telas verificada num
  navegador real (Playwright), sem erros de console.
- **Pendências reais**: nenhuma chamada real ao Gemini foi validada (precisa
  de `GEMINI_API_KEY` de verdade); CI/CD (GitHub Actions → GHCR → deploy) e
  domínio/TLS de produção não configurados — ver `docs/deploy.md`.
