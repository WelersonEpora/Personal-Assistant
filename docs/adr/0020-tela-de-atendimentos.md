# ADR-0020: Tela de Atendimentos (relatório de atividade por período)

**Status:** Aceita e aprovada para implementação (2026-08-28)

> Não revoga nem altera a ADR-0015 (bucketing do ciclo mensal continua por
> `validacao.confirmado_em`), a ADR-0017 (o feed do painel continua por
> `created_at`) nem a ADR-0007. Adiciona uma tela **somente leitura** que
> agrega o que já existe na tabela `registro`, usando `data_atendimento`
> (ADR-0019) como eixo temporal.

## Contexto

Depois da ADR-0019 o Registro passou a ter `data_atendimento` — o **dia em que
o atendimento/avaliação aconteceu de fato**, separado das datas do sistema
(`iniciado_em`, `created_at`, `confirmado_em`). Com isso o produto passou a ter,
pela primeira vez, um dado confiável de *quando o personal atendeu cada aluno*.

O que existe hoje sobre esses dados:

- A tela **Histórico** (`/admin/historico`) lista os Registros já confirmados,
  um por linha, sem nenhum agrupamento ou filtro além de status.
- O **painel** (ADR-0017) usa `MAX(data_atendimento)` só para o alerta "aluno
  parado há X dias" — não há visão de volume, distribuição ou totais por aluno.

Falta uma resposta simples para "o que eu fiz no mês / no trimestre": quantos
atendimentos, para quais alunos, quantas vezes cada um, como se distribuíram no
tempo e nos dias da semana. Hoje o personal só conseguiria isso rolando o
Histórico e contando na mão.

### O que os dados representam — e o que não representam

