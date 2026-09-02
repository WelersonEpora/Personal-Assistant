# ADR-0022: Radar — atualização profissional para o personal ("fofoqueira científica")

**Status:** Aceita e aprovada para implementação (2026-09-02)

> **Ilha.** O Radar não lê, não escreve e não é lido por `resultado_ia`,
> `validacao`, `avaliacao_fisica*` nem pelos prompts do acompanhamento
> (ADR-0015/0018). Não revoga nada. É a primeira funcionalidade do produto
> em que a **IA publica conteúdo sem revisão humana** — exceção deliberada e
> restrita, justificada abaixo, porque o que ela publica **nunca é
> conhecimento oficial**: é um ponteiro para a fonte, que o personal
> obrigatoriamente confere.

## Contexto

A ideia surgiu numa reunião com um personal parceiro: além de reduzir o
trabalho operacional (o núcleo do MVP), falta ao profissional um jeito
confiável de **saber o que mudou ou merece mudar a forma como ele pensa e
trabalha**. Hoje o personal médio não lê a publicação — ele joga o assunto
numa IA de chat e pede resumo. Já corre o risco de interpretação errada; a
diferença aqui é fazer isso de forma **aberta e rastreável**, com a fonte
sempre a um clique e o tipo de documento rotulado.

O produto não tem nada nessa direção. O que **não** queremos:

- um agregador de notícias;
- um pipeline pesado (integração com PubMed/E-utilities, RSS, Crossref,
  motor de deduplicação, curadoria por etapas);
- um segundo tipo de "documento" (fatos × análise) como estágios separados;
- uma etapa de aprovação humana — não haverá ninguém dedicado a revisar o
  que a IA encontrar.

O conceito que sobrou, depois de várias rodadas de corte, é uma
**"fofoqueira científica"**: a IA vigia algumas fontes confiáveis e, quando
acha algo que parece interessante para um personal, **avisa e aponta para a
fonte**. Ela não garante ter achado tudo, não produz conhecimento, não
compara papers, não passa por aprovação. O personal decide se interessa e,
se interessar, vai à fonte original tirar as próprias conclusões.

### O que o Radar é — e o que não é

| É | Não é |
|---|---|
| Um **norte**: "encontrei isso, parece relevante por estes motivos, confira a fonte" | Uma fonte de conhecimento ou verdade científica |
| Um ponteiro para a fonte primária | Um resumo em que se pode confiar sem abrir o original |
| Curadoria de **onde olhar** | Curadoria de **no que acreditar** |
| Descartável — nenhum item é dado do produto | Insumo de qualquer decisão automatizada do sistema |

## Decisão

### Escopo desta ADR

O CLAUDE.md lista "dashboards/relatórios complexos" e antecipação do sistema
legado como fora do MVP *sem decisão explícita nova*. Esta ADR **é** essa
decisão para o Radar, e só para ele: uma tela de leitura alimentada por um
job de IA, sobre tabelas próprias isoladas. Não abre precedente para nenhuma
outra automação de conteúdo.

### Sem aprovação humana — por que é aceitável aqui

O app inteiro se apoia em "a IA propõe, o humano confirma, e só o humano
cria dado oficial" (ADR-0007). O Radar é uma exceção **porque não há dado
oficial em jogo**:

1. Nenhum item do Radar entra em `validacao`, `resultado_ia`, prompt de
   ciclo ou qualquer cálculo. É uma ilha.
2. O usuário é um profissional, e a regra do produto é explícita: **ir à
   fonte é obrigatório**, o Radar só aponta.
3. Paridade de risco: o personal já pede resumo para uma IA de chat sem
   nenhuma salvaguarda. O Radar faz o mesmo com a fonte rotulada e a um
   clique — é uma melhora, não uma piora.
4. A UI carimba o status epistêmico (ver "Card"): o resumo aparece como
   "leitura da IA, não conferimos o texto original".

Se a prática mostrar que isso não se sustenta, o caminho é endurecer
(verificação contra índice real, curadoria) ou desligar — não adicionar um
revisor.

### Feed global, não escopado por `equipe`

