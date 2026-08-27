# ADR-0014: Acesso do aluno à Ficha de Treino por link temporário

**Status:** Aceita (2026-08-27)

## Contexto

A ADR-0013 criou a Ficha de Treino (prescrição montada manualmente pelo
personal) e listou explicitamente **"acesso do aluno"** como fora de escopo,
"decisão futura separada", porque envolve "um ator novo no sistema — hoje só
`usuario` (personal) tem login". Esta ADR é essa decisão — mas **parcial**:
abre só a consulta da Ficha de Treino ativa, somente leitura, por um link
temporário, sem introduzir autenticação, credencial ou perfil para o aluno.

O caso de uso concreto: o personal termina de montar a ficha e quer mandar
para o aluno pelo WhatsApp um endereço que o aluno abre no celular e vê o
treino — sem instalar nada, sem criar conta, sem senha. O personal precisa
poder revogar esse acesso e trocar o link quando quiser.

O CLAUDE.md lista "acesso do aluno" implicitamente sob "sistema completo de
treinos" / itens fora de escopo do MVP; a ADR-0013 já o nomeia diretamente
como pendência. Esta ADR o tira de "fora de escopo" **apenas** na forma
descrita abaixo (consulta da ficha ativa por link) — histórico de Registros,
avaliações físicas e qualquer forma de login do aluno continuam fora.

## Decisão

### O aluno não é um ator autenticado

Nenhuma tabela `aluno_usuario`, nenhuma senha, nenhum token de sessão,
nenhum perfil. O aluno **não faz login**. O único mecanismo de acesso é a
posse de um link secreto (capability URL): quem tem o link vê a ficha, quem
não tem, não vê. Isso mantém o modelo de identidade do sistema com um só
ator com credencial (`usuario` = personal, ADR-0011) — o fluxo de login do
personal não é tocado.

### O link aponta para o aluno, não para uma versão da ficha

O token resolve para um `aluno_id` no servidor e a consulta pública sempre
devolve a **ficha ativa** daquele aluno naquele momento (`ficha_treino.ativo
= true`, ADR-0013). Consequência desejada: quando o personal cria uma nova
versão da ficha (ADR-0013 — nova linha, a anterior vira `ativo = false`), o
aluno passa a ver a nova automaticamente, com o mesmo link. Não há
"congelamento" de uma versão específica no link.

Se o aluno não tem ficha ativa, o link é válido mas a tela informa que o
personal ainda não publicou uma ficha.

### Nova entidade: `ficha_acesso_link`

| campo | tipo | observação |
|---|---|---|
| `id` | UUID | pk, gerado na aplicação |
| `aluno_id` | UUID | FK `aluno`, `ON DELETE CASCADE` |
| `equipe_id` | UUID | FK `equipe`, `ON DELETE CASCADE` — chave de escopo/autorização direta na linha, mesmo motivo de `ficha_treino.equipe_id` (ADR-0011/0013) |
| `token` | `STRING(64)` | **único**; o segredo em si (ver "Formato e armazenamento do token") |
| `expira_em` | `DATE` | not null — padrão: `criado_em + 7 dias` |
| `revogado_em` | `DATE` | nullable — preenchido ao revogar ou ao gerar um link novo |
| `criado_por` | UUID | FK `usuario` — qual personal gerou (auditoria) |
| `created_at` / `updated_at` | `DATE` | convenção do projeto |

Índices: único em `token`; parcial único em `aluno_id WHERE revogado_em IS
NULL` — garante no banco **no máximo um link não-revogado por aluno**.

Um link é **utilizável** quando `revogado_em IS NULL AND expira_em > NOW()`.
Linhas expiradas ou revogadas nunca são apagadas — permanecem para que a
tela pública consiga responder "este link não vale mais" em vez de "não
existe", e como trilha de auditoria.

### Formato e armazenamento do token

- Gerado com `crypto.randomBytes(32)` (256 bits de entropia) codificado em
  `base64url` — 43 caracteres, seguro em segmento de URL, sem depender de
  `Math.random` nem de UUID (que não é feito para ser imprevisível).
- **Guardado como está na coluna `token`** (não um hash). Motivo: é uma
  capability URL — o segredo *é* a URL, e o personal precisa poder **copiar
  o link de novo** depois (reenviar ao aluno que perdeu a mensagem) sem ser
  forçado a gerar um novo a cada vez. As defesas do esquema não dependem de
  o token estar hasheado: entropia de 256 bits (brute force inviável),
  expiração curta (7 dias), revogação explícita, no máximo um link ativo por
  aluno, lookup só por token completo (sem `aluno_id` na URL, sem match
  parcial, sem enumeração), e resposta pública restrita a uma projeção de
  leitura. O token nunca é escrito em log.