A tela mede **atendimentos registrados no sistema**, não a agenda real nem
produtividade. Um atendimento só entra na contagem se o personal capturou um
Registro para ele. Se esqueceu de gravar, não existe para a tela. O título, o
texto de apoio e os rótulos devem deixar isso explícito ("atendimentos
registrados no período") para a tela não ser lida como métrica de RH ou como
folha de ponto.

Um **Registro ≈ um atendimento**, mas não sempre: pode haver dois Registros
para o mesmo aluno no mesmo dia, ou um Registro cobrindo vários dias. Por isso a
tela mostra **duas métricas lado a lado**, que respondem perguntas diferentes:

| Métrica | Pergunta que responde |
|---|---|
| **Registros** (`COUNT(registro)`) | "Quanto trabalho eu lancei no sistema?" |
| **Dias distintos de atendimento por aluno** (`COUNT(DISTINCT data_atendimento)` por aluno) | "Quantas vezes eu vi esse aluno?" |

Registros de **avaliação física** (`registro.tipo = avaliacao_fisica`, ADR-0018)
**nunca** são somados aos de atendimento — são uma trilha separada em todos os
números da tela. Avaliação física não é "aula".

Histórico anterior à ADR-0019 é aproximado: aqueles Registros tiveram
`data_atendimento` preenchida no backfill com `iniciado_em::date`, ou seja, para
eles "data do atendimento" = "data da captura". A tela não sinaliza isso linha a
linha; é uma limitação conhecida e aceita.

## Decisão

### Escopo desta ADR

O CLAUDE.md lista "dashboards/relatórios complexos" como fora de escopo do MVP
*sem decisão explícita nova*. Esta ADR **é** essa decisão, restrita a: uma tela
de relatório de atividade, somente leitura, sem tabela nova, sobre a `registro`.
Não abre precedente para relatórios financeiros, de treino, de evolução física
etc. — cada um, se vier, terá a sua.

### Eixo temporal: sempre `data_atendimento`

Toda a tela (KPIs, gráficos, tabelas, filtro de período) usa
`registro.data_atendimento`. É literalmente o campo que a ADR-0019 definiu para
"quando o atendimento aconteceu", e é coerente com a regra de lá: *"Histórico,
painel e prompts da IA usam `data_atendimento` quando o objetivo é 'quando o
atendimento aconteceu'"*.

**Não muda nada da ADR-0015**: o bucketing do ciclo mensal continua por
`validacao.confirmado_em`. São coisas diferentes — o ciclo mensal precisa de
cobertura exata (relato confirmado depois do fechamento do mês não pode ficar
órfão); esta tela é uma leitura exploratória do dia do atendimento.

### Endpoint: `GET /api/v1/atividades`

Autenticado, escopado por `equipe_id` (ADR-0011). Camadas normais:
`atividades.controller` → `atividades.service` → `atividades.repository`.

- **Sem tabela nova, sem view, sem cache.** Só agregação SQL (`COUNT`,
  `COUNT DISTINCT`, `COUNT(*) FILTER`, `GROUP BY date_trunc(...)`,
  `EXTRACT(DOW ...)`) sobre `registro`, várias consultas em paralelo
  (`Promise.all`) — mesmo espírito do `painel.repository` (ADR-0017).
- **Nenhuma escrita.** Não toca `resultado_ia` nem `validacao` — ADR-0007
  intacta.
- **Filtro base de toda consulta:** `equipe_id = :equipe` **e**
  `deletado_em IS NULL`. Registros soft-deletados nunca contam.

#### Parâmetros (query string)

| Param | Tipo | Default | Observação |
|---|---|---|---|
| `de` | `AAAA-MM-DD` | 1º dia do mês corrente | início do período (inclusive) |
| `ate` | `AAAA-MM-DD` | hoje | fim do período (inclusive) |
| `aluno_id` | UUID | — | opcional; restringe a um aluno |
| `tipo` | `atendimento` \| `avaliacao_fisica` | ambos | opcional; filtra a trilha |
| `somente_confirmados` | booleano | `false` | quando `true`, só `registro.status = 'confirmado'`. **A tela `/admin/atendimentos` marca esse toggle por padrão** (mostra o número "fechado"); o default `false` do endpoint vale para outros consumidores |

- `de`/`ate` inválidos ou `de > ate` → `400` (`ValidationError`), sem *clamp*
  silencioso (mesmo critério da janela de data da ADR-0019).
- Janela máxima de **1 ano** entre `de` e `ate` (guarda-corpo de custo; a UI só
  oferece presets até "Este ano"). Acima disso → `400`.
- `somente_confirmados` afeta as duas trilhas do mesmo jeito: filtra
  `status = 'confirmado'`. Para `avaliacao_fisica`, `confirmado` é o Registro
  cuja proposta o personal já revisou e virou `avaliacao_fisica` (ADR-0018).

#### Granularidade do gráfico temporal — escolhida no servidor

Derivada do tamanho do período (não é parâmetro):

| Amplitude `ate − de` | Bucket | Expressão |
|---|---|---|
| ≤ 31 dias | dia | `to_char(data_atendimento, 'YYYY-MM-DD')` |
| ≤ 92 dias | semana (segunda a domingo) | `to_char(date_trunc('week', data_atendimento), 'YYYY-MM-DD')` |
| > 92 dias | mês | `to_char(data_atendimento, 'YYYY-MM')` |

O service devolve a série **já preenchida** — todos os buckets do intervalo,
inclusive os de valor zero — para o gráfico não "pular" períodos vazios. Cada
bucket traz os dois valores (`atendimento`, `avaliacao_fisica`).

#### Formato da resposta (`data`)

```jsonc
{
  "periodo": { "de": "2026-08-01", "ate": "2026-08-28", "granularidade": "dia" },
  "filtros": { "aluno_id": null, "tipo": null, "somente_confirmados": false },
  "resumo": {
    "atendimentos": 47,          // COUNT registro tipo=atendimento
    "avaliacoes_fisicas": 3,     // COUNT registro tipo=avaliacao_fisica
    "alunos_atendidos": 12,      // COUNT DISTINCT aluno_id (tipo=atendimento)
    "dias_com_atividade": 18,    // COUNT DISTINCT data_atendimento (tipo=atendimento)
    "media_por_aluno": 3.9       // atendimentos / alunos_atendidos (0 se não houver)
  },
  "serie_temporal": [
    { "bucket": "2026-08-01", "atendimento": 2, "avaliacao_fisica": 0 },
    { "bucket": "2026-08-02", "atendimento": 0, "avaliacao_fisica": 1 }
    // ... todos os buckets do intervalo
  ],
  "por_aluno": [
    {
      "aluno_id": "…", "nome": "Lucimery Arantes",
      "atendimentos": 11, "avaliacoes_fisicas": 1,
      "dias_distintos": 9,
      "primeiro": "2026-08-02", "ultimo": "2026-08-26"
    }
    // ordenado por atendimentos desc, depois nome
  ],
  "por_dia_semana": [
    { "dow": 1, "atendimentos": 12 }, // 0 = domingo … 6 = sábado (EXTRACT(DOW))
    // ... sempre os 7, inclusive zeros
  ],
  "por_mes": [
    { "mes": "2026-08", "atendimentos": 19, "avaliacoes_fisicas": 2, "alunos_distintos": 10 }
    // ordenado por mês desc
  ]
}
```

- `por_aluno` inclui o aluno mesmo que tenha só avaliação física no período
  (`atendimentos = 0`, `avaliacoes_fisicas > 0`).
- O `nome` vem de um `JOIN` com `aluno` **sem** filtrar `aluno.deletado_em` —
  excluir um aluno depois não apaga o histórico de trabalho que o personal fez
  com ele. Aluno excluído aparece com o nome que tinha (a UI pode marcá-lo).
- `por_dia_semana` e `por_mes` consideram a trilha de atendimento como número
  principal; avaliações vêm juntas só em `por_mes` (a distribuição semanal de 3
  avaliações/mês não diz nada).

### Frontend — tela `Atendimentos`

- **Rota:** `/admin/atendimentos`, nome `admin-atendimentos`, `meta.titulo =
  "Atendimentos"`.
- **Menu:** grupo **REGISTROS**, logo **abaixo de Histórico** (`🗂️`/ícone
  próprio). É a segunda entrada do grupo.
  *(Revisto em 2026-09-02: o grupo REGISTROS foi dissolvido — Atendimentos e
  Radar passaram a "Visão geral" (abaixo de Dashboard) e Histórico foi para
  "Operação", logo abaixo de Revisão, seguindo o fluxo Relatos → Revisão →
  Histórico. Ver adendo no fim desta ADR.)*
- **Layout** (mesma linguagem visual de `DashboardView` — `card`, `kpi-grid`,
  `view-header`):
  1. **Cabeçalho** com uma frase que fixa o significado: *"Atendimentos e
     avaliações que você registrou no período. Conta o que foi lançado no
     sistema, não a agenda."*
  2. **Barra de filtros**: seletor de período (presets *Este mês · Mês passado ·
     Últimos 30 dias · Últimos 90 dias · Este ano · Personalizado*; o
     personalizado usa dois `CampoData.vue`), seletor de aluno (todos / um),
     seletor de tipo (todos / atendimento / avaliação física) e o toggle
     *"somente confirmados"* (**começa marcado**).
  3. **KPIs** (`kpi-grid`): Atendimentos · Alunos atendidos · Média por aluno ·
     Dias com atividade · Avaliações físicas.
  4. **Gráfico temporal**: barras empilhadas (atendimento / avaliação física),
     eixo X na granularidade que o servidor escolheu.
  5. **Ranking por aluno**: barras horizontais, top 8 + "ver todos" (expande a
     lista completa).
  6. **Distribuição por dia da semana**: barras (seg…dom).
  7. **Tabela "Por aluno"**: aluno · atendimentos · dias distintos · avaliações ·
     1º atendimento · último. Ordenável por clique no cabeçalho. Linha do aluno
     linka para a tela do aluno.
  8. **Tabela "Por mês"**: mês · atendimentos · alunos distintos · avaliações
     físicas.
- **Gráficos**: mesmo padrão da avaliação física (ADR-0016) —
  `components/charts/` isolando o ECharts + option-builder puro testável
  (`node:test`), chunk `vendor-echarts` lazy fora do precache do PWA. Como só
  existe `LineChart.vue`, entra um `BarChart.vue` (vertical empilhado e
  horizontal) + `utils/echarts-bar-option-builder.js` com teste.
- **Sem estado offline / sem Pinia** — é tela de leitura do `/admin`, uma
  requisição a cada mudança de filtro (igual ao resto do `/admin`).

### Filtro do Histórico (mesma base)

O Histórico (`/admin/historico`) baixava **todos** os Registros confirmados da
equipe num fetch só, sem filtro nem paginação — "saco sem fundo" com o tempo.
Nesta ADR ele passa a usar o mesmo eixo:

- `GET /api/v1/registros` ganha filtros **opcionais** `de`/`ate` (janela por
  `data_atendimento`), `aluno_id` e `tipo` — retrocompatível: sem parâmetros, o
  comportamento é o de antes (usado pela fila de revisão e pelo badge da
  navegação, que continuam chamando só com `status`). Datas inválidas ou
  `de > ate` → `400` (mesmo `validarDataIso` da tela de Atendimentos, extraído
  para `shared/utils/periodo.js`).
- A tela abre em **"Últimos 90 dias"** e só lista `tipo = atendimento` — Registro
  `tipo = avaliacao_fisica` sai do Histórico (já tem a tela de Avaliações
  Físicas do aluno; além disso não tem `validacao`, então aparecia quebrado).
  Deep-link vindo do perfil do aluno (`?registro=<id>`) abre em **"Tudo"** para o
  alvo não cair fora da janela.
- O seletor de período vira um componente compartilhado
  (`components/SeletorPeriodo.vue` + `utils/periodos.js`), usado pelas duas telas.
  O preset **"Tudo"** existe para o Histórico (sem limite); a tela de
  Atendimentos não o oferece (o endpoint `/atividades` limita a 1 ano).
- A ordenação do Histórico continua por `confirmado_em`; só o **recorte** é por
  `data_atendimento`.

### Fora do escopo desta primeira versão

- **Cadência média** (dias entre atendimentos por aluno). O `por_aluno` já
  devolve `primeiro`/`ultimo`/`dias_distintos`, então o cálculo
  (`(ultimo − primeiro) / (dias_distintos − 1)`) pode ser adicionado na UI ou no
  service depois **sem mudança de contrato**. Fica de fora agora para não
  carregar a primeira entrega com uma métrica de leitura ambígua.
- **Exportar CSV / copiar tabela.** Natural como evolução; não entra agora.
- **Heatmap de calendário.** A distribuição por dia da semana cobre o essencial.
- **Comparação entre períodos** (mês vs mês anterior lado a lado).
- **Metas / esperado por aluno.** A tela não sabe a agenda contratada.

## Alternativas consideradas

- **Estender o `GET /api/v1/painel`.** Rejeitada — o painel é o resumo do "meu
  dia" (ADR-0017), sempre a mesma janela; esta tela é paramétrica (período,
  aluno, tipo). Misturar sobrecarregaria um payload que hoje é O(1).