Diferente de toda entidade do produto (ADR-0011), o `radar_item` **não tem
`equipe_id`**. A literatura científica é a mesma para todos os personais. Um
job, um feed, todos os usuários veem o mesmo conteúdo — inclusive durante a
calibração. Personalização por base de alunos fica fora (ver "Fora de
escopo").

### Busca — Gemini com Google Search grounding, uma chamada

- Ponto único de contato com o Gemini continua sendo `gemini.service.js`
  (ADR-0006). Nova função `buscarRadar({ assuntos, fontes, janela,
  criterios, maxItens })`.
- Usa `tools: [{ googleSearch: {} }]`, passando pelo `comRetry` que já
  existe (503 em rajada é esperado — ADR-0006).
- **Não usa `responseSchema`** (o Gemini não aceita saída estruturada junto
  com `googleSearch`). O prompt exige um bloco ```json``` com um array; o
  service faz *parse* tolerante (primeiro array JSON válido), valida cada
  item e **descarta o malformado** (registrando o descarte).
- Uma chamada por rodada. **Sem** segunda passada, sem análise item a item,
  sem síntese entre publicações.
- Prompt (resumo das regras): papel de quem vigia fontes confiáveis para um
  personal; usar **só** as fontes da allowlist; **só** a janela informada;
  no máximo N itens; link **direto para a fonte primária** (preferir o
  domínio da fonte ou `doi.org`); `resumo` = o que o documento diz segundo
  o abstract/página, **sem interpretar além disso**; `motivo_relevancia`
  **sem superlativo** ("é uma revisão sistemática sobre X", não "estudo que
  muda tudo"); se não houver nada relevante, retornar `[]`.
- Item retornado: `{ titulo, fonte, url, tipo, data_informada, resumo,
  motivo_relevancia, assuntos[] }`. **Sem campo de confiança** — "confiança
  da IA" seria lido como confiança na informação e criaria falsa autoridade.

### Configuração versionada no repo — `backend/src/config/radar.js`

Mexer em fonte ou assunto é *commit*, não tela de admin:

- `janelaDias: 7`, `maxItens: 5`.
- **`assuntos`** — treino de força/hipertrofia; periodização, volume e
  frequência; prevenção de lesão no treino resistido; exercício para
  populações especiais (idoso, gestante, hipertensão, diabetes, obesidade);
  composição corporal e antropometria; treino cardiorrespiratório;
  recuperação, sono e dor muscular; adesão e mudança de comportamento;
  diretrizes de atividade física para saúde; regulamentação da profissão de
  educação física no Brasil.
- **`fontes`** (nome + domínio) — PubMed, British Journal of Sports
  Medicine, ACSM, NSCA, Journal of the ISSN, Sports Medicine (Springer),
  OMS/WHO, CONFEF/CREF, SBMEE, PEDro. Lista de partida; ajustada na
  calibração.
- **`criteriosRelevancia`** — priorizar revisão sistemática, meta-análise,
  position stand, diretriz e consenso; estudo primário isolado só se de
  órgão reconhecido ou se contrariar o consenso vigente; o item precisa ter
  relação direta com a prática de um personal; ignorar blog, newsletter e
  conteúdo de marketing.

### Modelo de dados — 3 tabelas, nenhuma com `equipe_id`

**`radar_execucao`** — auditoria de cada rodada (é a proteção "logar prompt
e resposta crua" e a base de observação da calibração):
`id`, `iniciada_em`, `concluida_em`, `status` (`rodando | concluida |
falha`), `janela_de` (date), `janela_ate` (date), `modelo`, `prompt`
(text), `resposta_crua` (text), `itens_recebidos`, `itens_publicados`,
`descartes_json` (jsonb — `[{ titulo, motivo }]`, motivo em
`link_quebrado | duplicado | malformado`), `erro` (text), `created_at`,
`updated_at`.

**`radar_item`** — o que aparece no feed:
`id`, `execucao_id` (FK → `radar_execucao`, `ON DELETE SET NULL`),
`titulo`, `fonte`, `url`, `url_status` (`nao_verificado | ok | quebrado`),
`url_verificada_em`, `tipo` (`diretriz | position_stand |
revisao_sistematica | meta_analise | estudo_primario | consenso | outro`),
`data_informada` (string livre — "data informada pela IA", não brigar com
formato), `resumo` (text), `motivo_relevancia` (text), `assuntos` (jsonb),
`chave_dedup` (string, **UNIQUE** — hash de título normalizado + domínio da
URL), `visivel` (bool, default `true` — permite esconder um item ruim por
DB sem apagar o histórico), `created_at`, `updated_at`.

**`radar_feedback`**:
`id`, `radar_item_id` (FK, `ON DELETE CASCADE`), `usuario_id` (FK),
`valor` (`util | irrelevante | enganoso`), **UNIQUE (`radar_item_id`,
`usuario_id`)**, `created_at`, `updated_at`.

Migrations no padrão do projeto (`gen_random_uuid()`, `snake_case`, CHECK
via SQL cru, `NOW()`). Models + associações em `models/index.js`.

### Job — `backend/src/jobs/radar-fofoqueira.js`

Mesma mecânica do `gerador-avaliacao-mensal.js` (ADR-0015): `setInterval` no
próprio processo, `timer.unref()`, roda no boot, falha isolada não derruba
nada, tudo logado. Wired em `server.js` via `iniciarAgendadorRadar()`.

- Intervalo de 7 dias, com guarda de idempotência: só roda se a última
  `radar_execucao` com `status = concluida` foi há mais de 6 dias
  (sobrevive a *restart* sem repetir a busca).
- `rodarCiclo()`: cria `radar_execucao` (`rodando`) → chama
  `geminiService.buscarRadar(...)` → para cada item bruto: valida shape →
  normaliza → calcula `chave_dedup` → **verifica o link** (`fetch`, timeout
  ~8 s, segue redirect, aceita 2xx/3xx; senão marca `quebrado` e **não
  publica**) → checa dedup contra `radar_item` → insere os que passam →
  fecha a execução com contadores, `prompt` e `resposta_crua`.
- Erro na chamada ao Gemini (config, rede, parse total) → `radar_execucao`
  vira `falha` com `erro` preenchido, **sem throw** (mesmo princípio da
  ADR-0009). Sem `GEMINI_API_KEY`: loga e sai, como o resto do pipeline.
- **Kill switch operacional:** `RADAR_JOB_ATIVO` (env, default `true`).
  `false` desliga só o agendador automático — a tela e o disparo manual
  continuam. É a forma de estancar sem *rollback* se o feed sair dos
  trilhos.

### API — `/api/v1/radar` (camadas: controller → service → repository)

| Método | Rota | Quem | O quê |
|---|---|---|---|
| `GET` | `/api/v1/radar` | autenticado | itens com `visivel = true` e `url_status <> 'quebrado'`, `created_at DESC`, paginado. **Todos os usuários**, sem gate. |
| `POST` | `/api/v1/radar/:id/feedback` | autenticado | *upsert* `{ valor }` em `radar_feedback` (voto do mesmo usuário atualiza, não duplica) |
| `GET` | `/api/v1/radar/execucoes` | **owner** | últimas execuções — observabilidade da calibração |
| `POST` | `/api/v1/radar/rodar` | **owner** | dispara um ciclo manual, para calibrar (igual à geração manual da avaliação mensal, ADR-0015) |

Nenhuma escrita fora das 3 tabelas do Radar. ADR-0007 intacta.

### Frontend — tela `Radar`

- **Rota:** `/admin/radar`, nome `admin-radar`, `meta.titulo = "Radar"`.
  Visível para todos os usuários autenticados (não é `somenteOwner`).
- **Menu:** grupo **próprio**, logo antes de "Sistema" no menu do `/admin`
  (ícone de antena/radar) — separado de REGISTROS, que é dado de aluno.
  *(Revisto em 2026-09-02: Radar foi para o grupo "Visão geral", abaixo de
  Dashboard e Atendimentos — panorama de leitura, não pipeline. Ver adendo
  "reorganização do menu" na ADR-0020.)*
- **Serviço:** `services/radar.service.js` (usa `http.js`): `listar()`,
  `enviarFeedback(id, valor)`, `rodarAgora()` (owner), `listarExecucoes()`
  (owner). Sem Pinia, sem estado offline — tela de leitura do `/admin`,
  como a de Atendimentos.
- **Card** (mesma linguagem visual de `DashboardView` — `card`,
  `view-header`):
  - **Fatos** (topo): *badge* do `tipo`, `fonte`, `data_informada` (com
    tooltip "informada pela IA"), `titulo`.
  - **Caixa destacada "Leitura da IA — não conferimos o texto original":**
    `resumo` + `motivo_relevancia`.
  - **Rodapé:** botão primário **"Abrir fonte ↗"** + `útil / irrelevante /
    enganoso`.
  - Tags de `assuntos`.
  - **Sem** parágrafo-resumo conclusivo, sem "o que muda na prática", sem
    selo de qualidade, sem métrica de confiança.
- **Empty state:** "Nada novo no radar esta semana."
- Frase fixa no cabeçalho: *"O Radar aponta para publicações que podem
  interessar a você. Não é fonte de informação — sempre abra o original
  antes de mudar qualquer coisa na sua prática."*

### Variáveis de ambiente novas

- `RADAR_JOB_ATIVO` (default `true`) — liga/desliga o agendador semanal.
- `RADAR_MODEL` (opcional; default = `GEMINI_MODEL`) — o modelo da busca é
  configurável à parte. Começa no modelo de teste corrente; se a qualidade
  da busca justificar um modelo mais forte, muda-se só esta variável.
- Reusa `GEMINI_API_KEY`. `.env.example` atualizado.

### Calibração

Exposto a todos desde o primeiro dia (decisão do produto — paridade de
risco). A calibração é **observação, não portão**:

1. Deploy com o job ativo.
2. `POST /api/v1/radar/rodar` algumas vezes e/ou o ciclo semanal rodando;
   acompanhar `GET /api/v1/radar/execucoes` e o feedback.
3. Ajustar `config/radar.js` (assuntos, fontes) e o prompt conforme o que
   volta. Itens ruins some-se por `visivel = false` no banco.
4. Depois de ~2 meses: razão `útil / (irrelevante + enganoso)` e cliques em
   "Abrir fonte" decidem — endurecer (índice real, curadoria) ou desligar.

### Ressalva aceita, não corrigida

LLM lida mal com "período da busca" e com data. O `data_informada` virá
furado às vezes (publicação antiga com data errada, recente não encontrada).
A tela mostra como "informada pela IA"; a verificação de link e a regra de
ir à fonte cobrem o resto. Cobertura irregular (não acha tudo, às vezes
repete clássicos) é esperada — o dedup e a calibração seguram.

### Fora de escopo

- Verificação de citação contra Crossref/PubMed; *feed* determinístico
  (RSS, E-utilities).
- Comparação entre publicações / "isto é realmente novidade frente às
  revisões anteriores?".
- Personalização do feed por base de alunos do personal.
- *Digest* por e-mail ou *push*.
- Aprovação humana por item; papel de curador.
- Métrica de confiança da IA no item.
- Qualquer ligação com `resultado_ia`, `validacao`, `avaliacao_fisica*` ou
  prompts do acompanhamento.
- Filtros, busca textual e ordenação na tela (feed simples, mais recente
  primeiro).

## Alternativas consideradas

- **Agregador curado com pipeline de duas etapas + aprovação humana.**
  Rejeitada — não há quem cure, e a etapa de aprovação contradiz a premissa
  de "norte, não fonte". Além disso o *fetch* determinístico (PubMed/RSS) é
  um projeto por si só, desproporcional para validar o conceito.
- **Retrieval determinístico (RSS + E-utilities) + uma passada de IA.** É o
  desenho mais robusto e continua sendo o caminho de endurecimento se o V1
  vingar. Fora agora: queremos primeiro saber se o personal liga para a
  funcionalidade antes de pagar o custo de integração e manutenção de
  *feeds*.
- **IA resume as publicações uma a uma e associa umas às outras.**
  Rejeitada para o V1 — é a parte mais valiosa e a mais arriscada (síntese
  entre estudos é onde a IA "cria uma nova verdade"). Uma chamada, sem
  síntese.
- **Saída estruturada (`responseSchema`).** Incompatível com
  `googleSearch` no Gemini. *Parse* tolerante do bloco JSON + validação +
  descarte do malformado resolve, e a calibração absorve a aspereza.
- **Feed escopado por `equipe`.** Rejeitada — a literatura é a mesma para
  todos; escopar multiplicaria custo de IA e storage sem nenhum ganho.
- **Campo de confiança da IA por item.** Rejeitada — "confiança da IA"
  seria lido como confiança na informação, criando a falsa autoridade que o
  conceito inteiro tenta evitar.
- **Período de calibração visível só para o owner.** Rejeitada pelo
  produto — o personal já corre esse risco hoje com IA de chat; expor desde
  o início dá sinal real de uso e de qualidade.
- **Nome "Eventos"** (como no AgroMind). Rejeitada — para um personal,
  "Eventos" lê como agenda/compromisso/congresso. **"Radar"** comunica
  "detecção e direção, não destino", que é exatamente o conceito.

## Consequências

- **Schema:** 3 tabelas novas, isoladas, sem FK para o domínio além de
  `usuario` (feedback). Nenhuma alteração em tabela existente.
- **Backend:** `config/radar.js`; `jobs/radar-fofoqueira.js` (+ wiring em
  `server.js`); `buscarRadar` em `services/ia/gemini.service.js`;
  `radar.{controller,service,repository}.js`; `radar.routes.js` montado em
  `/api/v1/radar` no `routes/index.js`; models `radarItem`,
  `radarExecucao`, `radarFeedback`. Testes (`node:test`): dedup pula item
  já visto; link quebrado é descartado com motivo; teto de `maxItens`
  respeitado; falha do Gemini → execução `falha` sem throw; `[]` → 0 itens
  / execução `concluida`; *parse* tolerante do bloco JSON com *mock*;
  feedback faz *upsert*; `POST /rodar` e `GET /execucoes` → `403` para
  não-owner.
- **Frontend:** `views/admin/RadarView.vue`; `services/radar.service.js`;
  entrada de menu e grupo novo em `AdminShell.vue`; rota em
  `router/index.js`. Sem ECharts, sem Pinia, sem offline. Nenhum teste novo
  de peso (a tela é leitura + um POST de feedback).
- **Operação:** uma chamada ao Gemini por semana (+ as manuais da
  calibração). Custo desprezível. `RADAR_JOB_ATIVO=false` estanca sem
  deploy de código.
- **ADR-0007, 0015, 0017, 0018 intactas.** O Radar é uma ilha.
- Primeiro passo do produto na direção de "desenvolvimento profissional".
  Se vingar, a evolução natural é o *retrieval* determinístico e a
  verificação de citação — sem mudança de contrato da tela.

## Adendo (2026-09-02): correções pós primeiro uso

Ajustes depois do primeiro uso real — **prevalecem sobre o corpo acima** onde
divergirem (API, tela, tabelas):

1. `POST /radar/rodar` e `GET /radar/execucoes` deixam de ser endpoints —
   viram scripts de operador.
2. Deduplicação reforçada (DOI → assinatura de título → Jaccard → lista no
   prompt).
3. Feedback do usuário removido (`radar_feedback` *dropada*).
4. Filtro de período na tela (`de`/`ate`), agrupamento por mês.
5. Retrieval mais fundo: janela 7 → 30 dias, **uma busca por grupo de
   assunto** (não uma só), modelo do Radar sobe para Gemini Pro, timeout de
   4 min por chamada.
6. Fontes brasileiras (SciELO, Ministério da Saúde, CBCE) + instrução no
   prompt de não parar no PubMed.
7. Filtro por **grupo de assunto** na tela (`?grupos=`), + snap dos assuntos
   ao vocabulário fixo em `normalizarItem`.

### 1. "owner" é o gate errado para um feed global

O feed é único para **todo o sistema** (todos os tenants). "Owner" é papel
**por equipe** — em produção com N equipes há N owners, e qualquer um deles
podia disparar um `POST /radar/rodar` que escreve no feed de todos, ou
ocultar item para todos. "Dono de uma equipe" ≠ "operador do Radar".

**Correção:**

- **`POST /api/v1/radar/rodar` e `GET /api/v1/radar/execucoes` deixam de
  existir como endpoints.** Rodar a busca, ver o log e curar o feed são
  ações de **operador do sistema**, viram scripts (mesmo espírito de
  `scripts/criar-usuario.js` / `importar-bodymove.js`):
  - `npm run radar:rodar` — dispara um ciclo.
  - `npm run radar:ocultar -- <id> [--reexibir]` — `visivel = false/true`.
  - `npm run radar:execucoes [-- --prompt]` — log das últimas execuções.
- A API do Radar fica só com `GET /api/v1/radar` e
  `POST /api/v1/radar/:id/feedback`, ambos para qualquer usuário autenticado.
- `RadarView.vue` perde toda a lógica de `owner` / "Buscar agora" / "última
  busca". A tela é idêntica para todo mundo: feed + feedback. O cabeçalho
  diz que "a busca roda automaticamente uma vez por semana".
- O **job semanal** (`RADAR_JOB_ATIVO`) continua sendo o único gatilho
  automático — inalterado.
- A "calibração" passa a ser feita pelo operador via os scripts acima, não
  pelos endpoints.

### 2. deduplicação fraca

`chave_dedup` era `hash(título normalizado + domínio da URL)`. A IA re-acha
o mesmo paper a cada busca, mas **reformula o título traduzido** ("com
imersão" → "na imersão") e **varia o formato da URL** (`doi.org/…` numa
rodada, `pubmed.ncbi.nlm.nih.gov/ID` na outra). Resultado: 4 linhas para 2
papers depois de dois ciclos.

**Nova deduplicação — 4 camadas** (ainda sem PubMed/Crossref):

1. **DOI** extraído da URL quando houver (`10.\d{4,}/…`) → `chave_dedup =
   doi:<doi>`. É o identificador mais estável.
2. **Assinatura do título** — tokens sem acento/pontuação/*stopword*, únicos
   e ordenados → `chave_dedup = sig:<hash>`. Pega reformulação que só troca
   palavra de ligação.
3. **Similaridade de Jaccard** entre conjuntos de tokens do título ≥ **0,90**
   contra os itens existentes — rede de segurança para "mesma publicação com
   1 palavra de conteúdo trocada". Limiar alto de propósito, para não fundir
   dois estudos parecidos ("…em idosos" × "…em jovens").
4. **Lista "já no Radar" no prompt** — os últimos ~20 títulos + URLs vão para
   o Gemini com a instrução de não devolver nenhum de novo, "nem com o
   título reescrito, nem com outra URL".

Itens antigos ficam com a chave no formato velho; a camada 3 (Jaccard, que
compara título contra título) cobre a transição sem precisar reescrever
`chave_dedup` das linhas existentes.

Sem mudança de schema. `radar.repository`: `listarChavesDedup` →
`listarParaDedup` (devolve `chave_dedup` + `titulo`), `+ itensRecentes`,
`+ definirVisibilidade`.

### 3. feedback removido

`radar_feedback` (`útil / irrelevante / enganoso`) **sai** — tabela (migração
de *drop*), model, endpoint `POST /:id/feedback`, service `registrarFeedback`.
Motivo: sem revisor comprometido a olhar o agregado, e num feed global de
baixo volume, o voto não tinha ação clara. "útil / irrelevante" é satisfação
subjetiva; "enganoso" tinha valor como sinal de segurança, mas depende de
alguém acompanhando — e a qualidade já ficou com o **operador** (`npm run
radar:execucoes` mostra o que foi publicado + prompt + resposta crua). O item
do feed perde `meu_feedback`; `listar` não precisa mais de `usuarioId`. Se
voltar a fazer sentido, é ~1 migração + ~40 linhas.

O rodapé do card fica só com **"Abrir fonte ↗"**.

### 4. filtro de período (evita o "buraco sem fundo")

O feed era `created_at DESC` paginado — scroll infinito com o tempo. Ganha o
mesmo **`SeletorPeriodo`** de Atendimentos / Histórico:

- `GET /api/v1/radar` aceita `de` / `ate` opcionais (janela por `created_at`,
  validados com `shared/utils/periodo.js` — mesmo critério das outras telas).
- A tela abre em **"Últimos 90 dias"** (igual ao Histórico); presets *30 dias
  · 90 dias · Este ano · Tudo · Personalizado*.
- O agrupamento "Esta semana / Semana passada" vira **agrupamento por mês**
  ("Setembro de 2026") — funciona para qualquer janela, inclusive as antigas.
- Paginação (`por_pagina`, default 50) continua como teto de segurança; o
  controle real é o período.

### 5. retrieval mais fundo

O V1 (uma chamada com Google Search grounding, janela 7 dias, `flash`)
sub-coletava — duas rodadas achavam sempre os mesmos ~2 papers. Não é o
número real de publicações relevantes; é o funil {7 dias} × {10 domínios} ×
{só alto nível} × {modelo fraco} estrangulando. Ajuste "barato" (sem ainda
partir para *retrieval* determinístico):

- **Janela 7 → 30 dias.** Revisão relevante para personal não sai toda
  semana de cada periódico. O job segue semanal; `jaPublicados` (últimos 30)
  + o dedup seguram a sobreposição.
- **Uma busca por grupo de assunto.** `config/radar.js` passa a ter
  `gruposAssunto` (4 grupos de 2-3 assuntos próximos). `rodarCiclo` chama
  `geminiService.buscarRadar` uma vez por grupo (com `foco = grupo.nome`),
  faz merge, dedup e teto. `maxItensPorGrupo` (4) + `maxItensPorCiclo` (10).
  Falha de um grupo não derruba os outros; só `falha` se **todos** falharem.
- **Prompt:** sai o "no máximo N, menos é melhor"; entra "faça várias buscas
  … devolva todas as relevantes, até {N}".
- **Modelo:** `RADAR_MODEL` default passa a `gemini-pro-latest` (só a busca do
  Radar — o pipeline de Registro segue no Flash). A busca é web search +
  julgar tipo de documento + seguir muitas restrições: o Flash é fraco nisso,
  e o Radar roda ~1×/semana, então o custo do Pro é irrelevante. `gemini-2.5-pro`
  dá 404 ("no longer available to new users"); o alias `-latest` é o certo.
  Se o id mudar, ajustar `RADAR_MODEL`.
- **Timeout:** 4 min por chamada (`AbortSignal.timeout` em `buscarRadar`) —
  Pro + grounding é lento (minutos). Estoura → `AbortError`, não transitório,
  o service pula o grupo. Um ciclo pode levar ~5 min; o job roda *unref'd*,
  ninguém espera. O disparo manual (`radar:rodar`) leva o mesmo tempo.

**Resultado do 1º ciclo com Pro + por grupo:** 12 recebidos, 10 publicados
(bateu o teto), 1 descartado por similaridade, 4 grupos ok, ~5 min. Passou
de 2 para 12. Notas de calibração: quase tudo voltou como meta-análise
(nenhuma diretriz/position stand — normal para 30 dias); alguns itens de
borda (GLP-1, Alzheimer); viés para "idoso/meia-idade".

### 6. fontes brasileiras

Do 1º ciclo, 11 de 12 vieram do PubMed. A busca gravita para lá (maior
índice, inglês, mais linkável). Ação:

- **`config/radar.js`** ganha SciELO Brasil (`scielo.br` — inclui a *Revista
  Brasileira de Medicina do Esporte*), Ministério da Saúde (`gov.br` — guia
  nacional de atividade física) e CBCE (`cbce.org.br`). CONFEF/CREF e SBMEE
  já estavam.
- **Prompt:** regra explícita de "não pare no PubMed — busque nas fontes
  brasileiras da lista e verifique mudanças regulatórias do CONFEF/CREF".
- **`verificarLink` afrouxa:** antes, `fetch failed` (erro de rede) virava
  `quebrado` → não publicava. Mas sites de conselho/governo brasileiros
  (`confef.org.br`, `gov.br`) barram bot → `fetch failed`, que **não** é
  "página morta". Agora só **DNS-não-resolve** (`ENOTFOUND` — domínio
  provavelmente alucinado), 404 e 410 viram `quebrado`; timeout, conexão
  recusada, TLS, bot bloqueado → `nao_verificado` (publica com o selo).
- **Resultado:** o ciclo seguinte trouxe 2 itens brasileiros (SciELO /
  *Revista Brasileira de Ciências do Esporte*) + uma *roundtable statement*
  do ACSM. Achou também uma **Resolução do CONFEF** (regulação de e-sports)
  — descartada por `link_quebrado` na versão antiga do `verificarLink`, agora
  entraria com o selo.
- **Caveat:** conteúdo nacional vai ser minoria (não há o mesmo volume
  mensal de evidência de alto nível em português). Mas o que é *unicamente*
  nacional — regra do CREF, guia do MS, estudo em população brasileira — é o
  que o PubMed nunca traz.

### 7. filtro por grupo de assunto + vocabulário fixo

- `GET /api/v1/radar` aceita `?grupos=forca,populacoes` (chaves de
  `gruposAssunto`). Filtro no repositório por `jsonb_exists_any(assuntos,
  ARRAY[...])` — a forma-função de `?|` (o `?` do operador confunde o
  Sequelize com bind param). Chave inválida é ignorada.
- A resposta traz `grupos` (`chave` + `nome`) — a tela monta os chips a
  partir daí (fonte única da verdade). Chips ficam abaixo do `SeletorPeriodo`
  no mesmo card, com "Todos" + os 4 grupos (multi-seleção). O agrupamento
  visual do feed continua por mês (não por assunto).
- Para o filtro nunca quebrar: **`normalizarItem` encaixa cada assunto que a
  IA devolve no termo canônico do vocabulário** (`snapAssunto` — Jaccard de
  tokens ≥ 0,5 contra a lista) e descarta o que não reconhecer. No 1º ciclo
  real a IA já tinha seguido o vocabulário 100%, mas agora é garantido.

Se mesmo assim o volume/qualidade não convencer, o próximo passo é o
*retrieval* determinístico (PubMed E-utilities + RSS das sociedades) — aí a
IA só tria, não busca.

### 8. card colapsável (triagem primeiro)

O card despejava tudo — `resumo`, `motivo_relevancia`, tags, botão — e o feed
virava uma parede pra rolar. Passa ao padrão das outras telas (Relatos,
Histórico, timeline do aluno): **colapsado por padrão, expande no clique**.

- **Colapsado:** três linhas — `titulo`, depois `fonte · data_informada`,
  depois o *badge* do `tipo` (+ aviso de link não verificado) — e o chevron à
  direita. Card inteiro `row-clickable`, um aberto por vez (`expandidoId`).
- **Expandido:** a caixa "Resumo da IA · não conferido" (`resumo`, aviso de
  estudo isolado, "Por que apareceu"), as tags de `assuntos` e o botão
  **"Abrir fonte ↗"**.
- **O `titulo` deixa de ser link.** Antes o `<h2>` era a âncora pra fonte (§
  "Card" da Decisão). Com o card clicável pra expandir, título-link + card-
  expande no mesmo alvo eram dois gestos concorrentes. O link agora é só o
  botão "Abrir fonte ↗" no corpo — ação deliberada, coerente com "sempre abra
  o original de propósito". Puro front (`RadarView.vue`), sem contrato.

### 9. busca textual na tela

"Filtros, busca textual e ordenação na tela" estava fora de escopo (§
"Fora do escopo") — mesmo walk-back deliberado do filtro de período (§4) e de
assunto (§7): um campo livre que casa no `titulo`, no `resumo` e nos
`assuntos` (a categoria fina do item — mais específica que os 4 grandes grupos
do `FiltroSegmentado`, e que só aparece no card expandido).

- **Client-side**, como as outras telas (Exercícios, Relatos, Histórico todos
  filtram a lista já carregada). Helper `filtrarPorBusca` + `normalizar`
  (minúsculas, sem acento — "analise" acha "análise", melhor que as outras
  telas) em `utils/radar.js`, com teste. O agrupamento mensal roda sobre a
  lista filtrada; *empty state* vira "Nada corresponde a …".
- **Pré-requisito:** o feed precisa vir inteiro para a busca fazer sentido. O
  endpoint paginava em 50/página e a tela não tem "carregar mais" — mostrava
  no máximo 50 do período, silenciosamente. `PADRAO/MAX_POR_PAGINA` sobe para
  **300** (feed curado, ~10-30 itens/semana após dedup; "Últimos 90 dias" cabe
  com folga) e `radar.service.js` pede `por_pagina=300`. Se "Tudo" passar disso
  um dia, aí entra paginação de verdade.
- **Caveat:** termo que casa só no `resumo` mostra o card colapsado sem o
  trecho à vista (expande pra ver) — comportamento de busca de e-mail, aceito.
- Sem endpoint novo, sem tabela, sem `ILIKE` no banco (nada de `unaccent`).

### 10. linha de fontes na tela

Logo abaixo do aviso "cada item é um ponto de partida", uma linha lista as
**fontes priorizadas** e reforça que a varredura é **semanal** — o personal
precisa saber de onde vem (e de onde não vem) o que está lendo.

- `GET /api/v1/radar` passa a devolver `fontes` (`{ nome, dominio }`, o `nome`
  é um rótulo `curto` novo em `config/radar.js`) — mesma "fonte única da
  verdade" que já vale para `grupos` (§7). A tela só junta os nomes com `·`.
- Sem card, sem contrato de escrita; `config/radar.js` continua sendo o único
  lugar de curadoria de fontes (commit, não tela).
