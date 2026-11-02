# ADR-0015: Acompanhamento Individual Mensal

**Status:** Aceita (2026-08-27); adendo 2026-11-02 — relatos agrupados pelo mês do atendimento

## Contexto

O personal precisa acompanhar a evolução de cada aluno ao longo do tempo, não
só relato a relato. Reenviar todo o histórico de relatos para a IA a cada
análise cresce sem limite (custo e qualidade degradam conforme o aluno
acumula meses de casa) e mistura informação estável com informação recente.

A ideia: fechar o mês com uma avaliação do aluno gerada a partir dos relatos
daquele mês; essa avaliação vira um **contexto consolidado** compacto que
alimenta o mês seguinte, junto só com os novos relatos. O ciclo se repete,
sem reenviar histórico antigo.

O ponto sensível: a proposta original dizia que o personal "não precisa
validar a avaliação". Isso **não pode** significar que a IA passou a gravar
dado oficial sem revisão — isso violaria a ADR-0007 e a regra do CLAUDE.md
contra confirmação automática sem revisão humana.

## Decisão

### Uma terceira categoria de dado, que nunca é oficial

| Camada | Tabela(s) | Natureza | Quem escreve |
|---|---|---|---|
| Evidência bruta | `registro_entrada`, `transcricao` | imutável | pipeline de sync |
| Proposta da IA (relato) | `resultado_ia` | proposta | worker de IA |
| **Dado oficial** | `validacao` | verdade confirmada | **só** `POST /registros/:id/confirmar` |
| **Camada interpretativa derivada** | `avaliacao_mensal` | sempre regenerável, nunca verdade | job/endpoint deste ADR |

`avaliacao_mensal` guarda as duas partes da saída da IA: `avaliacao_json` (a
avaliação voltada para leitura do personal) e `contexto_consolidado_json` (o
contexto compacto que entra no próximo ciclo). **Nenhum código que toca essa
tabela escreve em `validacao`** — a garantia estrutural da ADR-0007 continua
intacta. Um teste cobre isso explicitamente.

Não há tela de validação. Para corrigir ou complementar, o personal **registra
um novo relato normalmente**, que é considerado no ciclo seguinte.

### Gatilho de geração

- Só gera avaliação com a IA quando há **≥ 3 relatos confirmados no mês**
  (`MINIMO_RELATOS`, reduzido de 5 para 3 em 2026-09-22 — aluno com aula
  semanal já cai a 3 relatos num mês com um feriado ou falta, e não fazia
  sentido travar o acompanhamento nesse caso comum; com menos evidência a
  leitura de tendência fica mais rasa, mas isso é aceitável porque a
  avaliação nunca é dado oficial).
- Com 0 a 2 relatos **no job automático**: registra o ciclo como
  `dados_insuficientes`, **não chama a IA**, e carrega o contexto consolidado
  do mês anterior adiante sem alteração.
- Com 0 a 2 relatos **numa geração manual pelo personal**: **não registra
  nada** — o backend devolve uma resposta não persistida
  (`persistida: false`, com `mensagem` e a contagem de relatos); a UI mostra
  o aviso, o estado do mês não muda (uma avaliação já existente fica intacta)
  e o personal pode gerar de novo assim que confirmar mais relatos. Mesma
  lógica da análise sob demanda: como há um humano na frente para ler o
  aviso, não faz sentido gravar um registro formal de um ciclo que não
  produziu avaliação — e evita que um `dados_insuficientes` prematuro
  "tranque" o mês contra o job automático (que pula qualquer linha que não
  esteja em `falha`).

### Mês de referência = mês de confirmação (substituído — ver adendo 2026-11-02)

Um relato entra na avaliação do mês em que sua `validacao.confirmado_em` cai
— não a data da sessão. Assim cada relato confirmado cai em **exatamente um**
ciclo, nenhum fica de fora, e regerar um mês passado é determinístico. A data
real da sessão vai no prompt para a IA situar a linha do tempo.

### Contexto enviado à IA

