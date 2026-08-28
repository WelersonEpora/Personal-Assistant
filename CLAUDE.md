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
- Estados **locais** (só no dispositivo, nunca no servidor): `em_andamento`
  (rascunho, ainda sendo editado — ver docs/adr/0012), `local`,
  `aguardando_sincronizacao`, `sincronizando`.
- Estados de **servidor** (`registro.status`): `recebido → transcrevendo →
  interpretando → aguardando_revisao → confirmado` (+ `erro_transcricao` /
  `erro_interpretacao`, retomáveis).
- O personal pode ter **um Registro `em_andamento` por aluno ao mesmo
  tempo** (ex.: atendimento em família) — cada entrada (texto ou áudio) é
  persistida no IndexedDB assim que capturada, não só ao finalizar (ver
  docs/adr/0012-registros-em-andamento-simultaneos.md).

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
  .github/workflows/ci-cd.yml  testes + build/push das imagens (GHCR)
  docs/adr/                 decisões arquiteturais (ver índice abaixo)
  docs/deploy.md             publicação, health checks, backup
  prototype/                protótipo de UX original — referência, não é o app
  scripts/deploy.sh          pull + up -d + migrations no servidor de produção
  backend/
    src/
      config/                env.js, database.js
      controllers/            parsing de request/response
      services/               regra de negócio (inclui services/ia/ — Gemini)
      repositories/           acesso a dados (Sequelize)
      models/                 usuario, equipe, membro, aluno, registro,
                               registroEntrada, arquivoAudio, transcricao,
                               resultadoIa, validacao, avaliacaoMensal,
                               analiseSobDemanda, avaliacaoPersonal,
                               metricaAvaliacaoFisica, avaliacaoFisica,
                               avaliacaoFisicaMedida
      routes/
      jobs/                   processador-fila-ia.js (worker em processo),
                               gerador-avaliacao-mensal.js (lote mensal, docs/adr/0015)
      shared/{logger,middlewares,errors,utils}/
      app.js  server.js
    database/{migrations,seeders}/
    scripts/criar-usuario.js  único jeito de provisionar login (sem cadastro público)
    scripts/importar-avaliacoes-bodymove.js  importador one-shot do legado BodyMove (docs/adr/0016)
    storage/audio/           arquivos de áudio (dev; produção usa volume Docker)
    storage/fotos/           foto (avatar) de aluno (mesmo critério do storage/audio)
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
compartilhado). Única dependência de UI de terceiros: **Apache ECharts**
(`echarts` + `vue-echarts`) para os gráficos de avaliação física — mesmo
padrão de uso do AgroMind (`src/components/charts/` + option-builder puro
testável), isolado no chunk `vendor-echarts` (lazy, fora do precache do PWA).

## Modelo de dados (provisório — ver ADR-0008)

Só as entidades necessárias para o fluxo: `usuario`, `equipe`, `membro`,
`aluno`, `registro`, `registro_entrada`, `arquivo_audio`, `transcricao`,
`resultado_ia`, `validacao`, `avaliacao_mensal` + `analise_sob_demanda` +
`avaliacao_personal` (docs/adr/0015 — camada de acompanhamento: interpretação
da IA e a avaliação escrita pelo próprio personal; nada disso é dado oficial)
+ `metrica_avaliacao_fisica` + `avaliacao_fisica` + `avaliacao_fisica_medida`
(docs/adr/0016 — avaliação física estruturada, modelo v3, com o histórico do
BodyMove importado; CRUD direto do personal, fora do pipeline de IA e de
`validacao`, como `avaliacao_personal`).
Dados de domínio dos Registros ficam como JSON semiestruturado
(`label`/`valor`/`obs`/`confidence`) dentro de `resultado_ia`/`validacao`, não
como schema relacional rígido. **Fora avaliação física (docs/adr/0016) e
catálogo de exercícios/ficha (docs/adr/0013), não antecipar o resto do sistema
legado** — nada de sessão de treino, prescrição avançada, financeiro etc. sem
decisão nova.

`equipe` e `membro` implementam a multi-tenancy do produto (ver
docs/adr/0011): `aluno` e `registro` são escopados por `equipe_id`, não
mais por usuário individual; `membro` associa um `usuario` a uma `equipe`
com um `papel`, hoje 1:1 (um usuário por equipe) e sem controle de acesso
por papel — o papel já é gravado, mas nada ainda é bloqueado com base nele.

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

