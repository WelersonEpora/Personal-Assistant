# ADR-0016: Avaliação Física (modelo v3) e importação do legado BodyMove

**Status:** Aceita (2026-08-28)

> **Atualização (2026-08-28):** a interface CRUD foi implementada logo em
> seguida, **sem mudança de modelo** — endpoints
> `GET/POST/PUT/DELETE /api/v1/alunos/:id/avaliacoes-fisicas`, catálogo em
> `/api/v1/metricas-avaliacao-fisica`, validação do esquema fechado dos JSON
> (§5) no service, recálculo de IMC/RCQ na gravação, `aluno.data_nascimento`/
> `sexo` no cadastro, e a tela de Avaliações Físicas por aluno (listagem,
> visualização, formulário completo, exclusão com confirmação). Avaliações
> `origem = legado_bodymove` são editáveis com a origem e os protocolos
> preservados.
>
> **Atualização (2026-08-28, cont.):** `massa_gorda` e `massa_magra` entraram
> como métricas **derivadas** (modelo 2-compartimentos: `massa_gorda = peso ×
> %gordura_principal / 100`; `massa_magra = peso − massa_gorda`), pela mesma
> mecânica de IMC/RCQ — calculadas e armazenadas pelo service, nunca escritas
> por humano, recalculadas quando uma entrada muda. Backfill das importadas por
> `scripts/recalcular-derivadas-avaliacao-fisica.js` (idempotente). A tela de
> Avaliações Físicas ganhou a aba **"Comparar"** (métricas × avaliações no
> tempo, valor `principal`, pivot client-side sobre o list endpoint — sem
> endpoint novo), com **seletor de período** (Tudo / 5 / 2 / 1 ano, relativo
> à avaliação mais recente) que escopa tabela e gráficos, e **gráficos de
> evolução** em Apache ECharts (composição corporal, indicadores IMC/%gordura
> em gráficos separados, perímetros com seleção de métricas). ECharts entrou
> como dependência, usada no mesmo padrão do AgroMind
> (`src/components/charts/EChartsBase.vue` + `LineChart.vue` +
> `utils/echarts-option-builder.js` puro/testado), isolada no chunk
> `vendor-echarts` (lazy, fora do precache do PWA — ADR-0003). O gráfico de
> IMC ganhou **faixas de referência** de fundo (classificação convencional
> adulto — abaixo do peso / normal / sobrepeso / obesidade), discretas
> (`markArea` em tint de baixa opacidade), rotuladas explicitamente como
> **referência visual, não diagnóstico**. O eixo Y desse gráfico abre no
> mínimo em 15–35 (união com o intervalo do aluno) para ele ver a distância
> até as outras faixas, em vez do auto-zoom do ECharts na variação. O bloco `fato` para o prompt da IA
> (§7/§12.8) continua fora de escopo.

## Contexto

O personal parceiro usou por 16 anos o **BodyMove** (software desktop de
avaliação física, banco Access Jet 3.0). O backup real (`Legado/BodyMove/
bodymove.bak`, fora do controle de versão — PII e dados de saúde) tem
**147 alunos e 405 avaliações** de 05/04/2010 a 22/01/2026: antropometria,
dobras cutâneas, % de gordura por vários protocolos, perímetros, anamnese,
avaliação postural e testes cardiorrespiratórios pontuais. Vários alunos têm
10–14 avaliações — série longitudinal real.

