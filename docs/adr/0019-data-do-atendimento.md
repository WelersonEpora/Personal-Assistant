# ADR-0019: Data do atendimento separada das datas do sistema

**Status:** Aceita e implementada (2026-08-29)

> Não revoga a ADR-0015 (o bucketing do ciclo mensal continua por
> `validacao.confirmado_em`) nem a ADR-0017 (o feed de atividade continua
> ordenado por `created_at`). Introduz um campo novo para *quando o atendimento
> aconteceu*, distinto de *quando o relato entrou no sistema*.

## Contexto

Até aqui o Registro tinha só datas do **sistema**: `iniciado_em` (o personal
apertou "iniciar"), `finalizado_em`, `created_at` (sincronização),
`validacao.confirmado_em` (revisão). Faltava a data do **mundo real**: o dia em
que o atendimento/avaliação de fato aconteceu.

Enquanto a captura é feita no mesmo dia da sessão, `iniciado_em` serve de proxy.
Quando o personal não consegue gravar o relato na hora e registra depois (uma
sexta gravada na segunda; uma semana de viagem lançada de uma vez), o proxy
fica errado, e silenciosamente:

- a IA de acompanhamento (ADR-0015) recebe `iniciado_em` como "data da sessão" e
  monta uma linha do tempo deslocada;
- o painel (ADR-0017) conta "último relato" / "aluno parado há X dias" pela data
  de captura, não pela de contato real com o aluno.

Já havia precedente no produto: `avaliacao_fisica.data` (ADR-0016) é o dia da
avaliação, separado de `created_at`; o interpretador de voz (ADR-0018) já extrai
`data_ouvida`.

## Decisão

### Coluna nova: `registro.data_atendimento`

- **`DATE`** (dia, sem hora nem fuso — mesmo critério de `avaliacao_fisica.data`).
  Elimina a classe de bugs de fuso do `toISOString().slice(0,10)` espalhado
  pelos services.
- **Obrigatória** (`NOT NULL`). Registros existentes recebem
  `(iniciado_em AT TIME ZONE 'UTC')::date` no backfill da migração — o mesmo
  critério que o app já usava ao formatar datas.
- **Default no modelo** = hoje, cobrindo inserts diretos (testes/scripts). O
  caminho de sincronização sempre manda o valor resolvido.

### Cada momento continua no seu campo

| Campo | Significado | Muda nesta ADR? |
|---|---|---|
| `registro.data_atendimento` (novo) | **dia em que o atendimento aconteceu** | — |
| `registro.iniciado_em` | início da captura (dispositivo) | não — **deixa de ser lido como data do evento** |
| `registro.finalizado_em` | fim da captura | não |
| `registro.created_at` | recepção na sincronização | não |
| `validacao.confirmado_em` | confirmação na revisão | não — **continua o critério de bucketing mensal (ADR-0015)** |

`iniciado_em`, `created_at` e `confirmado_em` **nunca** ficam editáveis.

### Captura (celular): default hoje, ajuste contextual no atendimento

- A data **não é uma etapa antes de iniciar**. `data_atendimento` nasce como
  **hoje** ao iniciar o Registro (o caso dominante — captura no dia da sessão —
  não exige nenhuma interação).
- **Só o Registro `tipo = atendimento`** mostra um painel contextual no composer
  (`SeletorDataAtendimento.vue`, mesma ideia do roteiro de ditado da avaliação
  física — ADR-0018): uma barra recolhida `🗓️ Atendimento de: Hoje` que expande
  nos chips de dia relativo (`Hoje`, `Ontem`, `qua 26`, …, 7 dias), com selo
  **retroativo** quando ≠ hoje. Sem calendário — os chips comunicam o limite.
- **Avaliação física não tem seletor de data na captura.** A data real de uma
  avaliação quase sempre é o dia da coleta; quando não é, ela é dita no áudio
  (`data_ouvida`, ADR-0018) ou ajustada no formulário de revisão — e a fonte
  oficial é `avaliacao_fisica.data` (ADR-0016), definida na confirmação. Para
  esses Registros `data_atendimento` fica sendo o dia da captura.
- **Janela: `[iniciado_em::date − 7, iniciado_em::date]`**, ancorada no início da
  captura (não no relógio do servidor) — um Registro iniciado offline e
  sincronizado dias depois continua válido. O servidor valida e **rejeita** com
  erro claro fora da janela (a fila de sync já sabe surfaçar erro); não faz
  *clamp* silencioso.