## CI/CD

`.github/workflows/ci-cd.yml`: testa backend e frontend em todo push/PR
para `main` (Postgres de serviço para os testes de integração do backend);
em push direto para `main`, depois dos testes passarem, builda e publica as
imagens no GHCR (`ghcr.io/welersonepora/personal-assistant-{backend,frontend}`).
**Ainda não faz deploy automático num servidor** — falta um servidor real
configurado (host/SSH nos secrets do repositório) para adicionar esse
último passo. Detalhes: `docs/deploy.md`.

## Como publicar

```bash
cp .env.example .env   # ajustar para o ambiente real
bash scripts/deploy.sh   # pull + up -d + migrations + limpeza de imagens antigas
```

Backend nunca expõe porta no host (`expose`, não `ports`) — quem fica
exposto é o `frontend`, cujo nginx faz proxy interno de `/api` e `/health`
para o backend (mesma origem, sem CORS). Sem cadastro público — o primeiro
usuário de produção é criado via `npm run criar-usuario` dentro do
container do backend (nunca o seeder de desenvolvimento). Health checks,
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
  (ADR-0008). Já decididos e implementados: catálogo de exercícios/ficha
  (ADR-0013) e avaliação física + importação do BodyMove (ADR-0016).
- **Avaliação física nunca vira `validacao` e nenhum job/worker escreve em
  `avaliacao_fisica*`** (ADR-0016) — é dado objetivo do personal, CRUD direto
  como `avaliacao_personal`. Métricas derivadas (`imc`, `rcq`, `massa_gorda`,
  `massa_magra`) são do service, nunca escritas por humano nem por IA.
  Importação do legado é idempotente por `(aluno_id, data, origem)` e mantém
  `origem = legado_bodymove`. A ADR-0018 permite que a IA gere um **rascunho**
  de avaliação (tabela `proposta_avaliacao_fisica`, descartável, nunca oficial,
  escrita só pelo worker) a partir de um Registro `tipo = avaliacao_fisica`; a
  `avaliacao_fisica` em si continua nascendo só do `avaliacao-fisica.service`,
  acionada pelo personal na revisão (`origem = captura_ia`, endpoint
  `POST /api/v1/registros/:id/confirmar-avaliacao-fisica`).
- **`registro.id` sempre nasce no cliente.** Qualquer endpoint que receba um
  Registro precisa ser idempotente por esse id.
- **`registro.data_atendimento` (ADR-0019) é o DIA do atendimento, separado de
  `iniciado_em`/`created_at`/`confirmado_em`** (que nunca ficam editáveis).
  Nasce no cliente (default hoje; até 7 dias atrás na captura, ancorado em
  `iniciado_em`). No desktop, o ajuste faz parte do "Editar" da revisão: a data
  é o "item 0" do formulário e vai no payload de `POST /registros/:id/confirmar`
  (gravada na mesma transação da `validacao` — que continua o único dado
  oficial), com janela `[iniciado_em::date − 60, hoje]`. Histórico, painel e prompts
  da IA usam `data_atendimento` quando o objetivo é "quando o atendimento
  aconteceu"; **o bucketing mensal continua por `confirmado_em` (ADR-0015)** e o
  feed de atividade por `created_at` (ADR-0017).
- Toda decisão arquitetural relevante e difícil de reverter vira ADR em
  `docs/adr/`, numerada sequencialmente, com Contexto/Decisão/Alternativas
  consideradas/Consequências. Decisões operacionais ou de baixa relevância
  não geram ADR.
- Antes de qualquer implementação relevante: explicar o plano, aguardar
  aprovação quando a mudança alterar arquitetura, banco de dados ou
  comportamento existente.