Até aqui o Personal Assistant **não tinha nenhuma estrutura de avaliação
física**, por decisão deliberada (ADR-0008: modelo de dados provisório, "não
antecipar o sistema legado"). Analisado o legado (`Legado/MAPEAMENTO-
BODYMOVE.md`) e amadurecida a proposta até a v3 (`Legado/PROPOSTA-MODELO-
AVALIACAO-FISICA.md`), esta ADR promove a v3 a decisão e cobre a importação
do histórico.

Objetivo desta rodada: **validar estrutura + dados importados** antes de
qualquer tela. Dashboard, formulário de avaliação, comparação de N avaliações,
read-model de histórico/tendência e função de contexto para a IA ficam para
rodadas seguintes.

## Decisão

### 3 tabelas + 2 colunas em `aluno`

| Objeto | Papel |
|---|---|
| `aluno.data_nascimento`, `aluno.sexo` | atributos estáveis da pessoa (nulos; cadastro mínimo não exige) |
| `metrica_avaliacao_fisica` | catálogo controlado (~40 métricas, seed) — `codigo` PK, `rotulo`, `categoria`, `unidade` (vocabulário fechado), `casas_decimais`, `direcao_favoravel`, `ordem`, `ativo` |
| `avaliacao_fisica` | cabeçalho da sessão: `aluno_id`, `equipe_id`, `data` (DATEONLY), `origem` (`legado_bodymove`\|`manual`), `avaliador_id` (nulo no legado), `anamnese_json`, `postural_json`, `observacoes` |
| `avaliacao_fisica_medida` | tabela estreita: 1 linha por métrica × método — `metrica_codigo` (FK catálogo), `metodo` (default `direto`), `principal` (bool), `valor` (`NUMERIC(8,3)`, unidade canônica), `origem_valor` (`medido`\|`calculado`\|`importado`) |

Não é EAV aberto: todo `valor` é numérico, todo `metrica_codigo` existe no
catálogo, toda unidade é fechada e **derivada do catálogo** (nunca gravada por
linha; a conversão de unidade, se houver, é feita na borda — API/importador).

### `metodo` na medida, não no evento

O legado tem **10 avaliações com 2–3 protocolos de % de gordura na mesma
sessão** (ex.: Pollock-7 / Durnin-Womersley / Petroski, ~7 pontos de
diferença). `metodo` como coluna de `avaliacao_fisica` não comporta isso.
`metodo` é coluna da **medida**, com unicidade
`(avaliacao_fisica_id, metrica_codigo, metodo)` — a avaliação grava 3 linhas
de `percentual_gordura`, uma por método. `METODOS_VALIDOS` é constante de
código (`src/services/avaliacao-fisica/metodos.js`), padrão de
`Exercicio.DIFICULDADES`.

### `principal` — série "linha única" por intenção, não por heurística

Uma heurística de prioridade (`dexa` > bioimpedância > dobras) produz **degrau
falso** no gráfico temporal quando o método muda pontualmente. `principal`
(bool, default `true`, **índice único parcial** `(avaliacao_fisica_id,
metrica_codigo) WHERE principal`) marca o valor acompanhado. O gráfico de linha
única faz `WHERE metrica_codigo = :m AND principal`; detalhe e comparação
mostram todos os métodos.

### Métricas derivadas (IMC, RCQ) são do service

`origem_valor = calculado`; recalculadas a partir de outras medidas da mesma
avaliação (`src/services/avaliacao-fisica/metricas-derivadas.js`, função pura);
armazenadas (não só na leitura) para o gráfico as tratar como qualquer métrica;
nunca escritas por um humano. Entrada faltando → a derivada não é gravada
(série esparsa). Nesta rodada só `imc` e `rcq`; `rcest` e massa gorda/magra
derivadas ficam para depois (a função é o ponto de extensão).

### Fora do pipeline de IA e de `validacao`

Avaliação física é **dado objetivo do personal** — não é proposta a confirmar
(ADR-0007 intacto), não é interpretação da IA (≠ `avaliacao_mensal`). CRUD
direto, como `avaliacao_personal`. Nenhum job/worker escreve nessas tabelas.
A importação não toca `registro*`, `resultado_ia`, `validacao`, `transcricao`
nem a sincronização.

### Importação do BodyMove

Importador one-shot (`backend/scripts/importar-avaliacoes-bodymove.js` +
`src/services/avaliacao-fisica/importador-bodymove.js`), lê o `.bak` com
`mdb-reader` (devDependency — o `.bak` nunca entra na imagem; roda na máquina
do dev). Dividido em `transformarLegado` (puro) e `persistir` (transacional).

- **Idempotente** por `(aluno_id, data, origem='legado_bodymove')` — avaliação
  já existente pula todo o subtree; re-execução é no-op.
- **Match de aluno** por chave natural `(equipe_id, nome normalizado,
  data_nascimento)` — sem coluna de rastreio. Aluno já criado à mão que casa é
  **vinculado e completado** (anexa avaliações, preenche `data_nascimento`/
  `sexo` se nulos, nunca sobrescreve). Nome igual + nascimento diferente =
  pessoa diferente.
- **Preserva os protocolos**: cada tabela de % de gordura / VO₂ do legado vira
  uma linha com seu `metodo`; `principal` = o que casa com
  `antropometria.padrao` (`pollock` → `pollock_7`), senão o primeiro da
  precedência.
- `origem_valor`: `importado` (medida bruta), `calculado` (% gordura, VO₂,
  IMC, RCQ).
- **Descartado** (proposta v3 §8): `chart` (imagem OLE), medições parciais das
  dobras (`*1/*2/*3`), escores de risco coronariano, `cardio_zonatreinamento`,
  tabelas de config/referência, colunas posturais sem lugar no esquema v3.
- PA/FC de repouso do texto livre da anamnese (`obs`) → medidas
  `pas_repouso`/`pad_repouso`/`fc_repouso` quando parseáveis; senão vira aviso,
  sem invenção.

Resultado verificado contra o `.bak` real: 147 alunos, 405 avaliações,
~11,5 mil medidas, 3 avisos (texto livre não parseável), 0 violação de
`principal` único.

## Alternativas consideradas

- **`medidas_json` (blob por avaliação)** — sem série consultável, sem
  vocabulário, sem unidade, não distingue medido de calculado. Dívida garantida
  para dado que vira gráfico.
- **Tabela larga com colunas fixas** — migração a cada métrica nova; incha com
  dobras/perímetros/segmentares de InBody; linhas esparsas.
- **`metodo_composicao` no evento** — não comporta avaliação multi-protocolo
  (10 casos comprovados no legado).
- **Codificar o método no `metrica_codigo`** (`percentual_gordura_pollock7`) —
  explode o catálogo e quebra a query "% gordura no tempo".
- **Heurística de prioridade de método** (v2) — degrau falso no gráfico
  temporal; substituída por `principal` (v3).
- **Uma tabela por protocolo/tela (como o BodyMove)** — 27 tabelas, joins em
  leque.
- **Reusar `resultado_ia`/`validacao`** — semântica errada; `validacao` é
  reservada para confirmação de saída de IA (ADR-0007).
- **Coluna `aluno.legado_bodymove_id`** para idempotência — descartada;
  chave natural (nome + nascimento) basta na escala atual e evita ampliar o
  schema de `aluno`.

## Consequências

- `aluno` ganha 2 colunas nulas; nenhum fluxo existente muda.
- Uma carga de dashboard = 3–4 queries simples sem N+1 (proposta v3 §12).
  Volume: ~11,5 mil linhas do legado; sub-milissegundo nessa escala.
- Alavancas documentadas, sem bloquear nada agora: denormalizar
  `aluno_id`/`data` na medida (só se o volume crescer ordens de grandeza);
  faixas de referência no catálogo para classificação normativa;
  `avaliacao_fisica_achado_postural` se "evolução postural" virar requisito;
  tabela de métodos se `METODOS_VALIDOS` ganhar metadados de exibição.
- Validador de esquema fechado dos JSON (erro 422 na escrita) e as telas/
  read-model/contexto-para-IA ficam para a fase da API — o importador só grava
  chaves do esquema por construção.
- `mdb-reader` entra como devDependency.

## Fora de escopo (sem decisão nova)

Cálculo dos protocolos (Pollock, VO₂, risco coronariano) para avaliações
**novas**; classificação normativa; fotos/laudo em PDF/assinatura; avaliação
física no fluxo de captura/IA; dashboard e formulário de avaliação.
