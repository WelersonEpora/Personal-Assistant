# ADR-0025: Avaliação física do mês como contexto do Acompanhamento Mensal

**Status:** Aceita (2026-10-31)

> Complementa a ADR-0015 (Acompanhamento Mensal) e a ADR-0016 (avaliação
> física). Não altera a ADR-0007: a avaliação física continua dado do personal,
> fora de `validacao`, e o Acompanhamento Mensal continua uma interpretação da
> IA, nunca dado oficial. Não altera a ADR-0018: a IA continua sem calcular
> nada.

## Contexto

O Acompanhamento Mensal (`avaliacao_mensal`, ADR-0015) é gerado a partir de:
contexto consolidado do mês anterior, relatos confirmados no mês (por
`validacao.confirmado_em`), observações do personal (`avaliacao_personal`) e o
comentário da revisão do mês anterior (ADR-0023).

A **avaliação física não entra** — nem a digitada no formulário, nem a
capturada por voz (ADR-0018: ela vira `avaliacao_fisica` sem `validacao`, então
o Registro também fica fora do filtro de relatos). O próprio
`montarPromptAvaliacao` já anotava a lacuna ("quando entrar, será outro bloco").
Resultado: a IA fecha o mês falando de força, adesão e dor, mas ignora as
únicas medidas objetivas do aluno — peso, % de gordura, perímetros — mesmo
quando a avaliação foi feita naquele mês. A Linha do Tempo do aluno já mostra a
avaliação física ao lado do Acompanhamento Mensal, o que deixa a ausência ainda
mais visível.

Há duas necessidades distintas, que esta ADR separa de propósito:

1. **Contexto do mês** — as medidas da avaliação feita no mês ajudando a IA a
   entender aquele mês. *(Esta ADR.)*
2. **Evolução no tempo** — a IA analisando todas as avaliações do aluno para
   descrever a trajetória de longo prazo. *(Fora desta ADR — ver Alternativas.)*

Mandar todo o histórico (todas as avaliações + todos os Acompanhamentos) no
prompt mensal foi descartado: dilui o que é do mês, a IA tende a pesar igual
dado velho e novo e a "descobrir" tendências a partir de números que não são
comparáveis (métodos diferentes). O ciclo mensal já carrega memória resumida
pelo contexto consolidado.

## Decisão

### 1. O código calcula, a IA interpreta

O service monta um bloco **compacto e já calculado** — valores, diferenças,
intervalo em dias. A IA recebe números prontos e só os interpreta. Nenhuma
conta (diferença, tendência, classificação de IMC) fica a cargo da IA. Função
pura, testável: `backend/src/services/avaliacao-mensal/bloco-avaliacao-fisica.js`.

### 2. Quais avaliações entram

- **Do mês:** toda `avaliacao_fisica` do aluno com `data` dentro do mês de
  referência (a data da avaliação, não `created_at`).
- **Base de comparação:** a avaliação imediatamente **anterior** à primeira do
  mês (`data` < início do mês), de qualquer origem — inclusive as importadas do
  BodyMove. Ela entra só como referência das diferenças, não como avaliação a
  comentar.
- **Mês sem avaliação:** o bloco vira uma linha — "Nenhuma avaliação física
  neste mês. Última: DD/MM/AAAA (há N dias)" (ou "nenhuma registrada"). Permite
  à IA recomendar reavaliação sem receber número antigo como se fosse atual.

Por que `data` e não a data de registro: o objetivo é "o que aconteceu no mês".
Consequência aceita: uma avaliação de 30/10 lançada em 03/11, depois de o
Acompanhamento de outubro já ter sido gerado, só entra se o personal clicar
**Regerar** em outubro (a Linha do Tempo já a mostra em outubro). Bucketing por
`created_at` (como os relatos por `confirmado_em`) jogaria as 405 avaliações
importadas do BodyMove no mês da importação.

### 3. Quais métricas

Só a medida **principal** (`avaliacao_fisica_medida.principal = true`) das
métricas que dizem algo sobre composição e evolução:

| Grupo | Métricas |
|---|---|
| Antropometria | `peso` |
| Composição | `percentual_gordura`, `massa_magra`, `massa_gorda`, `massa_muscular_esqueletica` |
| Índices | `imc`, `rcq`, `rcest` |
| Perímetros | `perimetro_cintura`, `perimetro_abdome`, `perimetro_quadril`, `perimetro_braco_d`, `perimetro_coxa_d` |
| Cardio | `fc_repouso`, `pas_repouso`/`pad_repouso` (como "PA 120/80") |

Ficam fora: dobras cutâneas individuais (já estão resumidas na % de gordura),
densidade corporal, altura, os demais perímetros e lados esquerdos, **anamnese e
avaliação postural** (texto livre e dados de saúde sensíveis — a anamnese já
chega à IA quando o personal a menciona nos relatos ou nas observações). A lista
fica numa constante do módulo; ampliar é mudança de código, não de ADR.

### 4. Regra do método (comparabilidade)

A diferença de uma métrica só é calculada quando **o mesmo `metodo`** produziu
o valor nas duas avaliações. % de gordura por Pollock 7 e por bioimpedância não
são comparáveis; massa gorda/magra herdam o método da %. Quando o método muda,
a linha leva o aviso em vez da diferença:

```
% de gordura: 24,8 % (bioimpedância) — método diferente da anterior (Pollock 7: 27,1 %), não comparar
```

`direto` × `direto` (peso, perímetros) sempre compara.

### 5. O bloco no prompt

