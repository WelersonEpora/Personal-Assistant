# ADR-0018: Avaliação Física por captura (áudio/texto) + interpretação da IA

**Status:** Aceita e implementada (2026-08-28)

> Esta ADR não revoga a ADR-0007 (IA nunca grava dado oficial) nem a fronteira
> da ADR-0016 (avaliação física é CRUD direto, fora do pipeline de IA e de
> `validacao`) — desenha um caminho que preserva as duas. A qualidade da
> extração numérica com Gemini real ainda não foi medida (falta
> `GEMINI_API_KEY` de verdade — mesma pendência do resto do pipeline de IA).

## Contexto

Hoje a avaliação física é digitada à mão no formulário de
`AvaliacoesFisicasSecao.vue` (ADR-0016): ~30 campos numéricos (peso, altura,
perímetros, dobras) mais anamnese e checklist postural. Durante a avaliação o
personal está com as mãos no paquímetro/fita e o aluno na frente — digitar 30
números só depois, de memória ou de um papel, é exatamente o trabalho
operacional que o produto existe para eliminar (CLAUDE.md, "Fluxo central").

A infraestrutura de captura já resolve a parte difícil: gravação offline
(`MediaRecorder`), IndexedDB, fila de sincronização própria, idempotência por
`registro.id` gerado no cliente, transcrição na nuvem (Gemini). O que falta é um
**interpretador** que transforme "dobra tricipital doze e meio, subescapular
quinze, peso setenta e oito e quatro" nas linhas de `avaliacao_fisica_medida` do
catálogo v3 — e um lugar para o personal **revisar e confirmar** antes de virar
dado.

Três regras batem de frente com a ideia ingênua de "só jogar no pipeline atual":

1. **ADR-0007** — `resultado_ia` e `validacao` são duas tabelas, dois papéis,
   nunca confundidos. `validacao` só nasce de `POST /registros/:id/confirmar` e
   é reservada para confirmação de saída de IA de **relato de atendimento**.
2. **ADR-0016** — avaliação física é *dado objetivo do personal*, CRUD direto
   como `avaliacao_personal`; "reusar `resultado_ia`/`validacao`" foi
   explicitamente rejeitado; "avaliação física no fluxo de captura/IA" está
   listado em **Fora de escopo**. Esta ADR é a "decisão nova" que aquele item
   exigia.
3. **CLAUDE.md** — "Nenhum job/worker escreve em `avaliacao_fisica*`". As
   derivadas (`imc`, `rcq`, `massa_gorda`, `massa_magra`) são do service, nunca
   de humano nem de IA.

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
       com a confiança por campo à vista, medidas ambíguas/faltando destacadas
  → personal edita e confirma
  → endpoint próprio chama o CRUD EXISTENTE: avaliacaoFisicaService.criar(...)
       (mesma validação da v3, mesmo recálculo de imc/rcq/massa_* no service)
  → grava vínculo registro → avaliacao_fisica e avança registro.status = confirmado (mesma transação)