- Fora de escopo neste MVP (não implementar sem decisão explícita nova):
  WhatsApp/Telegram, app nativo, pagamentos, prescrição avançada,
  dashboards/relatórios complexos, dashboard/gráficos/comparação entre
  avaliações físicas (modelo, importação e CRUD feitos — ADR-0016; falta a
  camada de visualização evolutiva), cálculo de
  protocolos (Pollock/VO₂) para avaliações novas, sistema
  completo de treinos, réplica do legado, multi-tenant com múltiplas
  equipes por usuário e controle de acesso por papel (ver docs/adr/0011 —
  a multi-tenancy básica de Equipe/Membro já está implementada),
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
| 0011 | Conceito de Equipe e Membro (multi-tenancy simples) |
| 0012 | Múltiplos Registros em andamento simultâneos (persistência incremental de entradas) |
| 0013 | Catálogo de exercícios e Ficha de Treino |
| 0014 | Acesso do aluno à ficha por link temporário |
| 0015 | Acompanhamento Individual Mensal (avaliação da IA por contexto consolidado) |
| 0016 | Avaliação Física (modelo v3) e importação do legado BodyMove |
| 0017 | Endpoint de painel agregado para o dashboard |
| 0018 | Avaliação Física por captura (áudio/texto) + interpretação da IA |
| 0019 | Data do atendimento separada das datas do sistema |

## Estado atual

MVP completo e verificado de ponta a ponta:

