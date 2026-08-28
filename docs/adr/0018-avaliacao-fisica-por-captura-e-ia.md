# ADR-0018: Avaliação Física por captura (áudio/texto) + interpretação da IA

**Status:** Proposta (rascunho para discussão — 2026-08-28)

> Este é um rascunho. Nada implementado. O objetivo é decidir **se** e **como**
> a avaliação física pode entrar pelo fluxo de captura de Registros sem quebrar
> a ADR-0007 (IA nunca grava dado oficial) nem a fronteira da ADR-0016
> (avaliação física é CRUD direto, fora do pipeline de IA e de `validacao`).

## Contexto

Hoje a avaliação física é digitada à mão no formulário de
`AvaliacoesFisicasSecao.vue` (ADR-0016): ~30 campos numéricos (peso, altura,
perímetros, dobras) mais anamnese e checklist postural. Durante a avaliação o
personal está com as mãos no paquímetro/fita e o aluno na frente — digitar 30
números só depois, de memória ou de um papel, é exatamente o trabalho
operacional que o produto existe para eliminar (CLAUDE.md, "Fluxo central").

A infraestrutura de captura já resolve a parte difícil disso: gravação offline
(`MediaRecorder`), IndexedDB, fila de sincronização própria, idempotência por
`registro.id` gerado no cliente, transcrição na nuvem (Gemini). O que falta é
um **interpretador** que transforme "dobra tricipital doze e meio, subescapular
quinze, peso setenta e oito e quatro" nas linhas de `avaliacao_fisica_medida`
do catálogo v3 — e um lugar para o personal **revisar e confirmar** antes de
virar dado.

Três regras batem de frente com a ideia ingênua de "só jogar no pipeline atual":

1. **ADR-0007** — `resultado_ia` e `validacao` são duas tabelas, dois papéis,
   nunca confundidos. `validacao` só nasce de `POST /registros/:id/confirmar` e
   é reservada para confirmação de saída de IA de **relato de atendimento**.
2. **ADR-0016** — avaliação física é *dado objetivo do personal*, CRUD direto
   como `avaliacao_personal`; "reusar `resultado_ia`/`validacao`" foi
   explicitamente rejeitado ("semântica errada"); "avaliação física no fluxo de
   captura/IA" está listado em **Fora de escopo**.
3. **CLAUDE.md** — "Nenhum job/worker escreve em `avaliacao_fisica*`". As
   derivadas (`imc`, `rcq`, `massa_gorda`, `massa_magra`) são do service, nunca
   de humano nem de IA.

Esta ADR não revoga nenhuma delas — desenha um caminho que as preserva.

## Decisão

### Princípio: a IA propõe um rascunho; só o CRUD existente (acionado por humano) grava

```text
Registro tipo "avaliacao_fisica"
  → captura idêntica à de hoje (offline, gravador, fila, idempotência por registro.id)
  → sync idêntico (multipart, um Registro por request)
  → pipeline FORK depois da transcrição:
       em vez de interpretarRegistro() → interpretarAvaliacaoFisica()
  → grava PROPOSTA em `proposta_avaliacao_fisica` (staging, escrita só pela IA, NUNCA oficial)
  → registro.status = aguardando_revisao
  → tela de revisão = o formulário de AvaliacoesFisicasSecao pré-preenchido pela proposta,
       com a confiança por campo à vista, medidas não mapeadas destacadas
  → personal edita e confirma
  → chama o CRUD EXISTENTE: avaliacaoFisicaService.criar(equipe, aluno, autor, dados)
       (mesma validação da v3, mesmo recálculo de imc/rcq/massa_* no service)
  → grava vínculo registro → avaliacao_fisica e avança registro.status = confirmado
```

O ponto central: **`avaliacao_fisica*` continua sendo escrita só pelo
`avaliacao-fisica.service.js`, a partir de um payload que um humano revisou e
enviou.** A IA nunca toca essas tabelas. O que a IA escreve
(`proposta_avaliacao_fisica`) é descartável, regenerável e nunca lido como
histórico do aluno — mesma natureza de `resultado_ia`, mas em tabela própria
para não confundir os papéis (ADR-0007).

### Tabelas e colunas