- **Calcular no cliente a partir de `GET /api/v1/registros`.** Rejeitada — é
  exatamente o antipadrão que a ADR-0017 desfez: baixar a lista inteira e
  agregar no navegador. Não escala e espalha regra de negócio.
- **Bucketizar por `confirmado_em`** (como o ciclo mensal). Rejeitada — a
  pergunta da tela é "quando atendi", não "quando revisei"; um relato de sexta
  confirmado só na segunda seguinte cairia no bucket errado. `data_atendimento`
  é o campo certo (ADR-0019).
- **Contar só Registros confirmados.** O *endpoint* fica permissivo por padrão
  (`somente_confirmados = false`) — o atendimento aconteceu mesmo antes da
  revisão, e outros consumidores não devem herdar um filtro implícito. Mas a
  *tela* abre com o toggle **marcado**: o personal quer primeiro o número
  "fechado" (só o que ele já revisou) e desmarca para enxergar o backlog de
  revisão (que é justamente o mais recente). Default de UI ≠ default de API.
- **Uma métrica só de "atendimentos".** Rejeitada — `COUNT(registro)` e "dias
  distintos por aluno" divergem quando há mais de um Registro no mesmo dia
  (atendimento em família, correção). Mostrar as duas evita interpretação
  errada.
- **Tabela/materialização de "sessão de treino".** Rejeitada — é justamente o
  sistema legado que o CLAUDE.md manda não antecipar. A `registro` já tem tudo
  que a tela precisa.