- **Backend**: auth (JWT, com Equipe/Membro — ver docs/adr/0011), Aluno
  (CRUD simples escopado por equipe), catálogo de exercícios + Ficha de
  Treino (docs/adr/0013) com link público por token (docs/adr/0014),
  sincronização de Registro (idempotente, multipart), pipeline de IA
  (Gemini, fila em processo), revisão/confirmação (`validacao` como único
  dado oficial), Acompanhamento Individual Mensal (docs/adr/0015 — avaliação
  da IA por contexto consolidado, lote mensal + geração manual; + análise sob
  demanda com limite de 1 análise gerada a cada 7 dias — sem relatos/dados
  insuficientes não vira registro nem consome a janela; + avaliação escrita
  pelo próprio personal (sem IA) que entra no prompt dos ciclos junto dos
  relatos; IA atua como personal trainer sênior; nunca dado oficial),
  Avaliação Física (docs/adr/0016 — modelo v3: catálogo de métricas +
  `avaliacao_fisica` + `avaliacao_fisica_medida` com `principal` e métricas
  derivadas IMC/RCQ; importador one-shot do BodyMove, idempotente, com os
  405 históricos; **CRUD completo** — `GET/POST/PUT/DELETE
  /api/v1/alunos/:id/avaliacoes-fisicas` + catálogo em
  `/api/v1/metricas-avaliacao-fisica` — com validação da v3, esquema fechado
  de anamnese/postural (§5) e recálculo no service das derivadas `imc`, `rcq`,
  `massa_gorda` e `massa_magra` (2 compartimentos, a partir da % de gordura
  acompanhada; `scripts/recalcular-derivadas-avaliacao-fisica.js` fez o backfill
  das importadas); `data_nascimento` e `sexo` no cadastro do aluno.
  Tabela comparativa (métricas × avaliações no tempo) já existe; gráficos e uso
  pela IA ainda não. Dashboard do `/admin` servido por um endpoint agregado
  `GET /api/v1/painel` (docs/adr/0017 — ação necessária, KPIs, panorama dos
  alunos, feed de atividade; somente leitura, não toca `resultado_ia`/`validacao`).
  `aluno.dispensa_ficha_treino` e `aluno.dispensa_avaliacao_fisica` (opt-out,
  default false) tiram o aluno dos alertas "sem ficha ativa"/"ficha antiga" e
  "avaliação física vencida" do painel.
  Avaliação Física por captura de voz (docs/adr/0018): `registro.tipo`
  (`atendimento` | `avaliacao_fisica`), interpretador próprio no `gemini.service`
  (catálogo no prompt → `metrica_codigo`; não calcula IMC/protocolo), tabela
  `proposta_avaliacao_fisica` (staging da IA, nunca oficial — escrita só pelo
  worker), `POST /api/v1/registros/:id/confirmar-avaliacao-fisica` (endpoint
  próprio; `/confirmar` continua o único que escreve `validacao`) que cria a
  `avaliacao_fisica` pelo CRUD (`origem = captura_ia`, `registro_id`) + avança
  o status numa transação. `reprocessar` também refaz a interpretação a partir
  de `aguardando_revisao` para esse tipo.
  Data do atendimento (docs/adr/0019): `registro.data_atendimento` (`DATE`,
  obrigatória; backfill de `iniciado_em::date`) separa o dia do atendimento das
  datas de captura/sincronização/confirmação. Captura: default hoje, chips dos
  7 dias anteriores, editável enquanto `em_andamento`. Desktop: o ajuste é o
  "item 0" do "Editar" da revisão e vai no payload de
  `POST /registros/:id/confirmar` (grava junto com a `validacao`), janela
  `[iniciado_em::date − 60, hoje]`. Prompts (mensal, sob demanda, interpretação de relato) e painel
  ("último relato"/"aluno parado") usam `data_atendimento`; bucketing mensal
  segue em `confirmado_em`, feed em `created_at`.
  262 testes automatizados (`node --test`, unitários +
  integração contra banco de teste dedicado).
- **Frontend**: app Vue 3 + Vite + PWA único (`/captura` mobile-first
  offline, `/admin` gestão/validação), IndexedDB + fila de sincronização
  própria, gravador de áudio (MediaRecorder), múltiplos Registros
  `em_andamento` simultâneos com persistência incremental (docs/adr/0012).
  Tela de Avaliações Físicas por aluno (docs/adr/0016 — listagem com
  data/peso/IMC/% gordura/massa magra/gorda e expansão inline do card,
  formulário de criação/edição com medidas + anamnese + checklist postural,
  exclusão com confirmação, aba "Comparar" com seletor de período + tabela
  (métricas × datas) + gráficos de evolução (composição, indicadores,
  perímetros com seleção) em Apache ECharts — mesmo padrão do AgroMind
  (`components/charts/` + `utils/echarts-option-builder.js`, este com teste);
  avaliações importadas do BodyMove editáveis com `origem` preservada).
  Dashboard reorganizado (docs/adr/0017): seção "Ação necessária" (só aparece
  quando há pendência, com reprocessar inline), KPIs, "Panorama dos alunos"
  (sem ficha ativa / ficha antiga / avaliação vencida / aniversariantes) e
  feed de atividade recente unificado — consome `GET /api/v1/painel`.
  Switches "não usa ficha de treino" / "não faz avaliação física" no topo das
  seções do aluno (tiram do painel; não apagam dados).
  Captura de Avaliação Física por voz (docs/adr/0018): seletor de tipo
  (Atendimento / Avaliação física) ao iniciar o Registro (persistido; um
  `em_andamento` por aluno **por tipo**), roteiro de ditado opcional, acento
  teal no composer e chip na lista. Revisão da proposta em
  `components/revisao/RevisaoAvaliacaoFisica.vue` — painel de conferência
  (confiança por medida, trechos, "não reconhecido", ouvir áudio) +
  `AvaliacaoFisicaForm` em `modo="revisao"` (pré-preenchido, "Confirmar
  avaliação física", "Refazer interpretação", "Descartar").
  Data do atendimento (docs/adr/0019): `SeletorDataAtendimento.vue` — painel
  contextual no composer, **só para `tipo = atendimento`** (a avaliação física
  não tem seletor de data na captura; usa `data_ouvida` / o formulário de
  revisão), estilo roteiro de ditado: barra "Atendimento de: Hoje" que expande
  nos chips dos 7 dias, selo "retroativo". No `/admin` a revisão mostra
  "Atendimento em" vs "registrado em" no cabeçalho (só leitura) e a data vira o
  "item 0" do formulário de "Editar", num `CampoData.vue` (calendário próprio,
  sem `<input type=date>` nativo).
  37 testes automatizados (`node --test` + `fake-indexeddb`; +
  `echarts-option-builder.test.js`, `avaliacaoFisica.test.js` e
  `registroStatus.test.js` puros).
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
- **CI/CD**: `.github/workflows/ci-cd.yml` testa backend e frontend em todo
  push/PR e publica as imagens no GHCR a cada push em `main`.
- **Pendências reais**: com `GEMINI_API_KEY` real configurada em dev, o
  interpretador de avaliação física (docs/adr/0018) foi exercitado ponta a
  ponta contra o Gemini (extração e conversão de unidade corretas em um caso
  simples); os demais passos de IA (transcrição de áudio real, interpretação
  de relato, acompanhamento mensal) ainda não foram validados com chamada
  real. Deploy automático num servidor real ainda não existe (falta o servidor
  em si — host/SSH nos secrets do repositório); domínio/TLS de produção não
  configurados — ver `docs/deploy.md`.
  A importação do BodyMove (ADR-0016) foi validada por `--dry-run` e testes
  (transform contra o `.bak` real + persistência no banco de teste), mas a
  carga de verdade num banco alvo ainda não foi executada
  (`npm run importar-bodymove -- --equipe-id=<uuid>`); dashboard/telas de
  avaliação física são a próxima rodada.
