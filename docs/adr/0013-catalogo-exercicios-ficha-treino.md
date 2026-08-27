# ADR-0013: Catálogo de Exercícios e Ficha de Treino

**Status:** Aceita (2026-08-26)

## Contexto

O CLAUDE.md lista "sistema completo de treinos" e "avaliação física
completa" como fora de escopo do MVP, "não implementar sem decisão
explícita nova" (ADR-0008 reforça o mesmo ponto: nenhuma entidade de
treino/exercício até o sistema legado do personal trainer ser analisado).
Esta ADR é essa decisão explícita — mas **parcial**: cobre só o catálogo de
exercícios e a ficha de treino montada manualmente pelo personal. Avaliação
física e acesso do aluno continuam fora de escopo, tratados como decisões
futuras separadas (seções "Fora de escopo" abaixo).

Hoje o sistema só tem um fluxo de dado sobre o aluno: o **Registro**
(ADR-0002) — captura de áudio/texto sobre o que *aconteceu*, processada por
IA (ADR-0006), revisada e confirmada pelo personal antes de virar
`validacao` (ADR-0007). Não existe nenhum conceito de *prescrição* — o que
o aluno *deve* fazer. É essa lacuna que esta ADR fecha.

## Decisão

### Ficha de Treino não é um Registro

São conceitos diferentes e não devem ser confundidos, nem na nomenclatura
nem no modelo de dados:

| | Registro | Ficha de Treino |
|---|---|---|
| Representa | o que **aconteceu** (relato) | o que o aluno **deve fazer** (prescrição) |
| Origem do dado | fala/texto do personal, **interpretado por IA** | escolha direta do personal no catálogo, **sem IA** |
| Dado oficial nasce em | `validacao`, só após confirmação de uma proposta da IA (ADR-0007) | diretamente na própria Ficha de Treino — não há proposta a confirmar |
| Payload | JSON semiestruturado genérico (`label`/`valor`/`obs`) | estrutura relacional própria (ver abaixo) — motivo na seção "Preparação para IA futura" |

Como não há proposta de IA envolvida na criação da Ficha de Treino, **o
padrão de duas tabelas `resultado_ia`/`validacao` da ADR-0007 não se
aplica aqui** — aplicá-lo seria complexidade sem função. O personal escreve
o dado oficial diretamente.

### Catálogo de exercícios

Nova entidade `exercicio`:

- `id`, `nome`, `grupo_muscular`, `equipamento`, `dificuldade` (texto
  livre curto, ex.: iniciante/intermediário/avançado — sem tabela de
  lookup própria, mesma filosofia de campo simples já usada em
  `resultado_ia.status`), `instrucoes` (texto livre), `ativo`,
  `deletado_em` (soft-delete, mesmo padrão de `aluno`), `created_at`,
  `updated_at`.
- `equipe_id` **anulável**: `NULL` identifica um exercício do catálogo
  global do sistema (disponível para todas as equipes, alimentado por
  seed); preenchido identifica um exercício próprio, criado por aquela
  equipe. Isso evita que cada personal precise montar um catálogo do zero,
  sem impedir customização.
- Mídia: **imagem** é upload, reaproveitando o mesmo padrão de arquivo em
  disco/volume Docker já usado por `aluno.foto_caminho` e `arquivo_audio`
  (ADR-0010) — campo `midia_imagem_caminho`. **Vídeo** é um link externo
  (`midia_video_url`, ex.: YouTube/Vimeo), não upload — evita assumir
  processamento/armazenamento de arquivo de vídeo sem necessidade
  comprovada neste MVP (motivo detalhado em "Alternativas consideradas").

### Ficha de Treino e seus exercícios

Duas entidades novas:

- `ficha_treino`: `id`, `aluno_id`, `equipe_id` (mesma razão de
  `registro.equipe_id` na ADR-0011 — chave de escopo/autorização direta na
  linha, não só alcançável por join), `criado_por` (`usuario_id`, qual
  personal criou esta versão), `nome`/`observacoes` opcional, `ativo`
  (`boolean`), `created_at`, `updated_at`.