- **Nome do endpoint `/atendimentos`** (para casar com a rota). Mantido
  `/atividades` — a rota de UI fala a língua do personal ("meus atendimentos"),
  o endpoint agrega mais de um `tipo` de Registro (atendimento **e** avaliação
  física), então "atividades" descreve melhor o recurso.

## Consequências

- **Schema:** nenhuma mudança. Só leitura sobre `registro` (+ `JOIN aluno` para
  o nome). O índice `(aluno_id, data_atendimento)` criado na ADR-0019 já cobre
  as consultas por aluno; as agregações por período fazem *range scan* em
  `data_atendimento` — aceitável no volume atual (dezenas a centenas de
  Registros por equipe). Se crescer, um índice em
  `(equipe_id, data_atendimento)` resolve sem mudar contrato.
- **Backend:** `atividades.{controller,service,repository}.js` +
  `atividades.routes.js` montado em `/api/v1/atividades` no `routes/index.js`.
  `shared/utils/periodo.js` (`validarDataIso`, também usado pelo
  `registro.service`). `GET /api/v1/registros` ganha `de`/`ate`/`aluno_id`/`tipo`
  opcionais (retrocompatível). Testes de integração: `atividades.service.test.js`
  (default de período, granularidade, buckets vazios, separação atendimento ×
  avaliação, `somente_confirmados`, filtro por aluno, isolamento por equipe, 400
  em datas inválidas / `de > ate` / janela > 1 ano) e novos casos em
  `registro.service.test.js` (janela por `data_atendimento`, `aluno_id`, `tipo`,
  retrocompatibilidade sem filtro).