- O ajuste vale enquanto o Registro está `em_andamento`. Depois de finalizado,
  congela e sincroniza uma vez.
- Ausente no `metadata` (cliente anterior a esta ADR) → deriva de
  `iniciado_em::date`. Mesma compatibilidade do `tipo` na ADR-0018.

### Desktop: o ajuste faz parte do "Editar" da revisão

Datas mais antigas que 7 dias (ou qualquer correção do dia) são feitas na tela
de revisão do relato, numa **janela mais folgada: `[iniciado_em::date − 60,
hoje]`** — nunca futura, nunca mais de 60 dias antes do início da captura
(60 = mesmo horizonte de `JANELA_SEM_MENSAL_DIAS` da análise sob demanda; um
relato mais antigo que isso a IA de acompanhamento nem consideraria, e um erro
de digitação no ano é barrado). Mesma âncora (`iniciado_em`) da janela de 7 dias
da captura; a captura força "no dia ou até 7 dias antes" (personal no celular),
a revisão relaxa para 60 (personal no desktop, pondo o backlog em dia).

- A tela de revisão apresenta o que a IA entendeu e o que o personal digitou. Se
  ele quer ajustar, aperta **"Editar"**; no formulário de edição a **data do
  atendimento aparece como o "item 0" do relato** (primeiro card, acima dos
  itens extraídos), num campo `CampoData.vue` — calendário próprio (o popup
  nativo de `<input type="date">` não é estilizável; docs/adr/0003), com
  `min`/`max` = a janela de 60 dias e o clique abrindo o calendário em qualquer
  ponto do campo.
- Ao **"Salvar e confirmar"**, a data vai no payload de
  `POST /registros/:id/confirmar` e é gravada em `registro.data_atendimento`
  **na mesma transação** que cria a `validacao` e avança o status. Não é dado
  oficial (é campo do `registro`), então a ADR-0007 continua literal — o
  `/confirmar` é o único que **escreve `validacao`**.
- "Confirmar" sem editar mantém a data como foi capturada.
- Validação (`validarDataAtendimentoPassada`, `shared/utils/data-atendimento.js`):
  formato `AAAA-MM-DD`, `≤ hoje`, `≥ iniciado_em::date − 60`. Rejeição aborta a
  transação — nenhuma `validacao` é criada.
- Altera **apenas** `data_atendimento` (e o `updated_at` do Registro — **sem
  tabela/coluna de auditoria dedicada**). `iniciado_em`, `created_at` e
  `confirmado_em` nunca mudam.
- O cabeçalho da revisão mostra os dois, só leitura: **"Atendimento em ‹data›"**
  e "registrado ‹data› às ‹hora›".
- **Avaliação física**: a data se ajusta no próprio formulário da revisão
  (`AvaliacaoFisicaForm` já tem o campo `data`, pré-preenchido com
  `data_ouvida || data_atendimento`); a fonte oficial é `avaliacao_fisica.data`
  (ADR-0016).
- **Fora de escopo por ora**: corrigir a data de um relato **já confirmado**
  (nenhuma tela lista relatos confirmados para edição). Se necessário, entra
  como um endpoint/afordância própria depois.

### Quem passa a usar `data_atendimento`

| Consumidor | Antes | Agora |
|---|---|---|
| Prompt do ciclo mensal — linha `sessão em` | `iniciado_em` | **`data_atendimento`** (fallback `iniciado_em` p/ relatos antigos) |
| Prompt da análise sob demanda — `sessão em` | `iniciado_em` | **`data_atendimento`** |
| Interpretação do relato (ADR-0006) | não recebia data | cabeçalho `Data do atendimento: ‹data›` (não-normativo; ajuda a IA a resolver "ontem"). **Não** para avaliação física. |
| Painel "último relato" / "aluno parado" | `MAX(iniciado_em)` | **`MAX(data_atendimento)`** |
| Pré-preenchimento da avaliação física por captura | `data_ouvida` \|\| hoje | `data_ouvida` \|\| **`data_atendimento`** |
| Listas de relato / histórico / fila de revisão | `iniciado_em`/`created_at` | exibem `data_atendimento` como data principal |