- `ficha_treino_exercicio`: `id`, `ficha_treino_id`, `exercicio_id`,
  `ordem`, `series`, `repeticoes`, `carga_obs` (texto livre — carga varia
  e depende de contexto, mesmo raciocínio de `aluno.observacoes` como
  campo livre em vez de estrutura rígida), `created_at`, `updated_at`.

**Histórico sem sistema de versionamento**: nenhuma "versão" numerada, sem
diff, sem log de alteração campo a campo. Cada atualização relevante da
ficha (troca de exercícios, séries, repetições) **cria uma nova linha em
`ficha_treino`** (com seus próprios `ficha_treino_exercicio`), e marca a
ficha anterior como `ativo = false`. A ficha antiga nunca é editada nem
apagada — permanece exatamente como estava, preservada como histórico
naturalmente, pela mesma lógica de imutabilidade já usada em
`resultado_ia`/`validacao`. Só uma ficha por aluno tem `ativo = true` a
qualquer momento; o histórico é a lista de fichas com `ativo = false`
ordenada por `created_at`.

### O personal cria e mantém a ficha — sem IA nesta fase

Toda escrita em `ficha_treino`/`ficha_treino_exercicio` parte de uma ação
explícita do personal, escolhendo exercícios do catálogo. **Nenhum
processo automático, job ou IA cria, sugere ou altera uma Ficha de
Treino nesta fase** — mesmo princípio de não-automação da ADR-0007, agora
aplicado a uma superfície de dado que nem depende de IA para existir.

### Onde a Ficha de Treino vive na interface

A Ficha de Treino faz parte da **área operacional do personal** (gestão do
dia a dia com alunos), não da administração do sistema — navegação
conceitual **Alunos → Aluno → Ficha de Treino**, junto de onde o personal
já gerencia o cadastro do aluno. `/admin`, no sentido usado por esta ADR,
fica reservado para administração do sistema em si (equipes, usuários,
configuração) — não para a gestão operacional de alunos/fichas. Esta ADR
não decide a estrutura de rotas do frontend (se isso implica reorganizar
as views hoje agrupadas sob `/admin`, ex. `views/admin/alunos`, em uma
área própria) — é uma decisão de implementação menor, guiada por este
princípio, não formalizada aqui.

### Preparação para IA sugerir treinos no futuro

Duas decisões de modelagem, tomadas agora, existem propositalmente para
não exigir retrabalho quando a IA passar a auxiliar o personal:

- `ficha_treino_exercicio` é **relacional** (`exercicio_id` + campos
  próprios), não um JSON genérico como em `Registro`. Uma IA que vier a
  gerar/sugerir uma ficha precisa produzir itens estruturados e
  previsíveis (referência a um `exercicio_id` real do catálogo); um
  catálogo com atributos bem definidos (`grupo_muscular`, `equipamento`,
  `dificuldade`) também facilita a IA escolher exercícios plausíveis em
  vez de inventar.
- Quando essa funcionalidade for decidida, o caminho esperado é reaplicar
  o mesmo esqueleto da ADR-0007: uma tabela de proposta (ex.
  `sugestao_treino_ia`, com seu próprio payload), nunca escrita direta em
  `ficha_treino`/`ficha_treino_exercicio`; o personal revisa e só a ação
  dele grava a ficha oficial. Esta ADR não cria essa tabela — só deixa
  registrado o padrão a seguir, para não reabrir essa discussão do zero.

### Fora de escopo (decisões futuras separadas)

- **Acesso do aluno** (consulta à ficha atual e ao histórico confirmado):
  continua fora deste MVP. Envolve autenticação de um ator novo no sistema
  — hoje só `usuario` (personal) tem login — com modelo de credencial e
  isolamento de dados próprios, distintos do multi-tenancy de
  equipe/membro da ADR-0011. Requer sua própria ADR quando for decidido.
- **IA sugerindo/montando treinos**: ver seção anterior — só o padrão de
  preparação fica registrado, a funcionalidade em si não é decidida agora.