- **Frontend:** `views/admin/AtividadesView.vue`, `services/atividades.service.js`,
  `components/charts/BarChart.vue`, `utils/echarts-bar-option-builder.js`
  (+ teste puro), `components/SeletorPeriodo.vue` + `utils/periodos.js`
  (+ teste puro, compartilhado com o Histórico), filtro em
  `views/admin/HistoricoView.vue`, entrada no menu (`AdminShell.vue`) e rota
  (`router/index.js`).
- **ADR-0015 e ADR-0017 intactas** — nenhuma mudança em bucketing mensal nem no
  feed do painel.
- Novo lugar natural para o personal responder "o que eu fiz" sem planilha;
  ponto de partida para exportação e comparação de períodos quando houver
  demanda.

## Adendo (2026-09-01): filtro e recorte por personal

Contexto: uma equipe (ADR-0011) pode ter mais de um `membro`. A tela agregava
todo o trabalho da equipe sem forma de olhar um personal específico.

- **Eixo:** `registro.usuario_id` — "quem capturou o Registro" (auditoria,
  ADR-0011). Na prática (captura offline no login do próprio personal) equivale
  a "quem atendeu". É uma **lente de leitura, não controle de acesso** — o
  enforcement por papel continua fora de escopo (ADR-0011). Usa `usuario_id` do
  Registro (não `validacao.usuario_id`): a pergunta é "quem atendeu", e o filtro
  precisa valer também para Registros ainda não confirmados.
- **`GET /api/v1/atividades` ganha `membro_id` opcional** (o cliente fala a
  língua de equipe; o service resolve `membro → usuario_id` e valida que o
  membro é da equipe do token — `400` se não for). Retrocompatível.
  `construirWhere` aplica `usuario_id` a **todas** as agregações.
- **Novo bloco `por_membro`** na resposta (mesmo par de métricas do `por_aluno`
  + `alunos_distintos`), ordenado por atendimentos desc. `personal_na_equipe`
  marca quem já saiu — o Registro e o trabalho feito continuam contando.
- **Novo campo `personais`** na resposta (`membro_id` + `nome` + `ativo` de
  todos os membros da equipe, ordenado por nome) — é a fonte do seletor da
  tela. Vem do `atividades.repository` (escopo por equipe), **não** do endpoint
  `/api/v1/membros` (owner-only, ADR-0011): qualquer membro precisa conseguir
  usar o filtro. Independe do período e dos filtros ativos.
- **Frontend:** seletor "Personal (quem registrou)" na barra de filtros e a
  seção "Atendimentos por personal" (ranking + tabela) só aparecem quando
  `personais` tem mais de um item (`por_membro` para a seção). Equipe solo não
  vê nem o filtro nem a seção.
- Sem tabela nova, sem escrita, ADR-0007 intacta. `GET /api/v1/registros` (e o
  Histórico) **não** ganham o filtro nesta rodada.

## Adendo (2026-09-02): a tela "Relatos" para no `confirmado`

Contexto: o mesmo "saco sem fundo" que o Histórico tinha (§ "Filtro do
Histórico") sobrava na tela **Relatos** (`/admin/registros`,
`RegistrosView.vue`), que fazia `listar({})` — todos os Registros da equipe, de
sempre — e ainda re-baixava tudo a cada 20 s de *polling*.