Apenas: (1) o `contexto_consolidado_json` do mês anterior; (2) os relatos
confirmados do mês (itens confirmados + nota geral de cada `validacao`).
Relatos de meses anteriores nunca são reenviados. Avaliação física **não**
entra por ora — a estrutura (`estado_atual`, blocos do prompt) já comporta
adicioná-la depois sem migração.

### Estrutura da resposta

Saída estruturada do Gemini (`responseSchema`, mesmo padrão de
`interpretarRegistro`), com duas partes: `avaliacao_mensal` (periodo,
dados_insuficientes, relatos_considerados, resumo_geral, dimensoes[] com
evidências rastreáveis, destaques, alertas, recomendacoes,
pendencias_confirmacao, mudancas_vs_mes_anterior) e `contexto_consolidado`
(aluno_id, gerado_em, cobre_ate, linha_de_base, estado_atual,
evolucao_relevante, marcos, hipoteses_abertas, lacunas). Toda lista é array
de objetos rasos, limitada em tamanho pelo prompt — o contexto não cresce
indefinidamente.

### Anti-"erro da IA vira fato"

- Cada item do contexto é marcado como `fato` / `interpretacao` / `hipotese`
  e carrega `origem` (`relato:<id>`, `contexto` ou `interpretacao`).
- O contexto do mês anterior entra no prompt como **hipótese a revalidar**,
  não como fato; contradição vira `mudancas_vs_mes_anterior` /
  `pendencias_confirmacao`.
- `hipoteses_abertas` têm `ciclos_sem_reforco`: o que não recebe evidência
  nova por vários ciclos é descartado.
- `baseada_em_registro_ids` guarda de quais relatos aquele ciclo saiu.
- Regenerar um mês (endpoint manual) reconstrói tudo a partir dos relatos
  confirmados — a linha é sobrescrita, não versionada.

### Análise sob demanda

Além do ciclo mensal, o personal pode pedir uma **análise pontual** a
qualquer momento (`analise_sob_demanda`, tabela própria).

- **Só vira registro quando a IA foi efetivamente acionada.** Sem relatos
  recentes, ou se a IA julgar os dados insuficientes, o backend devolve uma
  resposta **não persistida** (`persistida: false`, com `mensagem`) — a UI
  mostra o aviso, nada entra no histórico e **nada é consumido**. Só `gerada`
  (análise produzida) e `falha` (a IA foi chamada e deu erro) viram linha.
- **Retry de uma `falha` sobrescreve a mesma linha.** Se a última análise do
  aluno é uma `falha` (ex.: provedor indisponível), a próxima tentativa —
  nova `falha` ou `gerada` — atualiza essa linha em vez de criar outra. O
  feed não acumula "Falha ao gerar" repetidos e a linha "vira" `gerada`
  quando a IA volta. Uma `falha` depois de uma `gerada` (mais de 7 dias) abre
  uma linha nova.
- **Limite: 1 análise `gerada` a cada 7 dias por aluno.** `falha` não consome
  a janela (o personal não é penalizado por uma falha do provedor). O `GET`
  devolve a disponibilidade (`proxima_disponivel_em`) para a UI mostrar
  quando libera.
- **Não substitui** o acompanhamento mensal e **não altera** o contexto
  consolidado: usa a versão mais recente do contexto mensal apenas como
  referência, somente leitura (`contexto_referencia_id`).
- Considera os relatos confirmados **ainda não consolidados** — `confirmado_em`
  posterior ao fim do último mês fechado (ou dos últimos 60 dias, se não
  houver nenhum fechamento).
- Continua sendo interpretação da IA, nunca dado oficial. Schema próprio
  (`SCHEMA_ANALISE_SOB_DEMANDA`) — igual à parte `avaliacao_mensal` do mensal,
  sem a parte `contexto_consolidado`.