```
=== AVALIAÇÃO FÍSICA DO MÊS (medidas objetivas registradas pelo personal) ===
[avaliacao_fisica:<id> | em 2026-10-18 | anterior: 2026-09-06, 42 dias antes]
  - Peso corporal: 68,4 kg (−1,6 kg)
  - % de gordura (Pollock 7 dobras): 27,1 % (−1,2 p.p.)
  - Massa magra (livre de gordura) (Pollock 7 dobras): 49,9 kg (+0,1 kg)
  - Massa gorda (Pollock 7 dobras): 18,5 kg (−1,7 kg)
  - IMC: 24,2 kg/m² (−0,6 kg/m²)
  - Perímetro da cintura: 76,0 cm (−2,0 cm)
  - PA de repouso: 120/80 mmHg (anterior: 130/85)
```

- Valores com as casas decimais do catálogo (`casas_decimais`) e a unidade
  dele (índice adimensional sai sem unidade); diferença arredondada a zero vira
  "sem variação"; % de gordura varia em "p.p.".
- Massa gorda/magra são gravadas com `metodo = direto` (derivadas no service),
  mas para a regra do §4 **herdam o método da % de gordura** da mesma avaliação.
- Implementação: `montarBlocoAvaliacaoFisica` em
  `backend/src/services/avaliacao-mensal/bloco-avaliacao-fisica.js`; leitura em
  `avaliacaoFisica.repository.listarParaAcompanhamento`.
- Sem anterior: as linhas saem sem diferença e o cabeçalho diz "primeira
  avaliação registrada".
- Mais de uma avaliação no mês: uma seção por avaliação, em ordem de data; a
  segunda compara com a primeira.

### 6. Instrução à IA (`INSTRUCAO_AVALIACAO_MENSAL`)

Novo item 5 na lista de blocos e uma regra:

- As medidas da AVALIAÇÃO FÍSICA são **fatos objetivos** (origem
  `"avaliacao_fisica:<id>"`, `tipo: "fato"`): prevalecem sobre impressões dos
  relatos quando houver contradição ("está mais magro" × balança) — e a
  contradição vai para `alertas` ou `pendencias_confirmacao`.
- Use as diferenças **como vieram**; não recalcule, não extrapole tendência a
  partir de uma única comparação, não compare valores marcados "não comparar".
- Variação pequena (dentro do erro de medida — ex.: ±0,5 kg de peso, ±1 ponto
  de % de gordura por dobras) é estabilidade, não progresso nem piora.
- Abra a dimensão "Composição corporal" (reaproveitando o nome, conforme a
  regra de nomeação já existente) só quando houver avaliação no mês.
- Atualize `estado_atual`/`linha_de_base` do contexto consolidado com o
  resumo da avaliação (data + principais valores), para o mês seguinte saber
  qual foi a última medida sem precisar do bloco.

### 7. Rastreabilidade

Nova coluna `avaliacao_mensal.avaliacoes_fisicas_consideradas` (`JSONB`,
default `[]`), irmã de `avaliacoes_personal_consideradas`: ids das avaliações
do mês que foram de fato para a IA (a base de comparação não entra na lista).
Migration aditiva, sem backfill (Acompanhamentos antigos ficam com `[]`, que é
a verdade).

### 8. O que não muda

- `MINIMO_RELATOS` (3) continua valendo: uma avaliação física sozinha **não**
  destrava a geração de um mês sem relatos. A avaliação é contexto, não
  substituto dos atendimentos.
- A análise intermediária de IA (`analise_sob_demanda`) fica **fora** nesta
  rodada — avaliar depois de o mensal rodar com dados reais.
- PDF do aluno (ADR-0023): nada novo no fluxo. Se a IA abrir a dimensão
  "Composição corporal", ela aparece no checklist de itens como qualquer outra
  dimensão, e o personal decide se vai para o aluno.
- Nenhum job/worker passa a escrever em `avaliacao_fisica*` (ADR-0016) — o
  service do Acompanhamento só **lê**.

## Alternativas consideradas

- **Mandar todas as avaliações do aluno no prompt mensal.** Descartada:
  ruído, custo de contexto e risco de a IA comparar métodos diferentes ou
  inventar tendência. Vira a funcionalidade 2 abaixo, com resumo de séries
  calculado pelo código.
- **Deixar a IA calcular as diferenças a partir dos valores brutos.**
  Descartada: conta é trabalho de código (exato, testável); a ADR-0018 já
  segue esse princípio.
- **Bucketing por `created_at`.** Descartada pelo efeito nas importadas do
  BodyMove (§2).
- **Incluir anamnese/postural.** Descartada nesta rodada: texto livre extenso,
  dado de saúde sensível e já coberto pelo que o personal relata.
- **Funcionalidade 2 — análise de evolução de todas as avaliações.** Adiada
  para ADR própria: análise de IA sob demanda na aba Avaliações Físicas, com
  séries por métrica e por método resumidas pelo código (pontos, primeiro,
  último, mín., máx., tendência), saída como proposta da IA em tabela própria.

## Consequências

- O Acompanhamento Mensal passa a falar de composição corporal com base em
  medida, não só em impressão de relato, e a sinalizar contradições entre os
  dois.
- Prompt um pouco maior só nos meses com avaliação (~10–20 linhas por
  avaliação); nos demais, uma linha.
- Avaliação lançada atrasada exige **Regerar** o mês dela (§2) — comportamento
  explícito, visível na Linha do Tempo.
- Testes novos: o módulo puro do bloco (seleção do mês, base anterior,
  diferença só com mesmo método, mês sem avaliação, múltiplas no mês) e a
  integração do service gravando `avaliacoes_fisicas_consideradas` e nunca
  escrevendo em `avaliacao_fisica*`.
