# ADR-0027: Apelidos de exercício e catálogo global revisado

**Status:** Aceita e implementada (2026-10-31)

## Contexto

O catálogo global da ADR-0013 nasceu com nomes descritivos ("Remada unilateral
com halter", "Barra fixa pronada (pull-up)", "Tríceps pulley (corda)"). O
personal parceiro avaliou que não são os nomes usados na academia — lá é
"Serrote", "Barra fixa", "Tríceps corda". Havia também erros de conteúdo
("Escalador com corda (battle rope)" juntava dois exercícios; "Cadeira flexora
em pé" se contradiz e faltava a cadeira flexora de verdade; tríceps pulley e
corda, afundo e passada eram um exercício só) e faltavam máquinas comuns.

Além disso, um nome só não basta: cada academia chama o mesmo exercício de
jeitos diferentes ("voador" / "peck deck", "puxada" / "pulley"). Isso pesa em
dois lugares: o editor da ficha (um `<select>` com o catálogo inteiro, sem
busca) e a futura **ficha por voz**, em que a IA precisa casar o que o personal
falou com um exercício do catálogo.

## Decisão

### Apelidos — tabela `exercicio_apelido`

`id`, `exercicio_id`, `equipe_id` (anulável), `apelido`, `apelido_normalizado`
(minúsculas, sem acento, espaços colapsados — `shared/utils/texto.js`).

- `equipe_id` NULL = **nome alternativo do catálogo global**, vindo do seed;
  nenhuma equipe edita nem remove.
- `equipe_id` preenchido = **apelido daquela equipe**, em exercício global ou
  próprio. Qualquer membro cria/remove (sem controle por papel — ADR-0011). O
  exercício global continua intacto; outra equipe não vê o apelido.
- **Um nome ou apelido aponta para um exercício só, no que a equipe enxerga.**
  O service recusa (409, dizendo de qual exercício já é) um apelido igual ao
  nome ou a um apelido de outro exercício visível. Índices parciais garantem o
  mesmo na corrida: `(exercicio_id, apelido_normalizado)` para os globais e
  `(equipe_id, apelido_normalizado)` para os da equipe.
- API: `POST /api/v1/exercicios/:id/apelidos` e
  `DELETE /api/v1/exercicios/:id/apelidos/:apelidoId`; a listagem
  `GET /api/v1/exercicios` passa a trazer `apelidos` (globais + da equipe).

### Onde aparecem

- **Listagem de exercícios**: chips sob o nome (globais em cinza; da equipe em
  destaque, com "×") e "+ apelido" direto na linha, sem modal. A busca procura
  também nos apelidos e ignora acento.
- **Editor da ficha**: o `<select>` virou um campo de busca
  (`components/BuscaExercicio.vue` + `utils/buscaExercicio.js`) por nome e
  apelido, mostrando qual apelido respondeu.
- **Ficha por voz** (próxima ADR): os apelidos entram no prompt da
  interpretação, e a revisão oferece "salvar como apelido" quando o personal
  corrige um exercício não reconhecido.
- O aluno (link da ficha, ADR-0014) continua vendo o **nome** do exercício.

### Catálogo global revisado

Seeder `20261031120100-seed-exercicios-globais-v2.js`, dados em
`database/dados/exercicios-globais-v2.js`:

- os **87 originais mantêm o id** (imagens e fichas continuam valendo) — são
  renomeados para o nome de academia e ganham ~290 apelidos no total;
- **25 novos** (máquinas, tríceps pulley com barra, passada, cadeira flexora,
  glúteo 4 apoios, etc.), com id a partir de um código fixo. Imagens pelo
  seeder `20261031120200-seed-exercicios-globais-v2-imagens.js`: 20 do
  free-exercise-db (mesma fonte dos originais, conferidas uma a uma, sem
  repetir imagem já usada) e 5 geradas com IA (ChatGPT) a partir de fotos de
  referência do catálogo, conferidas par a par (mesma pessoa/cenário/ângulo,
  execução correta) — puxada articulada, leg press horizontal, glúteo máquina,
  elevação lateral na polia e polichinelo, que não têm equivalente bom lá. Todas
  em 850×567 JPG, como as originais;
- um exercício global que o personal já tinha corrigido pela tela (exceção
  temporária de edição de globais no `exercicio.service`) **não é renomeado** —
  o seeder só troca o nome que ainda está igual ao original.

Teste sem banco (`exercicios-globais-v2.test.js`) garante que os 87 estão todos
cobertos e que nenhum nome/apelido do catálogo é ambíguo. O conteúdo é ponto de
partida: o personal ajusta pela própria tela, com apelidos da equipe.

### Servidor

Nada muda no procedimento: `scripts/deploy.sh` já roda `db:migrate` (cria
`exercicio_apelido`) e depois `db:seed` (o catálogo revisado e as imagens dos
novos rodam uma vez, registrados em `sequelize_data`; as imagens vão dos assets
da imagem Docker para o volume `exercicio_imagem_data`, sem acesso à rede).

## Alternativas consideradas

- **Só renomear os globais.** Não resolve o vocabulário de cada academia, nem
  a voz.
- **Coluna `apelidos` (array/JSON) em `exercicio`.** Não separa o que é global
  do que é da equipe (equipe não pode editar linha global) e não permite índice
  de unicidade por equipe.
- **Recriar o catálogo com ids novos e apagar as fichas.** As fichas podiam ser
  refeitas (ambiente de desenvolvimento), mas manter os ids preserva imagens e
  fichas sem custo extra.
- **Permitir o mesmo apelido em dois exercícios** e deixar a busca mostrar os
  dois. Bom para a busca, ruim para a voz: "puxada" precisa ter um dono.
- **Nome preferido por equipe** (o aluno veria o nome da academia). Adiado — o
  apelido serve para encontrar; o nome continua o que se exibe.

## Consequências

- Tabela nova `exercicio_apelido`; `exercicio` não muda de formato.
- Catálogo global passa de 87 para 112 exercícios.
- Exercício próprio criado com o mesmo nome de um apelido existente não é
  bloqueado (só apelido novo é conferido) — a ambiguidade nesse caso aparece na
  busca com os dois resultados.