- Alternativa considerada (hash-only) rejeitada abaixo.

### Geração, revogação e "gerar novo invalida o anterior"

Endpoints do personal (autenticados, escopados por `equipe_id` — qualquer
membro da equipe do aluno pode operar; sem controle por papel, coerente com
ADR-0011):

- `POST /api/v1/alunos/:id/ficha-link` — numa transação: marca
  `revogado_em = NOW()` no link não-revogado atual do aluno (se houver) e
  insere um novo com `expira_em = NOW() + 7 dias` (ou `diasValidade` do
  corpo, se enviado — limitado a um teto pequeno). Retorna token, `expira_em`
  e metadados. **Gerar um novo link invalida o anterior** — é o mesmo passo.
- `GET /api/v1/alunos/:id/ficha-link` — devolve o link ativo atual (com o
  token, para o personal recopiar) e seu status, ou `null`.
- `DELETE /api/v1/alunos/:id/ficha-link` — marca `revogado_em = NOW()` no
  link ativo do aluno.

Todos resolvem o aluno por `findByIdAndEquipe(alunoId, equipeId)` (mesmo
padrão de `fichaTreino.service`) — um personal de outra equipe recebe 404,
nunca consegue gerar/ler/revogar link de aluno que não é da sua equipe.

### Endpoint público (sem autenticação)

Montado em `/api/v1/ficha-publica`, **sem** o middleware `autenticar`:

- `GET /api/v1/ficha-publica/:token` — valida o token; se utilizável,
  devolve a projeção de leitura (abaixo); se revogado/expirado, `410` com
  código (`LINK_REVOGADO` / `LINK_EXPIRADO`); se desconhecido, `404`
  (`LINK_INVALIDO`). O corpo do erro carrega uma mensagem amigável para a
  tela mostrar "peça um novo link ao seu personal".
- `GET /api/v1/ficha-publica/:token/exercicios/:exercicioId/imagem/:posicao`
  — stream da imagem do exercício (as imagens não são estáticas públicas,
  ADR-0010/0013). Só serve a imagem se `exercicioId` **pertence a um item da
  ficha ativa daquele token** — não é um proxy aberto para qualquer
  `exercicio.id`.

Nenhuma rota pública aceita `aluno_id`, `ficha_id` ou `equipe_id` como
parâmetro. O único identificador que o cliente manda é o token; tudo o mais
é resolvido no servidor a partir dele. Não é possível trocar um id na URL
para ver outro aluno porque não há id na URL.

### Projeção de leitura (o que o aluno vê)

Lista branca explícita, montada no service — o aluno vê **só o destinado à
consulta**, nunca o objeto do banco cru:

```text
aluno:  { nome }
ficha:  { nome, observacoes, atualizadaEm,
          itens: [ { ordem, series, repeticoes, cargaObs,
                     exercicio: { id, nome, grupoMuscular, equipamento,
                                  instrucoes, temImagemInicio, temImagemFim,
                                  videoUrl } } ] }
```

Ficam **de fora**: qualquer UUID além do `exercicio.id` (necessário só para
buscar a imagem via endpoint escopado por token), `criado_por` / nome do
personal, `equipe_id`, ids de `ficha_treino` / `ficha_treino_exercicio`,
timestamps internos, o catálogo de exercícios, e o histórico de fichas
anteriores. `observacoes` da ficha é considerada texto voltado ao aluno
(ex.: "treino 3x/semana, foco em inferiores"); se no futuro houver
necessidade de nota interna do personal, isso vira um campo separado, não
exposto — decisão futura, não desta ADR.

### Somente leitura

Nenhuma rota pública escreve nada (exceto, no máximo, um contador de
último acesso — não incluído neste MVP). O aluno não comenta, não confirma,
não marca treino como feito. Escrita a partir do link é fora de escopo
até decisão nova.

### Fora de escopo desta ADR

- Login / conta / app do aluno.
- Histórico de Registros (fluxo de captura + IA, ADR-0002/0006) pelo link.
- Avaliações físicas pelo link (continua fora, ADR-0008/0013).
- Histórico de fichas anteriores pelo link (só a ativa).
- Notificar o aluno (WhatsApp/e-mail/push) — o personal copia e manda o
  link pelo canal que quiser (WhatsApp segue fora de escopo, CLAUDE.md).