> Contraste com o **job mensal**: lá, "dados insuficientes" (< 3 relatos)
> **vira** registro (`avaliacao_mensal` com `status = dados_insuficientes`),
> porque o job roda sem interação humana, precisa marcar que aquele ciclo
> aconteceu e carregar o contexto consolidado adiante. Tanto a análise sob
> demanda quanto a **geração manual da avaliação mensal pelo personal** não
> gravam nada nesse caso — há um humano na frente para ler o aviso, não faz
> sentido gravar um registro formal de algo que não produziu análise, e no
> caso do mensal isso ainda evita que um `dados_insuficientes` prematuro
> tranque o mês contra o job.

### Avaliação do personal (sem IA)

O profissional pode registrar a **sua própria leitura** do aluno — texto
livre, sem IA (`avaliacao_personal`, tabela própria: `autor_id`, `texto`,
timestamps). Fica na mesma tela de Acompanhamento; CRUD completo (o autor
edita/exclui à vontade — não é dado oficial nem saída de IA).

Ela **entra no prompt dos ciclos de IA**, junto dos relatos:
- **Ciclo mensal:** avaliações com `created_at` na janela do mês (mesmo
  bucketing dos relatos). Só vão para a IA quando o ciclo efetivamente roda
  (≥ 3 relatos confirmados) — **não** alteram o gatilho. Os ids consumidos
  ficam em `avaliacao_mensal.avaliacoes_personal_consideradas`. Num mês
  `dados_insuficientes` a avaliação daquele mês não é enviada (aceita-se a
  perda — v1 simples).
- **Análise sob demanda:** avaliações escritas após o último fechamento
  mensal (mesmo `desde` dos relatos). Aqui uma avaliação do personal **sozinha**
  (0 relatos recentes) já habilita a análise. Ids em
  `analise_sob_demanda.baseada_em_avaliacao_personal_ids`.

No prompt, a avaliação do personal é apresentada como a leitura do próprio
profissional: **peso alto**, pode corrigir/derrubar hipóteses do contexto e
relativizar os relatos — mas ainda é um insumo a integrar (origem
`personal:<id>`), não texto para copiar, e a IA deve apontar divergências
entre ela e os relatos.

Editar uma avaliação depois que ela já entrou num ciclo **não** reescreve
aquele ciclo (os ciclos são snapshots).

### Persona: Personal Trainer Sênior

O prompt das duas análises (mensal e sob demanda) parte de uma persona comum
(`PERSONA_PERSONAL_SENIOR`): a IA atua como um **personal trainer sênior**,
com conhecimento técnico atual em treinamento, fisiologia do exercício,
biomecânica, recuperação e adesão/comportamento. Ela deve analisar
criticamente, apontar padrões/evolução/inconsistências/pontos de atenção,
**não concordar só para agradar**, deixar explícito quando os dados são
insuficientes, diferenciar fato/interpretação/hipótese e nunca inventar. É
**apoio técnico** à análise do profissional, não substituta da decisão dele.

### Processamento

- **Job mensal em processo** (`jobs/gerador-avaliacao-mensal.js`):
  `setInterval` de 6h, roda no boot, fecha sempre o **mês anterior**.
  Idempotente — só gera o que falta; `falha` é retentada, `gerada` e
  `dados_insuficientes` são puladas. Falha isolada por aluno não derruba o
  lote (mesmo princípio da ADR-0009).
- **Geração/regeneração manual**: `POST /api/v1/alunos/:id/avaliacoes-mensais/:anoMes/gerar`.
- Diferente do pipeline de Registro (ADR-0009, fila reativa a cada
  sincronização), este é um lote mensal — daí o agendador de intervalo em vez
  da fila acordada por evento. Continua sem dependência de infraestrutura
  nova.

## Alternativas consideradas

- **Reenviar todo o histórico de relatos a cada análise.** Rejeitada — custo
  e tamanho do contexto crescem linearmente e sem limite; a informação
  estável é re-paga todo mês; a qualidade da atenção do modelo cai com
  dezenas de milhares de tokens de baixa densidade. Estimativa: ~5× mais
  tokens de entrada no ano 1, ~10× no ano 2.