| Objeto | Papel | Quem escreve |
|---|---|---|
| `registro.tipo` (novo) | `atendimento` (default, comportamento atual) \| `avaliacao_fisica` | cliente, no sync |
| `proposta_avaliacao_fisica` (nova) | staging da interpretação: `registro_id` (1:1), `payload_json`, `modelo`, `status` (`concluido`/`falha`), `erro`, `avisos_json` | **só** o worker de IA |
| `avaliacao_fisica.registro_id` (novo, nulo) | rastreio: qual Registro originou esta avaliação (nulo para manual/legado) | `avaliacao-fisica.service` na confirmação |
| `avaliacao_fisica.origem` | ganha o valor `captura_ia` (além de `manual` / `legado_bodymove`) | `avaliacao-fisica.service` |

`registro.status` **reusa** a máquina de estados atual (`recebido →
transcrevendo → interpretando → aguardando_revisao → confirmado` + os dois
`erro_*`). O que muda é o passo "interpretando" (interpretador diferente) e o
"confirmar" (cria `avaliacao_fisica` via CRUD, não `validacao`).

### Interpretador dedicado (`services/ia/`)

Novo par prompt + `responseSchema` em `gemini.service.js`
(`interpretarAvaliacaoFisica`), **separado** do `interpretarRegistro`:

- Recebe no prompt o **catálogo de métricas** (`catalogo-metricas.js`: `codigo`,
  `rotulo`, `categoria`, `unidade`, `casas_decimais`) e a lista de
  `METODOS_VALIDOS`.
- Devolve um array de medidas propostas: `{ metrica_codigo, metodo?, valor,
  unidade_ouvida, principal?, confianca, trecho_origem }` + `data_ouvida?` +
  `observacoes?` + `nao_mapeado[]` (o que foi dito e não encaixou em métrica
  nenhuma — nunca inventar código).
- Regras no prompt (mesma linha dos outros): usar só o que foi dito, não
  inventar número, marcar `confianca` por medida, deixar explícito o que ficou
  ambíguo (qual dobra? mm ou cm? valor único ou média de 3?).
- **Não** calcula protocolo de % de gordura (Pollock etc.) — segue fora de
  escopo (ADR-0016). Se o personal ditar "percentual de gordura dezoito por
  cento", entra como medida `percentual_gordura` já pronta; se ditar só as 7
  dobras, o % de gordura **não** é calculado por nós.

### Roteiro de ditado (frontend)

O modo captura de tipo `avaliacao_fisica` mostra um **roteiro opcional** — a
ordem sugerida das medidas (antropometria → perímetros → dobras), agrupada como
o catálogo. Não bloqueia nada (o personal fala do jeito que quiser), mas ditar
na ordem esperada melhora muito o acerto do mapeamento. O roteiro é só UI, não
altera o schema.

### Revisão = o formulário de avaliação física, pré-preenchido

Não é uma tela nova de "Revisão" no sentido da ADR-0007. É o
`AvaliacoesFisicasSecao.vue` em modo "novo", com os campos já preenchidos pela
proposta e:

- selo de `confianca` por campo (alta/média/baixa), campos de baixa confiança e
  `nao_mapeado` destacados no topo;
- `imc` / `% gordura principal` / `massa magra`/`gorda` recalculados **ao vivo**
  conforme o personal corrige (o service já faz isso na gravação; aqui é o
  mesmo cálculo no cliente para conferência imediata);
- botão "Descartar proposta" (apaga `proposta_avaliacao_fisica`, Registro vira
  `erro_interpretacao`/cancelado — a definir) e "Confirmar" (cria a avaliação).

### Garantia estrutural (teste dedicado)

Como na ADR-0007 e na ADR-0015: um teste garante que **não existe caminho de
código, fora de `avaliacao-fisica.service`, que escreva em `avaliacao_fisica`,
`avaliacao_fisica_medida` ou `avaliacao_fisica` derivadas** — em particular o
worker de IA só escreve `proposta_avaliacao_fisica`. E idempotência por
`registro.id` no sync (reenvio não cria proposta nem avaliação duplicada).

## Alternativas consideradas