- **Avaliação física estruturada**: continua fora, sem mudança em relação
  à ADR-0008.

## Alternativas consideradas

- **Reaproveitar o padrão `resultado_ia`/`validacao` (proposta vs.
  oficial) também para a Ficha de Treino.** Rejeitada — não há proposta de
  IA a revisar nesta fase; o personal já escreve o dado oficial
  diretamente, então duas tabelas para representar a mesma escrita seriam
  complexidade sem função (mesmo raciocínio da ADR-0007 contra misturar
  papéis, aplicado ao inverso: aqui não há dois papéis a separar).
- **Sistema de versionamento explícito para a Ficha de Treino** (número de
  versão, diff de alterações, log campo a campo). Rejeitada — o pedido foi
  claro em evitar complexidade sem necessidade comprovada; criar uma nova
  linha imutável a cada atualização relevante já preserva o histórico
  completo, com o mesmo mecanismo simples (`ativo` boolean) já usado em
  `aluno.ativo` e `resultado_ia.status`.
- **Sobrescrever a ficha em vez de preservar histórico.** Rejeitada
  explicitamente pelo pedido — perderia a rastreabilidade de "o que estava
  prescrito quando", útil tanto para o personal quanto, futuramente, para
  o aluno consultar o que já treinou.
- **Catálogo de exercícios só por equipe (sem catálogo global).**
  Rejeitada por ora — obrigaria cada personal a montar seu catálogo do
  zero; `equipe_id` anulável permite seed global e customização por
  equipe sem duas tabelas separadas. Reversível: se não fizer sentido na
  prática, restringir para "só por equipe" é só passar a exigir
  `equipe_id`, sem mudança estrutural.
- **Upload de arquivo de vídeo para o exercício** (mesmo padrão de
  imagem/áudio). Rejeitada por ora — vídeo tem custo de
  armazenamento/processamento maior sem necessidade comprovada ainda;
  link externo cobre o caso de uso ("mostrar como o exercício é feito")
  com custo mínimo. Pode virar upload local depois, se necessário.
- **Colocar a Ficha de Treino dentro de `/admin`** (ao lado de
  equipe/usuários/configuração), por já existir e ser o caminho de menor
  esforço. Rejeitada explicitamente pelo pedido — misturaria gestão
  operacional do dia a dia do personal com administração do sistema.

## Consequências

- Três tabelas novas (`exercicio`, `ficha_treino`,
  `ficha_treino_exercicio`) e migrations correspondentes; nenhuma tabela
  existente muda de formato.
- `ficha_treino_exercicio` referencia `exercicio_id` — excluir
  (soft-delete) um exercício do catálogo não pode quebrar fichas antigas
  que o referenciam; leitura de ficha histórica precisa continuar
  resolvendo exercícios com `deletado_em` preenchido.
- Necessário popular o catálogo global inicial (seed de exercícios comuns)
  para o catálogo não nascer vazio — equivalente ao seed de usuário de
  desenvolvimento já existente (`npm run db:seed`).
- Frontend ganha uma área nova na navegação operacional do personal
  (Alunos → Aluno → Ficha de Treino: listar/selecionar exercícios do
  catálogo, montar a ficha ativa, consultar fichas anteriores); `/admin`
  não ganha nenhuma tela nova por esta ADR.
- O CLAUDE.md deixa de listar "sistema completo de treinos" como
  totalmente fora de escopo — passa a listar especificamente "IA
  sugerindo/montando treinos" e "acesso do aluno" como o que ainda falta;
  catálogo de exercícios e Ficha de Treino manual deixam de estar fora de
  escopo. Esta atualização de texto é uma consequência esperada desta ADR,
  não feita no mesmo commit que a introduziu.
- Nenhuma mudança em `Registro`, pipeline de IA (ADR-0006), ou fluxo de
  confirmação (ADR-0007) — Ficha de Treino é um fluxo de dado
  inteiramente novo e paralelo, não uma extensão do fluxo de captura
  existente.