- **A avaliação mensal como dado oficial (sem revisão).** Rejeitada — viola a
  ADR-0007. A saída: a avaliação é uma camada derivada, sempre regenerável,
  que nunca escreve em `validacao`.
- **Guardar histórico versionado das avaliações de cada mês.** Rejeitada por
  ora — não é dado oficial; um registro por (aluno, mês), sobrescrito na
  regeneração, é suficiente. `baseada_em_registro_ids` + os relatos
  confirmados (imutáveis) permitem reconstruir qualquer mês.
- **Redis/BullMQ ou cron externo para o job.** Rejeitada — mesmo raciocínio
  da ADR-0009; um `setInterval` idempotente no processo basta para um lote
  mensal.
- **Bucketizar relatos pela data da sessão.** Rejeitada na v1 (revista no adendo 2026-11-02) — relato confirmado
  depois do fechamento do mês ficaria órfão ou exigiria reabrir meses
  fechados. `confirmado_em` garante cobertura exata.
- **Análise sob demanda atualizando o contexto consolidado / reusando a
  tabela `avaliacao_mensal`.** Rejeitada — misturaria a leitura pontual com a
  memória do ciclo mensal e permitiria que uma análise fora de hora
  alterasse o que o próximo mês herda. Tabela própria, contexto mensal só
  como referência de leitura.
- **Limite de 7 dias contando qualquer solicitação.** Rejeitada — punir o
  personal por pedir quando ainda não há dados (ou quando a IA falhou) é
  hostil. Só análise efetivamente `gerada` consome a janela.
- **Registrar toda solicitação sob demanda (inclusive as sem análise).**
  Rejeitada — a v1 fazia isso e o resultado era um histórico poluído de
  "não-análises" e a impressão de que a tentativa tinha "contado". Agora só
  registra o que a IA produziu; o resto é uma mensagem em tela (o
  `logger.info` guarda o rastro para observabilidade).
- **Avaliação do personal como um relato (ou entrada de Registro).**
  Rejeitada — um relato passa por transcrição → interpretação → confirmação
  (pesado) e é sobre um atendimento. A avaliação do personal é meta (opinião
  do profissional sobre o momento do aluno) e merece um caminho leve:
  escreveu, salvou.
- **Avaliação do personal disparando o ciclo mensal / rolando entre meses.**
  Rejeitada na v1 — mantém o gatilho de relatos intacto e o bucketing por
  mês idêntico ao dos relatos. Carry-forward de avaliações não consumidas
  fica como evolução possível se a perda em meses esparsos incomodar.

## Consequências

- Novas tabelas `avaliacao_mensal` (migração `20260827120000`),
  `analise_sob_demanda` (`20260827130000`) e `avaliacao_personal`
  (`20260827140000`), + colunas de rastreio de avaliação do personal nas duas
  primeiras (`20260827150000`). Cada uma com modelo, repository, service,
  controller e rotas aninhadas em `/api/v1/alunos/:id`; job só para o ciclo
  mensal.
- Novas funções `gerarAvaliacaoMensal` e `gerarAnaliseSobDemanda` em
  `services/ia/gemini.service.js` (2ª e 3ª saídas estruturadas do sistema),
  ambas partindo da persona `PERSONA_PERSONAL_SENIOR`.
- Frontend: o acompanhamento **não é tela própria** — é uma das abas da
  tela de detalhe do aluno (`AlunoDetalheView.vue` + componente
  `AcompanhamentoAluno.vue`; a rota antiga `/admin/alunos/:id/acompanhamento`
  redireciona para o detalhe). Uma **linha do tempo agrupada por mês** (card
  por mês, mais recente primeiro) reúne, lado a lado: os **relatos**
  (evidência bruta — em andamento e confirmados, componente `RegistroCard.vue`,
  ver docs/adr/0002), a **avaliação mensal** da IA (âncora do card), as
  **análises sob demanda** e as **avaliações escritas pelo personal**. O card
  do mês corrente é o hub de ações (gerar/regerar o mês, solicitar análise,
  escrever avaliação — editor inline). Filtros por tipo. Sem etapa de
  validação. A geração manual com dados insuficientes não persiste (ver
  "Gatilho de geração").
