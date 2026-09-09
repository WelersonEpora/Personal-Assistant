# ADR-0023: Compartilhar a avaliação mensal com o aluno (PDF com revisão do personal)

**Status:** Aceita (2026-09-09)

> Não altera a ADR-0007 (só `validacao` é dado oficial) nem a ADR-0015 (a
> avaliação mensal continua "camada interpretativa derivada, sempre
> regenerável, nunca verdade"). Introduz um **portão de revisão humana** entre
> a avaliação da IA e o aluno, e uma saída em **PDF gerado no cliente** — sem
> endpoint público novo.

## Contexto

A avaliação mensal (ADR-0015) é detalhada e útil (evolução por dimensão,
destaques, recomendações) e o personal quer poder mandá-la para o aluno,
parecido com o link da ficha de treino (ADR-0014).

Dois problemas com repetir o link da ficha aqui:

1. **A ficha é 100% escrita pelo personal e já é dado oficial.** A avaliação
   mensal é o oposto: saída pura de IA, sem nenhuma revisão humana, que pode
   ter alucinação. Entregá-la crua ao aluno faz, na prática, "erro da IA virar
   fato" na cabeça de quem mais importa — exatamente a linha que a ADR-0007 e o
   CLAUDE.md desenham.
2. **Sensibilidade.** A avaliação fala de composição corporal, dores/limitações,
   adesão e comportamento do aluno, além de hipóteses ainda não confirmadas.
   Uma _capability URL_ vaza com facilidade (encaminhamento, preview de link em
   apps de mensagem, dispositivo compartilhado) e não tem como ser "esquecida"
   depois de aberta. Para uma ficha de treino o risco é baixo; aqui não.

Durante o desenho da ADR-0015 já se havia previsto o caso "a IA faz a avaliação
e o personal não concorda": a saída era o personal registrar uma **avaliação
manual** (`avaliacao_personal`, "Escrever avaliação") que entra no próximo ciclo.
Esta ADR estende esse mesmo mecanismo para o momento do compartilhamento.

## Decisão

### PDF gerado no cliente, não link público

Quando o personal decide enviar uma avaliação mensal, ele gera um **PDF pelo
"salvar como PDF" do próprio navegador**, a partir de uma tela de preparação
(`/compartilhar/avaliacao-mensal/:id/:anoMes`, autenticada). O personal
distribui o arquivo pelo canal que quiser (WhatsApp segue fora de escopo,
CLAUDE.md).

- **Sem dependência nova.** A tela de preparação é o próprio _preview_ do
  documento; `@media print` esconde os controles e imprime só o documento.
  (Alternativa `pdfmake`/`jsPDF` considerada e rejeitada por ora — ver abaixo.)
- **Sem superfície pública nova** no backend (a primeira além de `/health`,
  login e `/ficha-publica` continua sendo só a ficha).
- **Sem armazenar o arquivo** no servidor. O que persiste é a revisão do
  personal (abaixo), não o PDF.

Contrapartida aceita: **PDF não tem revogação**. Uma vez enviado, está no
dispositivo do aluno. É a mesma situação de um link já aberto/printado; o que
o PDF elimina é o endpoint público e o encaminhamento a terceiros.

### O portão: `revisao_avaliacao_mensal` (1:1 com a avaliação do mês)

Nenhuma avaliação mensal chega ao aluno sem uma **revisão do personal**. A
revisão fica entre a `avaliacao_mensal` (IA) e o aluno, no mesmo lugar
estrutural que a `validacao` ocupa entre `resultado_ia` e o dado oficial — mas
**não torna a avaliação oficial**: continua "nunca verdade" (ADR-0015), a
revisão só habilita o **compartilhamento externo**.

| campo | tipo | observação |
|---|---|---|
| `id` | UUID | pk, gerado na aplicação |
| `avaliacao_mensal_id` | UUID | FK `avaliacao_mensal`, `ON DELETE CASCADE`, **único** (1:1) |
| `aluno_id` | UUID | FK `aluno`, `ON DELETE CASCADE` — escopo/consulta |
| `equipe_id` | UUID | FK `equipe`, `ON DELETE CASCADE` — chave de autorização na linha (mesmo padrão da ADR-0011) |
| `autor_id` | UUID | FK `usuario` — quem preparou/compartilhou |
| `comentario` | `TEXT` | **obrigatório**. Um único campo (ver abaixo). Vai no PDF **e** no próximo ciclo de IA. |
| `itens_excluidos` | `JSONB` | chaves dos itens da avaliação que o personal tirou do PDF. Default `[]`. **Só afeta o PDF** — não muda o que a IA vê. |
| `avaliacao_gerada_em` | `DATE` | cópia de `avaliacao_mensal.gerada_em` no momento da revisão — usada para detectar "avaliação regerada depois da revisão". |
| `compartilhada_em` | `DATE` | atualizada a cada vez que o personal salva/gera o PDF. |
| `created_at` / `updated_at` | `DATE` | convenção do projeto |

- **A revisão só existe depois que o personal a salva** (o ato de preparar o
  PDF). Enquanto ele não faz nada, a avaliação mensal segue só como leitura
  interna — e o canal para "não concordo, mas não vou enviar" continua sendo o
  "Escrever avaliação" (`avaliacao_personal`), inalterado.
- **Upsert 1:1.** Reenviar = reabrir a mesma tela, editar, regerar; a linha é
  sobrescrita, `compartilhada_em` avança.
- **Só sobre avaliação `status = gerada`.** `dados_insuficientes` e `falha` não
  têm o que compartilhar — o endpoint recusa.

### Um único campo de comentário

O `comentario` é texto livre do personal, voltado ao aluno, e aparece no PDF
no bloco "Comentário do seu personal". O mesmo texto entra no **próximo ciclo
mensal** como insumo de **peso alto** (origem `revisao_mensal:<id>`), igual à
avaliação avulsa do personal (ADR-0015): pode contradizer e **prevalecer**
sobre o contexto consolidado e sobre o que os relatos sugerem. No prompt ele é
apresentado como "comentário que o personal escreveu **ao aluno** sobre a
avaliação do mês anterior" — a IA entende o tom, mas trata como leitura do
profissional.

Ficou de fora um segundo campo ("ajustes só para a IA, fora do PDF"): v1
simples. Se o personal quer dizer algo à IA que não vai ao aluno, o canal é o
"Escrever avaliação".

### O que o PDF mostra (lista branca)

Montada no cliente a partir de `avaliacao_json`, **fail-safe** — só o que é
adequado ao aluno, nunca o objeto cru:

```text
cabeçalho:      nome do aluno, mês de referência, "Avaliação de acompanhamento"
resumo:         resumo_geral
por dimensão:   nome, situacao_atual, evolucao_no_mes   (SEM evidências, origem, confiança)
destaques:      lista
recomendações:  lista
comentário do personal:  o campo `comentario`
rodapé:         "Elaborado com apoio de inteligência artificial e revisado por
                {personal} · {data}"
```

Ficam **sempre de fora** do PDF: `alertas`, `pendencias_confirmacao`,
`mudancas_vs_mes_anterior`, o contexto consolidado, e qualquer
evidência/origem/confiança das dimensões. São material de trabalho da IA, mais
especulativo — se o personal quer comunicar algo dali, escreve no comentário.

Sobre o que **é** mostrado (dimensões, destaques, recomendações), o personal
pode **excluir itens individuais** (`itens_excluidos`) que julgar desnecessários
ou com que discorde. A exclusão é decisão de apresentação: não altera o que a
IA recebe no próximo ciclo.

### "Avaliação regerada depois da revisão"

Se a `avaliacao_mensal` for regerada (job ou manual) **depois** de o personal
ter revisado, `avaliacao_mensal.gerada_em` passa a ser maior que
`revisao.avaliacao_gerada_em`. Nesse caso a tela marca a revisão como
**desatualizada** e bloqueia a geração do PDF até o personal revisar de novo —
o PDF sempre reflete uma revisão do texto atual.

### Realimentação da IA (detalhe)

No `avaliacao-mensal.service`, ao montar o prompt de um mês, além do contexto
do mês anterior e dos relatos, carrega-se a **revisão da avaliação do mês
imediatamente anterior** (se existir) e adiciona-se um bloco ao prompt. A
revisão é 1:1 com aquela avaliação e é encontrada de forma determinística —
não há coluna de rastreio nova (diferente de `avaliacoes_personal_consideradas`,
que rastreia várias). Editar o comentário depois **não** reescreve ciclos
passados (os ciclos são snapshots, como na ADR-0015).

### API (tudo autenticado, escopado por `equipe_id`)

Aninhada na avaliação mensal, que já é aninhada no aluno:

- `GET  /api/v1/alunos/:id/avaliacoes-mensais/:anoMes/compartilhamento`
  → `{ revisao, desatualizada }` (ou `revisao: null`).
- `PUT  /api/v1/alunos/:id/avaliacoes-mensais/:anoMes/compartilhamento`
  → upsert; corpo `{ comentario, itens_excluidos }`. Recusa se a avaliação não
  existe ou não está `gerada`.
- `DELETE /api/v1/alunos/:id/avaliacoes-mensais/:anoMes/compartilhamento`
  → remove a revisão (o aluno "deixa de ter" a avaliação compartilhada; PDFs já
  distribuídos, claro, continuam existindo).

A listagem `GET .../avaliacoes-mensais` e o `GET .../avaliacoes-mensais/:anoMes`
passam a trazer um resumo da revisão (existe? `compartilhada_em`?
desatualizada?) para a tela de Acompanhamento sinalizar sem uma segunda
chamada.

### Frontend

- **Acompanhamento** (`AcompanhamentoAluno.vue`): na linha da avaliação mensal
  `gerada`, um botão "Compartilhar com o aluno (PDF)" que leva à tela de
  preparação; selo "Compartilhada em DD/MM" / "Revisão desatualizada" quando
  for o caso.
- **Tela de preparação** (`CompartilharAvaliacaoMensalView.vue`, rota
  top-level `/compartilhar/avaliacao-mensal/:id/:anoMes`, fora do `AdminShell`
  para o print sair limpo): painel de preparação (comentário + checklist de
  itens a incluir) só em tela; documento (o que vira PDF) em tela e no print.
  "Salvar" persiste a revisão; "Gerar PDF" salva e chama `window.print()`.
- **Util puro testável** `utils/avaliacaoMensalCompartilhada.js`
  (`listarItensExcluiveis`, `filtrarAvaliacaoParaAluno`, `chaveItem`) — mesmo
  padrão dos outros _builders_ do front.

## Alternativas consideradas

- **Link temporário como o da ficha (ADR-0014).** Rejeitada — a ficha é dado
  oficial escrito por humano; a avaliação mensal é saída de IA sem revisão, e
  é sensível. Capability URL vaza fácil e não se "esquece". O PDF tira o
  endpoint público e o encaminhamento a terceiros da jogada.
- **Compartilhar a avaliação da IA crua, sem revisão.** Rejeitada — "erro da
  IA vira fato" para o aluno; viola o espírito da ADR-0007 e a regra do
  CLAUDE.md contra dado de IA sem humano na frente.
- **Campo de comentário dentro de `avaliacao_mensal`.** Rejeitada — regenerar
  o mês **sobrescreve a linha** (ADR-0015); o comentário do personal seria
  destruído ou ficaria descolado de um texto de IA que mudou embaixo dele.
  Linha própria 1:1, com `avaliacao_gerada_em` de snapshot, resolve.
- **Caixa de texto solta na hora de imprimir (sem persistir).** Rejeitada —
  perde o texto, não alimenta o próximo ciclo, não deixa rastro de que houve
  revisão, não dá como detectar "regerada depois".
- **Reusar `avaliacao_personal` com um FK opcional para a avaliação mensal.**
  Rejeitada — `avaliacao_personal` é uma tabela pequena e limpa (texto +
  autor), bucketizada por `created_at`; pendurar nela FK 1:1 + `itens_excluidos`
  + metadados de compartilhamento + detecção de staleness a polui e cria
  ambiguidade de contagem no ciclo. Conceitos diferentes: uma é reflexão de
  meio de mês não amarrada a nada; a outra é resposta a uma avaliação
  específica para envio.
- **Dois campos (mensagem ao aluno / ajustes só para a IA).** Adiada — v1 com
  um campo. O caso "dizer à IA algo que não vai ao aluno" já tem canal
  ("Escrever avaliação").
- **Segundo endpoint público read-only (like `/ficha-publica`) servindo a
  avaliação revisada.** Rejeitada pelo mesmo motivo de sensibilidade + custo de
  manter mais uma superfície sem `autenticar`.
- **`pdfmake` / `jsPDF` no cliente.** Rejeitada por ora — o CLAUDE.md tem barra
  alta para dependência de UI nova (só ECharts). O documento é essencialmente
  texto; `@media print` + "salvar como PDF" do navegador dá conta. Fácil de
  trocar depois se a apresentação não satisfizer (fica isolado na tela de
  preparação).
- **Exclusão de item também esconder o item da IA no próximo ciclo.**
  Rejeitada — exclusão é decisão de apresentação ao aluno, não correção
  factual. Correção factual vai no comentário.

## Consequências

- Uma tabela nova (`revisao_avaliacao_mensal`) + migration; nenhuma tabela
  existente muda de formato. `avaliacao_mensal` ganha `hasOne` para a revisão
  (cascade no delete já cobre a limpeza; o cascade também vale quando um mês é
  regerado? não — `salvar` faz `update` da mesma linha, o `id` da
  `avaliacao_mensal` não muda, então a revisão sobrevive à regeneração e é a
  detecção de staleness que entra em ação).
- O `avaliacao-mensal.service` passa a carregar a revisão do mês anterior e a
  montar um 4º bloco no prompt; `gemini.service` ganha a instrução
  correspondente. Nenhuma mudança no schema de saída da IA.
- Frontend ganha uma rota top-level autenticada fora do `AdminShell`
  (`/compartilhar/...`) — a primeira nesse formato (as outras fora de `/admin`
  são `/captura` e a pública `/ficha/:token`).
- O PDF depende do "salvar como PDF" do navegador do personal (Chrome/Edge/
  Firefox/Safari desktop têm). Sem botão que "baixa" o arquivo — é o diálogo de
  impressão. Aceito para v1.
- Continua valendo: **nenhum job/worker/endpoint escreve em `validacao` a
  partir daqui**; a avaliação mensal nunca é dado oficial; um teste cobre que
  o fluxo de compartilhamento não cria `validacao`.
- CLAUDE.md: nova linha no índice de ADRs, nota no "Estado atual" e uma regra
  em "Regras importantes para futuras alterações" (a revisão habilita só o
  compartilhamento, nunca torna a avaliação oficial). Atualização de texto
  feita junto da implementação (mesmo critério das ADRs anteriores).

## Índice de ADRs (atualizar no CLAUDE.md)

| # | Título |
|---|---|
| 0023 | Compartilhar a avaliação mensal com o aluno (PDF com revisão do personal) |