Em vez de replicar o filtro de período, a tela **muda de propósito**: passa a
ser a **caixa de entrada do pipeline** — só Registros que ainda não viraram
dado oficial. Isso é coerente com o ciclo de vida do Registro (ADR-0002): ao
confirmar, ele já virou `validacao` e seu lugar é o Histórico.

- **`GET /api/v1/registros` aceita `status = "abertos"`** → `status <> 'confirmado'`
  (traduzido no `registro.service`, `Op.ne`). Qualquer outro valor continua
  sendo filtro por status exato; sem `status`, comportamento de antes.
  Retrocompatível.
- **`RegistrosView.vue`** chama `listar({ status: 'abertos' })`. Isso também
  limita o payload do *polling* (para de trazer todo confirmado histórico). O
  filtro "Confirmados" sai da barra de abas; "Com erro" fica (estado aberto que
  pede ação). *Empty state* e cabeçalho apontam para o Histórico.
- Sem janela de tempo aqui: a fila de pipeline é naturalmente limitada e um
  `data_atendimento` retroativo (ADR-0019) não pode esconder um Registro
  `aguardando_revisao`. Se a lista cresce, é sinal de backlog de revisão — que é
  o que a tela existe para mostrar.
- `AcompanhamentoAluno.vue` (linha do tempo do aluno) e o badge de navegação
  (`AdminShell.vue`, `status = 'aguardando_revisao'`) não mudam.
- Sem tabela nova, sem escrita, ADR-0007 intacta. Teste novo em
  `registro.service.test.js` (`status = "abertos"` traz não confirmados, exclui
  confirmados).

## Adendo (2026-09-02): `FiltroSegmentado` — chips no desktop, dropdown no mobile

Puro UI, sem contrato. As réguas de chips de filtro de opção única
(`.filter-tab`) empilhavam em 2-3 linhas no mobile (viewing `/admin` no celular),
ocupando altura e escondendo qual estava ativo.

`components/FiltroSegmentado.vue` (`v-model` + `opcoes: [{ valor, rotulo }]` +
`rotulo` da dimensão): no desktop, a mesma régua de chips de antes; em
`≤ 760px` (breakpoint do `/admin`), um único botão com o estilo do chip ativo
+ chevron que abre a lista (mesmo padrão do menu "⋯" de `AlunoDetalheView` —
`click`-fora / `Escape` para fechar). Prop `multiple`: seleção múltipla
(`modelValue` é array; vazio = "todos"; rendera a opção "Todos"/`rotuloTodos`
que limpa; o menu não fecha ao marcar). Trocado em 4 telas: `RegistrosView`
(status), `SeletorPeriodo` (presets, usado por Histórico + Atendimentos),
`ExerciciosView` (origem) e `RadarView` (assunto, `multiple` — a régua de
`gruposSelecionados` do ADR-0022; a caption "ASSUNTO" some no mobile, o botão já
rotula). `AvaliacaoFisicaComparar` (seleção de métricas do gráfico) fica de
fora. Não vira ADR própria — é refinamento visual do mesmo assunto de filtros
desta ADR.

## Adendo (2026-09-02): reorganização do menu do `/admin`

Puro `NAV_ITEMS` em `AdminShell.vue`, sem rota nem tela nova. Os grupos
"Registros" (Histórico + Atendimentos) e "Radar" (só Radar) eram pequenos
demais e a posição de cada tela não seguia como ela é usada. Passa a dois
grupos de trabalho + Sistema:

- **Visão geral** (leitura / panorama): **Dashboard · Atendimentos · Radar**.
  Atendimentos é relatório agregado somente-leitura ("o que eu fiz"),
  Radar é acompanhamento da área — nenhum é pipeline. Ficam junto do Dashboard.
- **Operação** (o pipeline, na ordem do fluxo): Alunos · Exercícios · **Relatos
  → Revisão → Histórico**. Histórico sai do grupo "Registros" e vai para logo
  abaixo de Revisão — o menu passa a ler na sequência real (entra em Relatos,
  confirma em Revisão, arquiva em Histórico, ADR-0002).
- **Sistema**: inalterado.

Revoga a linha "grupo REGISTROS, abaixo de Histórico" desta ADR e "grupo
próprio, antes de Sistema" da ADR-0022 — as duas eram escolhas fracas de
posição, não decisões de arquitetura.
