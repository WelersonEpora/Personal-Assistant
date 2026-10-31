# ADR-0028: Ficha de Treino por captura (áudio/texto) + interpretação da IA

**Status:** Aceita e implementada (2026-10-31). Exercitada ponta a ponta contra
o Gemini real (texto ditado com duas fichas, bi-set e um exercício fora do
catálogo): extração correta e estável com `temperature: 0` — sem ela, o default
variava entre execuções. Áudio real ainda não testado (mesma pendência do resto
do pipeline).

> Reaplica o esqueleto da ADR-0018 (avaliação física por voz) à Ficha de
> Treino, como a ADR-0013 já previa ("tabela de proposta, nunca escrita direta
> em `ficha_treino`; o personal revisa e só a ação dele grava a ficha"). Não
> revoga a ADR-0007 (`validacao` continua intocada) nem a regra "IA sugerindo
> ou montando treinos" fora de escopo: aqui a IA **transcreve e estrutura a
> prescrição que o personal ditou** — não escolhe exercício, série ou carga.

## Contexto

Montar uma ficha hoje é clicar exercício por exercício no editor
(`FichaTreinoSecao.vue`), preencher séries, repetições, carga e descanso, e
conjugar grupos (ADR-0026). Para uma divisão A/B/C são dezenas de campos — o
mesmo trabalho operacional que o produto existe para eliminar. O personal
prescreve falando: "Treino A, supino reto quatro de dez, crucifixo três de
doze, bi-set de tríceps corda com tríceps testa, três voltas, descanso de um
minuto…".

A infraestrutura de captura (offline, gravador, fila, idempotência por
`registro.id`, transcrição na nuvem) e o padrão proposta → revisão →
confirmação já existem (ADR-0018). O que falta: um interpretador que case o que
foi dito com o catálogo — resolvido em boa parte pelos apelidos da ADR-0027 — e
um lugar para revisar antes de gravar.

## Decisão

### Fluxo

```text
Registro tipo "ficha_treino"   (escolhido ao iniciar, como os outros dois tipos)
  → captura, sync e transcrição: idênticos
  → pipeline bifurca: interpretarFichaTreino() com o catálogo da equipe + apelidos no prompt
  → grava PROPOSTA em `proposta_ficha_treino` (staging, escrita só pelo worker, nunca oficial)
  → registro.status = aguardando_revisao
  → revisão: editor da ficha pré-preenchido, uma ficha por bloco ditado
  → POST /api/v1/registros/:id/confirmar-ficha-treino
       → fichaTreino.service.criarNovaVersao() para cada ficha (mesmas validações da ADR-0026)
       → ficha_treino.registro_id + registro.status = confirmado, numa transação
```

### Tipo e captura

- `registro.tipo` ganha `ficha_treino` (constraint `ck_registro_tipo`). Escolhido
  ao iniciar, nunca inferido. Vale a regra de simultaneidade da ADR-0018: um
  Registro `em_andamento` por aluno **por tipo**.
- Captura igual à de avaliação física: sem seletor de data do atendimento,
  roteiro de ditado opcional ("diga o nome da ficha; depois cada exercício com
  séries × repetições, carga e descanso; para conjugar, diga 'bi-set de … com
  …'"), cor/ícone próprios no composer e nos chips.

### Um ditado, várias fichas

A proposta é uma **lista de fichas** (decisão do personal: é assim que se dita
uma divisão). A IA separa pelos nomes ditados ("Treino A", "Inferiores"); sem
nome, uma ficha só, sem nome. A revisão mostra uma ficha por bloco; a
confirmação cria todas na mesma transação — ou nenhuma.

### Interpretador (`services/ia/gemini.service.js::interpretarFichaTreino`)

- Recebe o contexto consolidado e o **catálogo visível da equipe**: ativos, com
  nome, grupo, equipamento e apelidos (globais + da equipe, ADR-0027). Cada
  exercício vai no prompt com uma referência curta (`E1`, `E2`, …) — a IA nunca
  vê nem devolve UUID; o código traduz `E12 → exercicio_id` e descarta
  referência que não existe.
- Saída (`responseSchema`): `fichas[]` → `{ nome, observacoes, grupos[] }`;
  grupo → `{ tipo: simples|biset|triset|circuito, series, descanso, observacoes,
  itens[] }`; item → `{ exercicio_ref | null, nome_ouvido, repeticoes,
  carga_obs, confianca, trecho_origem }`; mais `avisos[]`.
- Regras do prompt (mesma linha dos outros): só o que foi dito; não inventar
  exercício, série, carga nem descanso; exercício que não casar com o catálogo
  vem com `exercicio_ref = null` e o `nome_ouvido` limpo (o que vira apelido na
  revisão); marcar confiança; não completar ficha "faltando" exercício.

### Tabelas e colunas

| Objeto | Papel | Quem escreve |
|---|---|---|
| `registro.tipo` | + `ficha_treino` | cliente, no sync |
| `proposta_ficha_treino` (nova) | staging: `registro_id` (1:1), `payload_json`, `avisos_json`, `status` (`concluido`/`falha`), `erro`, `modelo` | **só** o worker de IA |
| `ficha_treino.registro_id` (novo, nulo) | rastreio: de qual Registro a ficha nasceu (nulo para ficha manual) | `fichaTreino.service` na confirmação |

### Confirmação em endpoint próprio

- `POST /api/v1/registros/:id/confirmar-ficha-treino` (só `tipo = ficha_treino`,
  só em `aguardando_revisao`, só com proposta `concluido`). Payload:
  `{ fichas: [{ nome, observacoes, substituiFichaId | null, grupos }] }` — o
  mesmo formato do editor manual.
- Numa transação: `criarNovaVersao` para cada ficha (validação de catálogo,
  quantidade por tipo de grupo, substituição só de ficha ativa do aluno — tudo
  da ADR-0026), `registro_id` gravado, `registro.status = confirmado`.
  `criarNovaVersao` passa a aceitar uma transação externa.
- **Invariantes** (com teste): `ficha_treino` + `confirmado` ⟺ existe ao menos
  uma `ficha_treino` com aquele `registro_id`; nenhum caminho deste fluxo
  escreve `validacao`; nenhum worker escreve `ficha_treino*`.
- "Refazer interpretação" e "Descartar" iguais aos da avaliação física.

### Revisão (`components/revisao/RevisaoFichaTreino.vue`)

- Painel de conferência: transcrição, ouvir áudio, avisos, confiança por item.
- Uma seção por ficha com nome editável e o seletor **"Nova ficha" /
  "Substituir '<ficha ativa>'"**, pré-selecionado quando o nome ditado (sem
  acento/caixa) é igual ao de uma ficha ativa do aluno. A sugestão é do código,
  não da IA.
- Os grupos/itens no **mesmo editor da ficha manual** — o editor sai de
  `FichaTreinoSecao.vue` para um componente próprio (`FichaTreinoEditor.vue`)
  usado nos dois lugares.
- Item não reconhecido (ou trocado pelo personal): busca no catálogo
  (`BuscaExercicio`) com a caixa **"Salvar '<nome ouvido>' como apelido"**
  (desmarcada, texto editável) ou **"Cadastrar exercício"** (só nome e grupo
  muscular, como exercício próprio da equipe). Ambos usam os endpoints que já
  existem (`POST /exercicios`, `POST /exercicios/:id/apelidos`), na hora — não
  dependem da confirmação da ficha. Confirmar fica bloqueado enquanto houver
  item sem exercício.

### Efeitos em outras telas

- **Relatos / painel "Ação necessária"**: a pendência aparece com o chip
  "Ficha" (como "Avaliação física" hoje).
- **Atendimentos (ADR-0020), Histórico, Linha do Tempo, Acompanhamento
  Mensal**: Registro de ficha **não conta** como atendimento nem relato — ficam
  de fora (o Histórico já filtra `tipo = atendimento`).

## Alternativas consideradas

- **Rotear por `resultado_ia`/`validacao`** — rejeitado pelos mesmos motivos da
  ADR-0018: `validacao` é relato de atendimento confirmado.
- **Uma ficha por Registro** — mais simples, mas obriga a gravar a divisão em
  vários Registros em sequência (só um em andamento por tipo). Rejeitado pelo
  personal.
- **IA decidir nova × substituir** — o casamento por nome é determinístico e
  barato; a decisão final é do personal na revisão.
- **IA devolver UUID do catálogo** — risco de id inventado; referência curta
  traduzida no código elimina isso.
- **Salvar apelido / cadastrar exercício só na confirmação** — acopla
  manutenção do catálogo à ficha; os endpoints da ADR-0027 já resolvem na hora.
- **IA sugerir exercícios/séries ("montar o treino")** — continua fora de
  escopo.

## Consequências

- Migration: constraint de `registro.tipo`, tabela `proposta_ficha_treino`,
  coluna `ficha_treino.registro_id`.
- `fichaTreino.service.criarNovaVersao` aceita transação externa; o editor da
  ficha vira componente reaproveitável.
- O prompt cresce com o catálogo (112 globais + os da equipe, com apelidos) —
  alguns milhares de tokens; aceitável para o Flash.
- Qualidade da extração com Gemini real precisa ser medida (mesma pendência do
  resto do pipeline).
