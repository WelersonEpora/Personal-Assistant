# ADR-0017: Endpoint de painel agregado para o dashboard

**Status:** Aceita (2026-08-28)

## Contexto

O dashboard do `/admin` foi feito no começo do projeto, quando a única coisa
que existia era o pipeline de relatos (Registro → IA → validação). Ele era
100% client-side: `DashboardView.vue` baixava a lista **inteira** de
Registros da equipe (`GET /api/v1/registros`, com o JSON de `validacao`
embutido em cada linha) e calculava quatro KPIs e duas listas no navegador.

Dois problemas se acumularam:

1. **Não escala.** Toda abertura do dashboard puxa todos os relatos
   históricos. Três telas (`DashboardView`, `RegistrosView`, `AdminShell`)
   fazem esse mesmo fetch, cada uma com seu `setInterval`.
2. **Só enxerga relatos.** Depois vieram catálogo de exercícios e Ficha de
   Treino (ADR-0013), Acompanhamento Individual Mensal (ADR-0015) e
   Avaliação Física (ADR-0016). Nada disso aparece no dashboard — o personal
   não tem, num lugar só, a visão de quem está sem ficha, com avaliação
   vencida, sem relato há semanas, ou de como fechou o ciclo mensal.

Também havia um bug pequeno: "alunos atendidos hoje" usava `created_at` do
Registro (quando o servidor recebeu) em vez de `iniciado_em` (data da
sessão) — relato capturado offline ontem e sincronizado hoje contava como
hoje.

## Decisão

### Um endpoint agregado, somente leitura

`GET /api/v1/painel` — autenticado, escopado por `equipe_id` (ADR-0011),
monta todo o resumo do dashboard numa passada só no servidor. Camadas
normais: `painel.controller` → `painel.service` → `painel.repository`.

- **Sem tabela nova, sem view materializada, sem cache.** Só `COUNT` e
  `findAll` enxutos com `attributes` estreitos, várias em paralelo
  (`Promise.all`). As varreduras por aluno usam subquery no `SELECT` —
  mesmo padrão dos contadores já existentes em `aluno.repository.js`.
  Escala de dezenas de alunos por equipe (hoje 1 equipe por usuário).
- **Nada de escrita.** O service não toca `resultado_ia` nem `validacao` —
  a garantia estrutural da ADR-0007 continua intacta.

### O que o payload traz

| Bloco | Conteúdo |
|---|---|
| `acao_necessaria` | relatos aguardando revisão, relatos com erro (retomáveis), acompanhamentos mensais com `falha`, alunos ativos sem relato há > N dias, e — só quando > 0 — relatos em processamento pela IA (linha informativa) |
| `resumo` | alunos ativos/total, relatos confirmados (7d — número principal — e 30d), relatos capturados 30d, em processamento, ciclo mensal (gerados / dados insuficientes / falha / pendentes) |
| `panorama` | alunos ativos sem ficha ativa, com ficha antiga, com avaliação física vencida, com acompanhamento mensal `dados_insuficientes` no mês de referência, aniversariantes dos próximos 30 dias |
| `atividade_recente` | feed unificado (relato, avaliação física, ficha, acompanhamento) — só lançamentos dos últimos 30 dias (por `created_at`/`gerada_em`, não a data do evento), no máx. 4 por tipo, mesclados por timestamp, teto de 12 |
| `catalogo` | nº de exercícios visíveis, nº de fichas ativas |
| `pendentes_revisao` | atalho para o badge da navegação |

Cada lista vem recortada (`itens` + `total`) — o dashboard mostra os
primeiros e um "+N", com link para a tela completa.

### Opt-out por aluno

Nem todo aluno contrata todos os serviços do personal (treina por conta, não
fez avaliação física etc.). Duas colunas booleanas em `aluno`, opt-out
(default `false`, sem backfill), editáveis pelo `PUT /api/v1/alunos/:id` que
já existe (mesma família de `ativo`/`favorito`), cada uma com um switch no
topo da sua seção na tela do aluno:

| Coluna | Tira o aluno de | Efeito na tela |
|---|---|---|
| `dispensa_ficha_treino` | `sem_ficha_ativa`, `ficha_antiga` | seção de Ficha de Treino fica recolhida |
| `dispensa_avaliacao_fisica` | `avaliacao_fisica_vencida` | esconde só o "＋ Nova avaliação"; o histórico continua visível |

Não-destrutivo nos dois casos: fichas e avaliações já registradas continuam
salvas e reaparecem se o personal reativar.

### Limiares como constantes

`DIAS_SEM_RELATO = 21`, `SEMANAS_FICHA_ANTIGA = 8`,
`DIAS_AVALIACAO_FISICA_VENCIDA = 180`, `JANELA_ANIVERSARIANTES_DIAS = 30` —
constantes no `painel.service.js`, como `MINIMO_RELATOS` na ADR-0015 (também
exposta em `panorama.limiares.minimo_relatos_acompanhamento`). Viram config
por equipe se e quando houver demanda; hoje não há tela de config de equipe
para isso. Os valores vão no payload em `panorama.limiares` e a
`DashboardView` os exibe como legenda de cada card do panorama.

### Backlog do acompanhamento mensal (`dados_insuficientes`), por nome

O KPI "Acompanhamento Individual {mês}" mostrava só a contagem agregada
(`gerados/ativos`, "N pendente(s) · M sem dados") — o personal não tinha como
descobrir **quais** alunos precisavam de ação. O job mensal
(`gerador-avaliacao-mensal.js`) só reprocessa `falha` automaticamente; um
ciclo `dados_insuficientes` fica parado até alguém agir, e o alvo do job
("mês anterior a agora") rola junto com o calendário — depois que o mês
vira, ele nunca mais volta a mirar aquele `ano_mes`. Por isso
`panorama.acompanhamento_sem_dados` lista, por nome, os alunos com
`avaliacao_mensal.status = dados_insuficientes` no mês de referência
(`relatos_considerados` incluso), cada linha levando à aba Acompanhamento do
aluno — mesmo padrão dos outros cards do panorama. `pendente` (ciclo ainda
não processado pelo job) fica de fora dessa lista: é transitório (o job roda
a cada 6h) e não pede ação do personal, só listar geraria ruído. `falha`
continua só em `acao_necessaria` (problema técnico, não falta de relato).

### Frontend

`DashboardView.vue` passa a consumir `/painel` e é reorganizado em seções:
**Ação necessária** (só renderiza quando há algo) → **KPIs** → **Panorama
dos alunos** + **Atividade recente** → rodapé de catálogo. Relato com erro
ganha botão de reprocessar inline. `AdminShell` fica como está nesta rodada
(o polling do badge já filtra por status no servidor); `pendentes_revisao`
no payload deixa a porta aberta para unificar depois.

## Alternativas consideradas

- **Manter client-side, só adicionar chamadas.** O dashboard faria N
  requisições (alunos, avaliações, fichas…) e cruzaria tudo no navegador.
  Mais tráfego, lógica de negócio no cliente, e o problema de escala do
  fetch de relatos continuaria.
- **View materializada / cache.** Complexidade de invalidação sem ganho real
  no volume atual. As queries diretas voltam em dezenas de milissegundos.
- **Vários endpoints pequenos** (`/painel/resumo`, `/painel/panorama`…).
  Mais rotas para um consumidor só (uma tela). Um payload, um round-trip.

## Consequências

- O dashboard deixa de baixar a lista inteira de relatos; a carga é O(1) em
  requisições e barata no banco.
- Toda a lógica dos indicadores (o que é "vencido", "antigo", "parado")
  fica no backend, testável — `painel.service.test.js` cobre a derivação de
  cada bloco e o isolamento por equipe.
- Novo lugar natural para pendurar indicadores quando surgirem novas áreas —
  a próxima só precisa de mais uma query no `painel.repository`.
- `GET /api/v1/registros` continua existindo e sendo usado por
  `RegistrosView`; nada foi removido.
