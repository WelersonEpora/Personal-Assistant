# ADR-0029: Avaliação física no PDF do Acompanhamento Mensal

**Status:** Aceita e implementada (2026-10-31). Exercitada contra o Gemini real
(relatos reais + avaliações em memória, sem gravar): parágrafo em segunda
pessoa, com os números exatos da tabela e ligado aos relatos do mês.

> Estende a ADR-0023 (PDF do aluno) e a ADR-0025 (avaliação física como
> contexto do Acompanhamento Mensal). Não muda a regra do mínimo de 3 relatos,
> não cria envio avulso da avaliação física e não toca `validacao` nem
> `avaliacao_fisica*`.

## Contexto

O personal quer mandar a avaliação física para o aluno, mas a avaliação é uma
lista de números que o aluno não sabe ler. O que dá sentido aos números é o
mês: "a % de gordura caiu 1,8 ponto, junto com a regularidade nos treinos de
força".

Desde a ADR-0025 o Acompanhamento Mensal já recebe a avaliação do mês, com as
diferenças calculadas pelo código (`avaliacao-mensal/bloco-avaliacao-fisica.js`),
e a IA pode abrir a dimensão "Composição corporal". Mas:

- o PDF do aluno (ADR-0023) só mostra o texto da IA, nunca os números;
- a dimensão é opcional e escrita para o personal (evidências, origem,
  confiança), não para o aluno.

Decisões do personal: a avaliação vai ao aluno **só no fechamento do mês**
(junto do Acompanhamento Mensal, sem envio avulso), e o mínimo de 3 relatos
continua valendo (mês sem Acompanhamento não leva a avaliação).

## Decisão

### 1. Tabela calculada pelo código, guardada junto do Acompanhamento

- `bloco-avaliacao-fisica.js` ganha `montarResumoParaAluno`: linhas com
  medida, valor atual, valor anterior, diferença e "comparável", montadas com
  os mesmos helpers do bloco do prompt (medida principal, método comparável,
  diferença formatada) — a regra é uma só para a IA e para o PDF. Na tabela do
  aluno o método aparece só na % de gordura.
- Nova coluna `avaliacao_mensal.avaliacao_fisica_resumo_json` (`JSONB`, nula):
  essa estrutura, gravada na geração. O PDF mostra exatamente os números que a
  IA viu; avaliação editada depois do fechamento exige **Regerar** (mesma regra
  da ADR-0025), e regerar já marca a revisão do PDF como desatualizada
  (ADR-0023).
- Com mais de uma avaliação no mês, a tabela é a **mais recente**, comparada
  com a imediatamente anterior (pode ser do mesmo mês).
- Métricas da tabela do aluno: peso, % de gordura (com o método), massa magra,
  massa gorda, massa muscular esquelética e perímetros de cintura, abdome,
  quadril, braço e coxa — só a medida `principal`, só as presentes. Ficam fora
  do PDF: dobras, IMC, RCQ/RCEst, pressão arterial, FC de repouso, anamnese e
  postural (dado técnico ou de saúde sensível; continuam no prompt da IA como
  hoje).
- Colunas: medida · atual (data) · anterior (data) · diferença. Método
  diferente da anterior → "—" na diferença, com nota "medido por outro método,
  não comparável". Primeira avaliação → sem colunas de anterior/diferença.

### 2. Parágrafo da IA para o aluno

- Novo campo opcional no schema do Acompanhamento:
  `avaliacao_mensal.leitura_avaliacao_fisica` (texto), preenchido **só** em mês
  com avaliação física.
- Instrução: 3 a 5 frases, em segunda pessoa ("você"), linguagem simples, sem
  jargão; ligar os números ao que aconteceu no mês (frequência, treinos, o que
  o aluno relatou); usar as diferenças como vieram (não recalcular); variação
  dentro do erro de medida é estabilidade; nada de diagnóstico de saúde; não
  citar valores marcados "não comparar". É a mesma IA, a mesma geração — não
  há chamada extra.
- A dimensão "Composição corporal" continua existindo para o personal.

### 3. No PDF e na preparação

- Seção "Sua avaliação física" no documento, depois do resumo do mês: a tabela
  e, abaixo, o parágrafo. Só aparece quando o mês tem avaliação.
- Duas chaves novas em `itens_excluidos` (lista de textos que o backend já
  aceita, sem mudança de schema): `avaliacao_fisica:tabela` e
  `avaliacao_fisica:leitura` — o personal pode tirar qualquer uma no checklist.
- Quando o parágrafo existe, a dimensão "Composição corporal" vem
  **desmarcada por padrão** no checklist (evita dizer a mesma coisa duas vezes
  no PDF); o personal pode marcá-la de novo.
- A lista branca da ADR-0023 continua: o que não estiver nela não vai ao PDF.

## Alternativas consideradas

- **Montar a tabela no cliente, buscando as avaliações na hora do PDF.**
  Rejeitada: duplicaria a regra de comparabilidade no frontend e poderia
  mostrar números diferentes dos que a IA leu (avaliação editada depois).
- **Envio avulso da avaliação logo após lançá-la.** Rejeitada pelo personal
  nesta rodada — o fechamento do mês reaproveita revisão, comentário e PDF.
- **Avaliação física destravar um Acompanhamento sem 3 relatos.** Rejeitada
  pelo personal — mantém a regra da ADR-0025.