### Bucketing mensal — inalterado

Continua por `validacao.confirmado_em` (ADR-0015). Mudar `data_atendimento`
**não** re-bucketiza nem reabre mês. Ciclos são snapshots: um mês já gerado só
passa a refletir a data nova numa **regeneração** manual — coerente com "editar
não reescreve ciclo já gerado" (ADR-0015). O feed de atividade (ADR-0017)
continua ordenado por `created_at`; `data_atendimento` viaja junto só para a
linha poder exibir "atendimento de ‹data›".

## Alternativas consideradas

- **Deixar o personal corrigir `iniciado_em`.** Rejeitada — reintroduz a fusão
  que esta ADR desfaz; `iniciado_em` é fato imutável do dispositivo.
- **`data_atendimento` como `TIMESTAMP`.** Rejeitada — o evento acontece num
  dia, não num instante; `DATE` evita todo o problema de fuso.
- **Nullable + `COALESCE(data_atendimento, iniciado_em::date)` nos consumidores.**
  Rejeitada — espalha o fallback por 4+ pontos de leitura. `NOT NULL` + backfill
  deixa cada consumidor lendo um campo só.
- **Tabela/coluna de histórico de alteração da data.** Rejeitada a pedido — o
  `updated_at` do Registro basta; a data é a declaração honesta do personal
  (mesmo nível de `avaliacao_personal` / `avaliacao_fisica.data`), não um campo
  clínico auditado.
- **Re-bucketizar o ciclo mensal por `data_atendimento`.** Rejeitada — a
  ADR-0015 já rejeitou bucketizar por data de sessão (relato confirmado depois
  do fechamento ficaria órfão). `confirmado_em` garante cobertura exata.
- **Janela de 7 dias ancorada no relógio do servidor.** Rejeitada — rejeitaria
  captura offline legítima sincronizada dias depois. Âncora é `iniciado_em`.
- **Calendário completo no celular.** Rejeitada para a captura — chips de dia
  relativo comunicam o limite e são mais rápidos. Calendário fica no desktop,
  onde não há limite pra trás.
- **Seletor de data na tela "iniciar Registro", para os dois tipos.** Foi a 1ª
  versão; ajustada porque a data só importa para o atendimento (a avaliação
  física tem `data_ouvida` + `avaliacao_fisica.data`) e uma etapa a mais antes
  de iniciar penaliza o caso dominante (hoje). Virou painel contextual no
  composer do atendimento, opcional, como o roteiro de ditado.
- **Editar a data por um "alterar" no cabeçalho da revisão + endpoint
  `PATCH /registros/:id/data-atendimento`.** Foi a 1ª versão do lado desktop;
  ajustada — um link editável no cabeçalho competia com a informação e o
  endpoint avulso ficava sem uso claro. A revisão já tem o fluxo certo:
  apresenta o que a IA entendeu, o personal aperta **"Editar"** e ajusta tudo
  junto. A data entra como **"item 0"** do formulário e vai no mesmo
  `/confirmar`. Corrigir a data de um relato já confirmado fica para quando
  houver necessidade real (nenhuma tela lista confirmados para edição hoje).

## Consequências

- **Schema**: `registro.data_atendimento` (`DATE NOT NULL`, migração
  `20260829110000`, backfill de `iniciado_em::date`) + índice
  `(aluno_id, data_atendimento)`.
- **Backend**: `resolverDataAtendimento` em `registro-sync.service` (janela de 7
  dias, ancorada em `iniciado_em`); `obterOuCriarRegistro` grava a data;
  `registro-confirmacao.service` aceita `dataAtendimento` opcional no payload e
  grava na transação da `validacao` (`validarDataAtendimentoPassada` em
  `shared/utils/data-atendimento.js`); prompts de mensal / sob demanda /
  interpretação passam a usar a data; `painel.repository` usa
  `MAX(data_atendimento)`.
- **Frontend**: `SeletorDataAtendimento.vue` (painel contextual no composer, só
  `tipo = atendimento`); "Atendimento em" vs "registrado em" no cabeçalho da
  revisão; data como "item 0" do formulário de "Editar"; listas e cards de
  relato exibem `data_atendimento`.
- **ADR-0015 e ADR-0017 intactas**: bucketing por `confirmado_em`, feed por
  `created_at`.
