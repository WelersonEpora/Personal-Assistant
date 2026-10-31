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