- **Reaproveitar a dimensão "Composição corporal" como texto do aluno.**
  Rejeitada: é opcional e escrita para o personal; um campo próprio garante o
  parágrafo e o tom.
- **Incluir todas as métricas no PDF.** Rejeitada: dobras, IMC e PA confundem
  ou preocupam sem contexto profissional.

## Consequências

- Migration aditiva (`avaliacao_fisica_resumo_json`), sem backfill: meses já
  gerados só ganham a seção ao **Regerar**.
- `bloco-avaliacao-fisica.js` ganha a função da tabela, com testes próprios;
  o bloco do prompt não muda.
- Schema e instrução do Acompanhamento ganham um campo; o prompt cresce pouco.
- `utils/avaliacaoMensalCompartilhada.js` e a tela de compartilhar ganham a
  seção, as duas chaves e o padrão desmarcado da dimensão.
- O detalhe do Acompanhamento no `/admin` mostra o parágrafo e a tabela para o
  personal conferir antes de compartilhar.

## Adendo (2026-11-12) — gráfico da composição corporal no PDF

**Contexto.** O personal sentiu falta de informação visual da avaliação física,
inclusive para o aluno com uma avaliação só (o "Comparar", com gráficos de
evolução, exige duas ou mais). Na tela do personal isso virou o **retrato da
avaliação** (composição, indicadores na régua de referência da ADR-0031 e
perímetros, desde a 1ª avaliação, calculado na hora, sem ADR própria). Para o
aluno, vai só a parte do retrato que se lê sem contexto profissional.

**Decisão.**

- `avaliacao_fisica_resumo_json` ganha `composicao: { atual, anterior }`
  (números crus: `data`, `peso`, `massa_magra`, `massa_gorda`,
  `percentual_gordura`, `metodo`, `metodo_rotulo`), gravado na geração por
  `montarResumoParaAluno` junto da tabela. Sem as duas massas, `null`.
- A `anterior` só entra com o **mesmo método** da % de gordura, a mesma regra
  de comparabilidade da tabela. Com método diferente, o gráfico mostra só a
  atual: comparar métodos diferentes sugeriria uma variação que não existe.
- **Formato: rosca da avaliação atual** (massa magra × massa gorda, com peso e
  % de gordura no centro, fatias rotuladas em kg e %), o formato dos laudos que
  o aluno já conhece. A comparação com a anterior **não** vira uma segunda
  rosca: ângulo se compara mal (−3,4 p.p. de gordura viram ~12° de arco) e a
  rosca não mostra o tamanho absoluto. Ela aparece em texto ao lado
  ("Desde DD/MM/AAAA: Gordura −3,2 kg · Massa magra +0,9 kg"), colorido pela
  direção favorável (gordura caindo / massa magra subindo = verde; o contrário
  = âmbar).
- Com o gráfico incluído, **massa magra e massa gorda saem da tabela** (o
  gráfico já mostra as duas, com a variação); desmarcar o gráfico as devolve.
  Regra única em `linhasDaTabela` (`utils/avaliacaoMensalCompartilhada.js`),
  usada no PDF e no detalhe do Acompanhamento no `/admin`.
- No PDF, o gráfico vai na seção "Sua avaliação física", entre a tabela e o parágrafo, com a
  chave nova `avaliacao_fisica:grafico` em `itens_excluidos`, marcado por
  padrão. Passa pela lista branca: só os números do gráfico vão ao documento.
- O componente (`components/avaliacaoFisica/GraficoComposicao.vue`) é
  SVG/CSS puro, sem ECharts, e é o mesmo do retrato do personal: sai igual no
  "salvar como PDF" e não carrega o chunk `vendor-echarts` na rota de
  compartilhar.
- **Fica fora do PDF:** as réguas de referência (IMC, % de gordura, cintura,
  RCQ, PA, FC) e os perímetros. A ADR-0031 continua valendo: um aluno vendo o
  próprio ponto numa faixa "de risco" num documento entregue sem conversa é
  leitura de diagnóstico. Na tela do personal, que explica junto, as réguas
  aparecem.

**Alternativas consideradas.**

- *Montar o gráfico no cliente a partir da avaliação ao vivo.* Rejeitada pelo
  mesmo motivo da tabela: o PDF precisa mostrar os números que a IA leu.
- *Levar o retrato inteiro ao PDF.* Rejeitada: réguas de referência e
  perímetros pedem contexto profissional (ver acima).
- *Gráfico com ECharts em modo SVG.* Rejeitada: é uma rosca de duas fatias, e
  carregar o ECharts na rota do PDF só para isso não compensa.
- *Barra empilhada com a anterior embaixo* (a 1ª versão deste adendo).
  Trocada pela rosca: com uma avaliação só, que é o caso que motivou o retrato,
  a barra comunica menos que o formato de laudo; a vantagem da barra na
  comparação foi mantida passando a variação para o texto.
- *Massa óssea / muscular / residual (modelo de 4 componentes, De Rose/Würch).*
  Fora: a massa óssea exige diâmetros ósseos que o catálogo não tem, a residual
  é uma constante por sexo e a muscular sai por subtração — números com cara
  de precisos em cima de estimativas, num aluno avaliado por dobras.

**Consequências.**

- Sem migration (a coluna JSONB já existe). Acompanhamentos gerados antes do
  adendo não têm `composicao`: o PDF deles sai sem o gráfico até **Regerar**.
- O detalhe do Acompanhamento no `/admin` mostra o gráfico junto da tabela
  ("como o aluno vê no PDF").