- **Rotear pelo `resultado_ia`/`validacao` existente** — rejeitado por ADR-0007
  e ADR-0016. `validacao` tem semântica de "relato de atendimento confirmado"; o
  histórico do aluno lê dela. Misturar avaliação física ali quebra as duas
  telas de histórico e a garantia estrutural.
- **`proposta_avaliacao_fisica` com um campo `confirmada: boolean`** em vez de
  criar a `avaliacao_fisica` de verdade — mesma razão pela qual a ADR-0007 usa
  duas tabelas: tornaria trivial (por bug, não má intenção) "confirmar" sem
  passar pela validação da v3 e pelo recálculo do service.
- **Sem IA: anexar o áudio como nota à avaliação e o personal digita** — mais
  simples, mas joga fora o valor inteiro (a estruturação). O áudio viraria só
  um anexo que ninguém reescuta.
- **Interpretar no cliente** — contraria "transcrição só na nuvem" (CLAUDE.md);
  além disso o mapeamento fala→catálogo e o schema fechado são regra de negócio,
  lugar de service.
- **Novo app/fluxo de captura separado para avaliação** — desnecessário; a infra
  de captura (offline, gravador, fila, idempotência) é reaproveitável inteira. O
  único fork é no passo de interpretação.
- **Ditar anamnese e postural por áudio também, já nesta rodada** — adiado.
  Começar só pelas **medidas numéricas**, onde o ganho é maior e o schema é o
  mais fechado. Anamnese/postural (§5 da v3, texto semiestruturado) podem entrar
  numa fase 2 se a numérica se provar.
- **Confiar na extração numérica sem revisão obrigatória campo a campo** —
  rejeitado. Número de avaliação física tem tolerância a erro ~zero (corrompe
  IMC/%gordura/massa e todos os gráficos de evolução, silenciosamente). Toda
  medida passa pelo olho do personal antes de gravar.

## Consequências

- **Schema**: `registro.tipo` (migration, default `atendimento` — nenhum
  Registro atual muda de comportamento); tabela `proposta_avaliacao_fisica`;
  `avaliacao_fisica.registro_id` nulo; `origem` ganha `captura_ia`.
- **Backend**: `interpretarAvaliacaoFisica` em `gemini.service.js`; fork em
  `processador-fila-ia.js` por `registro.tipo`; endpoint para ler a proposta;
  o "confirmar" chama `avaliacaoFisicaService.criar` e grava o vínculo +
  `status = confirmado` numa transação. `avaliacao-fisica.service` ganha, no
  máximo, a ciência do `registro_id` e da nova `origem` — a validação e o
  recálculo não mudam.
- **Frontend**: seletor de tipo ao iniciar Registro no modo captura; roteiro de
  ditado; `AvaliacoesFisicasSecao` aceita um "rascunho inicial" + selos de
  confiança; entrada na lista de revisão do `/admin` para Registros
  `tipo = avaliacao_fisica` em `aguardando_revisao`.
- **Validação de qualidade**: depende de `GEMINI_API_KEY` real (pendência já
  conhecida). **Antes de qualquer tela**: experimento barato — um áudio real
  ditando ~15 medidas → transcrição + `interpretarAvaliacaoFisica` contra o
  catálogo → medir acerto por campo (valor certo, métrica certa, unidade certa).
  Se a taxa de erro for alta mesmo com roteiro, a ADR é reavaliada.
- **ADR-0007 e ADR-0016 intactas**: a IA nunca escreve dado oficial nem
  `avaliacao_fisica*`; `validacao` não é tocada; o CRUD segue sendo a única
  porta de escrita da avaliação física.
- **Testes**: garantia estrutural (worker só escreve `proposta_avaliacao_fisica`);
  idempotência por `registro.id`; confirmar cria via CRUD com recálculo;
  descartar proposta não deixa resíduo.

## Fora de escopo (sem decisão nova)

- Cálculo de protocolos (Pollock, Durnin-Womersley, VO₂) para avaliações novas —
  segue como na ADR-0016. O % de gordura entra como valor já medido/calculado
  pelo personal, não computado por nós.
- Anamnese e avaliação postural por áudio (fase 2 possível).
- Confirmação automática sem revisão campo a campo.
- Qualquer uso da avaliação física pela IA de acompanhamento (ADR-0015) — o
  bloco `fato` para o prompt continua fora de escopo (ADR-0016).