- Depois desta ADR, **Ficha de Treino (ADR-0013) e Avaliações Físicas
  (ADR-0016) também deixaram de ser tela própria** — pela mesma razão: são
  abas do mesmo slot no `AlunoDetalheView.vue`, com o card de identidade do
  aluno sempre visível por cima. Componentes `FichaTreinoSecao.vue` e
  `AvaliacoesFisicasSecao.vue` (corpo das telas antigas, sem `← Voltar` /
  `<h1>` / fetch do aluno). A aba fica no query (`?aba=ficha` /
  `?aba=avaliacoes`); as rotas `/admin/alunos/:id/ficha-treino` e
  `/admin/alunos/:id/avaliacoes-fisicas` redirecionam com o `aba` certo.
- O backend continua um único processo Node; escalar para múltiplas
  instâncias exigiria revisar o agendador (mesma limitação já registrada na
  ADR-0009).
- Quando o sistema legado / avaliação física estruturada entrar, ela vira um
  terceiro bloco no prompt e uma dimensão em `estado_atual`, sem quebrar o
  schema atual.

## Adendo (2026-11-02) — mês de referência = mês do atendimento

**Substitui a seção "Mês de referência = mês de confirmação" e a alternativa
rejeitada "Bucketizar relatos pela data da sessão".**

### Contexto

Com a data do atendimento separada das datas do sistema (ADR-0019), o critério
por `confirmado_em` passou a produzir fechamentos errados. O personal registra
ou revisa relatos de dias anteriores, e isso é rotina. Um caso real: os
atendimentos de 29/10 e 31/10 foram confirmados em 02/11. O job de 01/11 fechou
outubro com 1 relato ("dados insuficientes"), regerar outubro continuava com 1
relato, e os relatos de outubro iam parar no Acompanhamento de novembro. A Linha
do Tempo, que já posicionava o relato pela data do atendimento, mostrava
"Outubro · 4 relatos" num mês que a geração dizia ter 1.

### Decisão

- Um relato entra no Acompanhamento do mês do seu **atendimento**
  (`registro.data_atendimento`, `[periodo_inicio, periodo_fim]`), não do mês da
  confirmação. O prompt lista os relatos na ordem do atendimento.
- **Relato atrasado em mês sem Acompanhamento gerado** (nenhuma linha,
  `dados_insuficientes` ou `falha`): entra na próxima geração. O job mensal,
  além de `falha`, passa a retentar `dados_insuficientes` do mês de referência
  quando os relatos confirmados daquele mês já alcançaram o mínimo.
- **Relato atrasado em mês já `gerada`**: o Acompanhamento é um retrato e
  **não** é refeito sozinho, porque pode já ter ido para o aluno em PDF
  (ADR-0023). A Linha do Tempo compara os relatos confirmados do mês com
  `baseada_em_registro_ids` e avisa no fechamento quantos ficaram de fora,
  sugerindo regerar. Se a avaliação já tinha sido compartilhada, a revisão fica
  desatualizada e o PDF trava até o personal revisar de novo (mecanismo da
  ADR-0023).
- **Análise intermediária de IA**: considera os relatos com atendimento a
  partir do mês do último fechamento, menos os que esse fechamento já leu
  (`baseada_em_registro_ids`). Assim o relato atrasado do mês fechado também
  entra.
- Avaliações do personal (`created_at`) e avaliação física (`data`) não mudam.

### Consequências

- O problema do "relato órfão", motivo da rejeição original, fica resolvido
  pelo aviso + regerar. Nenhum relato some, e nada muda sozinho num
  Acompanhamento já entregue.
- Regerar um mês passado não reprocessa em cascata os meses seguintes. O
  contexto consolidado que eles herdaram continua o da geração anterior.
- Linha do Tempo, contador do mês, mínimo de 3 e geração passam a usar o mesmo
  critério. A marca "Confirmado em ‹mês› — conta no Acompanhamento de ‹mês›"
  sai da tela.