```

O ponto central: **`avaliacao_fisica*` continua sendo escrita só pelo
`avaliacao-fisica.service.js`, a partir de um payload que um humano revisou.** A
IA nunca toca essas tabelas. O que a IA escreve (`proposta_avaliacao_fisica`) é
descartável, regenerável e nunca lido como histórico do aluno — mesma natureza
de `resultado_ia`, em tabela própria para não confundir os papéis (ADR-0007).

### O tipo é escolhido ao iniciar o Registro — nunca inferido, nunca marcado depois

- Na tela de **iniciar Registro** (modo `/captura`), depois de escolher o aluno,
  o personal escolhe: **Atendimento** (comportamento atual) ou **Avaliação
  física**. `registro.tipo` nasce aí, no cliente, junto com o `registro.id`.
- **Um tipo por Registro.** O pipeline tem um interpretador só; Registro misto
  (parte relato, parte medidas) não é permitido — são dois Registros.
- A IA **não** adivinha o tipo pelo conteúdo: errar mandaria 30 números para o
  interpretador de relato livre.
- **Regra de simultaneidade** (ajuste à ADR-0012): passa a ser *um Registro
  `em_andamento` por aluno **por tipo***. O personal pode ter, para o mesmo
  aluno, um `atendimento` e uma `avaliacao_fisica` em andamento ao mesmo tempo
  (avaliação e atendimento na mesma sessão).
- O relato de "Atendimento" segue **intocado** — sem campo novo, sem ramo novo
  no caminho comum.

### Tabelas e colunas

| Objeto | Papel | Quem escreve |
|---|---|---|
| `registro.tipo` (novo) | `atendimento` (default) \| `avaliacao_fisica` | cliente, no sync |
| `proposta_avaliacao_fisica` (nova) | staging da interpretação: `registro_id` (1:1), `payload_json`, `modelo`, `status` (`concluido`/`falha`), `erro`, `avisos_json` | **só** o worker de IA |
| `avaliacao_fisica.registro_id` (novo, nulo) | rastreio: qual Registro originou (nulo para manual/legado) | `avaliacao-fisica.service` na confirmação |
| `avaliacao_fisica.origem` | ganha o valor `captura_ia` (além de `manual` / `legado_bodymove`) | `avaliacao-fisica.service` |

`registro.status` **reusa** a máquina de estados atual (`recebido →
transcrevendo → interpretando → aguardando_revisao → confirmado` + `erro_*`). O
que muda é o passo "interpretando" (interpretador diferente) e o "confirmar"
(cria `avaliacao_fisica` via CRUD, não `validacao`).

### Confirmação em endpoint próprio — `/confirmar` continua só de `validacao`

- Novo endpoint `POST /api/v1/registros/:id/confirmar-avaliacao-fisica` (só para
  `tipo = avaliacao_fisica`), com service próprio. **`POST /registros/:id/
  confirmar` não muda** — segue sendo o único caminho que escreve `validacao`,
  mantendo a garantia estrutural da ADR-0007 literalmente verdadeira.
- O service novo, numa transação única: valida/normaliza o payload revisado via
  o `avaliacao-fisica.service` existente (v3 + recálculo de derivadas), grava a
  `avaliacao_fisica` com `origem = captura_ia` e `registro_id`, e avança
  `registro.status` para `confirmado`.
- **Invariante (agora ciente do tipo)**, coberta por teste:
  `tipo=atendimento` + `confirmado` ⟺ existe `validacao`;
  `tipo=avaliacao_fisica` + `confirmado` ⟺ existe `avaliacao_fisica` vinculada.
  Nenhum caminho fora de `avaliacao-fisica.service` escreve `avaliacao_fisica*`;
  nenhum caminho fora de `/confirmar` escreve `validacao`.

### Descartar a proposta

Na tela de revisão, além de "Confirmar":

- **Refazer interpretação** — reenfileira o Registro (`interpretando`), mesma
  mecânica de `erro_interpretacao` retomável. Útil quando o áudio estava ok mas
  a extração saiu ruim.
- **Descartar** — soft-delete do Registro inteiro (`deletado_em`), como já é
  permitido para Registros não confirmados (`registro.js`); a
  `proposta_avaliacao_fisica` e o áudio bruto vão junto. Não deixa resíduo.

### Interpretador dedicado (`services/ia/`)

Novo par prompt + `responseSchema` em `gemini.service.js`
(`interpretarAvaliacaoFisica`), **separado** do `interpretarRegistro`:

- Recebe no prompt o **catálogo de métricas** (`catalogo-metricas.js`: `codigo`,
  `rotulo`, `categoria`, `unidade`, `casas_decimais`) e `METODOS_VALIDOS`.
- Devolve um array de medidas propostas: `{ metrica_codigo, metodo?, valor,
  unidade_ouvida, principal?, confianca, trecho_origem }` + `data_ouvida?` +
  `observacoes?` + `nao_mapeado[]` (o que foi dito e não encaixou em métrica
  nenhuma — nunca inventar código).
- Regras no prompt (mesma linha dos outros): usar só o que foi dito, não
  inventar número, marcar `confianca` por medida, deixar explícito o que ficou
  ambíguo (qual dobra? mm ou cm? valor único ou média de 3?).
- **Não** calcula protocolo de % de gordura (Pollock etc.) — segue fora de
  escopo (ADR-0016). "% de gordura dezoito por cento" entra como medida
  `percentual_gordura` já pronta; ditar só as 7 dobras **não** faz o sistema
  calcular o % de gordura.

### Roteiro de ditado (frontend)

O modo captura de tipo `avaliacao_fisica` mostra um **roteiro opcional** — a
ordem sugerida das medidas (antropometria → perímetros → dobras), agrupada como
o catálogo. Não bloqueia nada (o personal fala como quiser), mas ditar na ordem
esperada melhora o acerto do mapeamento. É só UI, não altera o schema.

### Revisão = o formulário de avaliação física, pré-preenchido

Não é uma tela nova de "Revisão" no sentido da ADR-0007. É o
`AvaliacoesFisicasSecao.vue` em modo "novo", com os campos preenchidos pela
proposta e:

- selo de `confianca` por campo (alta/média/baixa); campos de baixa confiança e
  `nao_mapeado` destacados no topo;
- `imc` / `% gordura principal` / `massa magra`/`gorda` recalculados **ao vivo**
  no cliente conforme o personal corrige (o service refaz na gravação; aqui é só
  conferência imediata — nunca editável à mão);
- ações "Refazer interpretação" / "Descartar" (acima) e "Confirmar".

### Diferenciação visual

`registro.tipo = avaliacao_fisica` ganha ícone/cor próprios (accent teal, ≠ do
indigo de atendimento) na lista de "Registros recentes" do `/captura` e na fila
de revisão do `/admin`, para não confundir uma pendência de relato com uma de
avaliação.

## Alternativas consideradas

- **Rotear pelo `resultado_ia`/`validacao` existente** — rejeitado por ADR-0007
  e ADR-0016. `validacao` tem semântica de "relato de atendimento confirmado"; o
  histórico do aluno lê dela. Misturar avaliação física ali quebra as telas de
  histórico e a garantia estrutural.
- **`proposta_avaliacao_fisica` com um campo `confirmada: boolean`** em vez de
  criar a `avaliacao_fisica` de verdade — mesma razão pela qual a ADR-0007 usa
  duas tabelas: tornaria trivial (por bug, não má intenção) "confirmar" sem
  passar pela validação da v3 e pelo recálculo do service.
- **Reusar `POST /registros/:id/confirmar` com um branch por tipo** — diluiria a
  garantia mais forte da ADR-0007 ("só este endpoint escreve `validacao`").
  Endpoint separado custa pouco e mantém a invariante literal.
- **Inferir o tipo pelo conteúdo do áudio** — frágil; classificar errado manda
  medidas para o interpretador de relato livre. O tipo é barato de pedir na hora
  de iniciar.
- **Permitir Registro misto (relato + medidas)** — o pipeline tem um
  interpretador por Registro; misto viraria dois caminhos no mesmo objeto. São
  dois Registros (a regra de simultaneidade por tipo cobre o caso da mesma
  sessão).
- **Sem IA: anexar o áudio como nota à avaliação e o personal digita** — mais
  simples, joga fora o valor inteiro (a estruturação). O áudio viraria um anexo
  que ninguém reescuta.
- **Interpretar no cliente** — contraria "transcrição só na nuvem" (CLAUDE.md); o
  mapeamento fala→catálogo e o schema fechado são regra de negócio, lugar de
  service.
- **Novo app/fluxo de captura separado** — desnecessário; a infra de captura é
  reaproveitável inteira. O único fork é no passo de interpretação.
- **Ditar anamnese e postural por áudio já nesta rodada** — adiado. Começar só
  pelas **medidas numéricas**, onde o ganho é maior e o schema é o mais fechado.
- **Confiar na extração numérica sem revisão obrigatória campo a campo** —
  rejeitado. Número de avaliação física tem tolerância a erro ~zero (corrompe
  IMC/%gordura/massa e os gráficos de evolução, silenciosamente). Toda medida
  passa pelo olho do personal antes de gravar.

## Consequências

- **Schema**: `registro.tipo` (migration, default `atendimento` — nenhum
  Registro atual muda de comportamento); tabela `proposta_avaliacao_fisica`;
  `avaliacao_fisica.registro_id` nulo; `origem` ganha `captura_ia`.
- **Backend**: `interpretarAvaliacaoFisica` em `gemini.service.js`; fork em
  `processador-fila-ia.js` por `registro.tipo`; endpoint + service de leitura da
  proposta; `POST /registros/:id/confirmar-avaliacao-fisica` que chama
  `avaliacaoFisicaService.criar` e grava vínculo + `status = confirmado` numa
  transação. `avaliacao-fisica.service` ganha ciência do `registro_id` e da nova
  `origem`; validação e recálculo não mudam.
- **Frontend**: seletor de tipo ao iniciar Registro; roteiro de ditado;
  `AvaliacoesFisicasSecao` aceita um "rascunho inicial" + selos de confiança;
  entrada da fila de revisão do `/admin` para Registros `tipo = avaliacao_fisica`
  em `aguardando_revisao`; ícone/cor de tipo na lista e na fila.
- **Regra de simultaneidade** da ADR-0012 passa a ser por `(aluno, tipo)`.
- **Validação de qualidade**: depende de `GEMINI_API_KEY` real. **Antes de
  qualquer tela**: experimento barato — um áudio real ditando ~15 medidas →
  transcrição + `interpretarAvaliacaoFisica` contra o catálogo → medir acerto
  por campo (valor certo, métrica certa, unidade certa). Taxa de erro alta mesmo
  com roteiro → a ADR é reavaliada.
- **ADR-0007 e ADR-0016 intactas**: a IA nunca escreve dado oficial nem
  `avaliacao_fisica*`; `validacao` não é tocada; o CRUD segue sendo a única
  porta de escrita da avaliação física.
- **Testes**: garantia estrutural (worker só escreve `proposta_avaliacao_fisica`;
  `avaliacao_fisica*` só pelo service; `validacao` só por `/confirmar`);
  invariante de `confirmado` ciente do tipo; idempotência por `registro.id` no
  sync (reenvio não duplica proposta nem avaliação); "Descartar" não deixa
  resíduo.

## Fora de escopo (sem decisão nova)

- Cálculo de protocolos (Pollock, Durnin-Womersley, VO₂) para avaliações novas —
  segue como na ADR-0016. O % de gordura entra como valor já medido/calculado
  pelo personal.
- Anamnese e avaliação postural por áudio (fase 2 possível).
- Confirmação automática sem revisão campo a campo.
- Qualquer uso da avaliação física pela IA de acompanhamento (ADR-0015) — o
  bloco `fato` para o prompt continua fora de escopo (ADR-0016).
