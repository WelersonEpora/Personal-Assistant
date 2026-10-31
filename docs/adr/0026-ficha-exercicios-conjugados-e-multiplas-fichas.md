# ADR-0026: Exercícios conjugados na Ficha de Treino e várias fichas ativas por aluno

**Status:** Aceita (2026-10-31)

## Contexto

A Ficha de Treino da ADR-0013 é uma lista plana: cada
`ficha_treino_exercicio` tem seu próprio `series`/`repeticoes`/`carga_obs` e
nada liga um exercício a outro. Duas situações reais do dia a dia do personal
não cabem nesse modelo:

1. **Exercícios conjugados** — bi-set, tri-set, circuito. O aluno faz uma
   série de supino, emenda agachamento, emenda abdominal, descansa, e repete a
   "volta" inteira. As séries deixam de ser de um exercício e passam a ser do
   **grupo**. Hoje o personal só consegue escrever isso como texto em
   `carga_obs`, e o aluno lê três exercícios independentes.
2. **Divisão de treino** — "hoje membros inferiores, amanhã superiores". O
   índice único `uq_ficha_treino_aluno_ativo` (ADR-0013) só permite uma ficha
   ativa por aluno; o personal precisava juntar a divisão inteira numa ficha só.

Respostas do personal que moldaram a decisão: usa os nomes bi-set, tri-set e
circuito; prescreve descanso entre as voltas; quando as repetições mudam de uma
volta para outra, anota na observação (não precisa de estrutura por volta); há
exercícios por tempo (prancha, "30s").

## Decisão

### Grupo como nível entre a ficha e os exercícios

```text
ficha_treino
  └─ ficha_treino_grupo          ordem, tipo, series, descanso, observacoes
       └─ ficha_treino_exercicio  ordem (no grupo), repeticoes, carga_obs
```

- **Todo exercício pertence a um grupo.** Um exercício isolado é um grupo
  `simples` de um item — a tela o mostra como antes, sem moldura. Um caso só no
  código: `series` vive **sempre** no grupo, nunca nos dois lugares.
- `tipo`: `simples` | `biset` | `triset` | `circuito`. É escolha do personal
  (são os nomes que ele usa), com a quantidade de exercícios conferida no
  service: simples = 1, bi-set = 2, tri-set = 3, circuito ≥ 2.
- `series`: séries do exercício (simples) ou **voltas** do grupo (conjugado).
- `descanso` (novo): texto curto como `repeticoes` ("60s", "1min30") — entre
  séries no simples, entre voltas no conjugado. Texto e não segundos pela mesma
  razão de `repeticoes`: o personal escreve faixas e notações livres.
- `repeticoes` continua texto; exercício por tempo é só "30s". Repetições que
  mudam por volta vão para `carga_obs`/observação do grupo.
- `ficha_treino_exercicio` mantém `ficha_treino_id` (escopo e consultas diretas)
  e ganha `grupo_id`; perde `series`. Unicidade de `ordem` passa a ser por grupo.
- Migração dos dados: cada item existente vira um grupo `simples` com as séries
  que já tinha — fichas antigas aparecem idênticas.

### Várias fichas ativas por aluno

- Sai o índice único "uma ficha ativa por aluno".
- `ficha_treino.substitui_id` (novo, anulável, auto-referência): a versão
  anterior que esta ficha substitui. **Nova versão desativa só a ficha
  substituída** — "Inferiores" muda sem tocar em "Superiores". Índice único
  parcial em `substitui_id`: uma ficha só pode ser substituída uma vez (duas
  edições concorrentes da mesma ficha não geram duas ativas).
- Três ações do personal:
  - **Nova ficha** (`substitui_id` nulo) — soma às ativas;
  - **Editar** — nova versão daquela ficha (histórico imutável, como na ADR-0013);
  - **Arquivar** — `ativo = false` sem substituta, para quando a divisão
    encolhe (`POST /api/v1/fichas-treino/:id/arquivar`).
  No histórico, "Substituída" × "Arquivada" sai de existir ou não uma ficha com
  `substitui_id` apontando para ela — sem coluna nova.
- **Nome obrigatório no front** (é o que diferencia as fichas ativas); o
  backend aceita nulo, como as fichas antigas. Ativas aparecem ordenadas por nome.
- `GET /alunos/:id/fichas-treino/ativa` (sem uso no front) vira
  `GET /alunos/:id/fichas-treino/ativas` (lista).

### Efeitos em outras partes

- **Link do aluno (ADR-0014):** continua um por aluno — o token aponta para o
  aluno, não para uma ficha — e a consulta pública passa a devolver **todas** as
  fichas ativas (`fichas: [...]` no lugar de `ficha`), cada uma com seus grupos.
  A imagem de exercício continua restrita a exercícios das fichas ativas do token.
- **Painel (ADR-0017):** "sem ficha ativa" = nenhuma ativa; "ficha antiga" olha a
  ficha ativa **mais recente** (`MAX(created_at)`) — renovar parte da divisão
  conta como acompanhamento. O rodapé do catálogo passa a contar **alunos com
  ficha ativa** (`alunos_com_ficha_ativa`), senão o número infla com a divisão.

## Alternativas consideradas

- **Coluna `grupo` (número) em `ficha_treino_exercicio`**, itens com o mesmo
  número formando o circuito. Migration mínima, mas `series` ficaria repetido em
  cada item do grupo (e podendo divergir) e o descanso entre voltas não teria
  lugar natural. Rejeitada.
- **Grupo opcional (`grupo_id` anulável)**, exercício isolado sem grupo. Dois
  caminhos de leitura/escrita (séries no item ou no grupo) em todo consumidor.
  Rejeitada em favor de "todo item tem grupo".
- **Repetições por volta estruturadas.** Sem necessidade relatada — o personal
  usa a observação. Pode virar campo depois sem mexer na estrutura.
- **`descanso` em segundos (inteiro).** Mais fácil de somar/validar, mas ninguém
  consome numericamente hoje e o personal escreve "1min30", "60-90s". Rejeitada.
- **Identidade estável de "divisão" (tabela `plano_treino` ou coluna
  `divisao`).** `substitui_id` já liga as versões de uma mesma ficha com uma
  coluna só; uma entidade de plano é sistema de treino além do decidido.

## Consequências

- Tabela nova `ficha_treino_grupo`; `ficha_treino_exercicio` ganha `grupo_id` e
  perde `series`; `ficha_treino` ganha `substitui_id` e perde o índice único de
  ativa. Payload de criação passa de `itens` para `grupos[].itens`.
- A ficha continua sem IA (ADR-0013); a futura sugestão de treino por IA
  encontra a estrutura de grupos já relacional.
- Nada muda em Registro, pipeline de IA, `validacao` ou Linha do Tempo.