- Rate limiting / captcha no endpoint público — a entropia de 256 bits do
  token torna brute force inviável; pode ser revisto se houver abuso real.
- Registro de acessos ("aluno abriu a ficha às 14h") — decisão futura.

## Alternativas consideradas

- **Guardar só o hash do token (SHA-256), mostrar o link uma única vez.**
  Mais robusto se o banco vazar, mas obriga o personal a gerar um link novo
  toda vez que precisar recopiar (não dá para exibir de novo o que não se
  guardou). Rejeitada pelo custo de UX num fluxo cujo objetivo é justamente
  "mandar/remandar o link pro aluno"; as outras defesas (entropia,
  expiração, revogação, um ativo por vez, sem enumeração) já sustentam o
  esquema. Reversível: passar a hashear é uma migração + troca do lookup,
  sem mudança de contrato externo.
- **Link com validade longa / sem expiração, só revogável.** Rejeitada — o
  pedido pede prazo de validade com 7 dias como padrão; expiração
  automática limita o dano de um link vazado que o personal esqueceu de
  revogar.
- **Token embutindo o `aluno_id` (JWT público, ou `aluno_id.assinatura`
  na URL).** Rejeitada — expõe o id do aluno na URL (o pedido pede
  explicitamente "sem expor o ID do aluno") e agranda a superfície de
  ataque (manipular o payload). Um token opaco resolvido por lookup não
  revela nada.
- **Congelar o link numa versão específica da ficha (`ficha_treino_id` no
  link).** Rejeitada — o aluno deve ver sempre o treino atual; congelar
  obrigaria o personal a gerar um link novo a cada ajuste da ficha.
- **Servir a página do aluno como HTML separado do PWA / outro domínio.**
  Rejeitada por ora — uma rota pública (`/ficha/:token`) no mesmo app Vue
  (ADR-0003) reaproveita build, componentes (ex.: visualização de imagem do
  exercício) e deploy; o custo é o Service Worker do PWA registrar também
  no dispositivo do aluno (consequência menor, abaixo).
- **Reusar o padrão `resultado_ia` / `validacao` (ADR-0007).** Não se
  aplica — não há proposta de IA nem persistência oficial nova aqui; é só
  leitura de uma projeção de `ficha_treino`, que já é dado oficial (a
  própria ADR-0013 dispensa esse padrão para a Ficha de Treino).

## Consequências

- Uma tabela nova (`ficha_acesso_link`) + migration; nenhuma tabela
  existente muda de formato. `aluno` ganha `hasMany` para os links (cascade
  no delete do aluno já cobre a limpeza).
- Backend ganha um conjunto de rotas **públicas** (`/api/v1/ficha-publica/*`)
  — a primeira superfície sem `autenticar` além de `/health` e do login. O
  isolamento passa a depender da qualidade do token e da projeção de
  leitura, cobertos por testes (geração, acesso, expiração, revogação,
  isolamento entre alunos e entre equipes).
- Frontend ganha uma rota pública `/ficha/:token` (`meta.publica`), fora de
  `/admin`, com layout próprio (sem `AdminShell`), somente leitura,
  mobile-first. O componente de imagem do exercício passa a aceitar um
  carregador de imagem injetável para funcionar tanto no modo autenticado
  quanto pelo endpoint escopado por token.
- A tela de Ficha de Treino do personal (ADR-0013) ganha uma seção "Link
  para o aluno": gerar, copiar, ver validade, revogar, gerar novo (avisando
  que invalida o anterior).
- O Service Worker do PWA (`scope: '/'`, ADR-0003) registra também quando um
  aluno abre `/ficha/:token` — pode aparecer convite de instalação do
  "Personal Assistant" no celular do aluno. Aceito como efeito menor no
  MVP; se incomodar, restringe-se o `scope`/registro depois.
- O CLAUDE.md deixa de listar "acesso do aluno" como totalmente fora de
  escopo — passa a listar só o que continua fora (login do aluno, histórico
  de Registros e avaliações pelo link). Essa atualização de texto é
  consequência esperada, feita fora do commit que introduz a ADR (mesmo
  critério da ADR-0013).
- Nenhuma mudança em `Registro`, pipeline de IA (ADR-0006), confirmação
  (ADR-0007) ou no login do personal.

## Índice de ADRs (atualizar no CLAUDE.md)

| # | Título |
|---|---|
| 0014 | Acesso do aluno à Ficha de Treino por link temporário |
