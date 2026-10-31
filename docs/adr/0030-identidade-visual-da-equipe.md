# ADR-0030: Identidade visual da equipe (logo no que chega ao aluno)

**Status:** Aceita e implementada (2026-10-31).

> Estende a ADR-0011 (Equipe/Membro), a ADR-0014 (link da ficha por token) e a
> ADR-0023 (PDF do Acompanhamento Mensal). Não cria tema/cores por equipe, não
> mexe no `/admin` além da tela de Equipe e não toca `resultado_ia`,
> `validacao` nem dado do aluno.

## Contexto

Só duas coisas chegam ao aluno: o PDF do Acompanhamento Mensal e o link da
ficha de treino. As duas mostravam o produto e não quem atende o aluno. Muitas
equipes de personal têm marca própria (logo), e o aluno deveria reconhecer o
material como sendo do personal dele.

## Decisão

1. **`equipe.logo_caminho`** (`STRING(255)`, nullable): guarda o nome do arquivo
   em `storage/fotos`, pelo mesmo `storage-foto.service` do avatar de aluno e
   de usuário (chave `equipe-<id>`, nunca o nome enviado pelo cliente).
   Formatos aceitos: PNG, JPEG e WebP, até 2 MB. **SVG fica de fora** porque
   pode carregar script e é servido por uma rota pública. Trocar de formato
   apaga o arquivo anterior.
2. **API autenticada** (`/api/v1/equipe`):
   - `GET /identidade` → `{ nome, temLogo }` e `GET /logo` (imagem):
     **qualquer membro** pode ler, porque o PDF é aberto por quem estiver
     logado;
   - `POST /logo` (multipart, campo `logo`) e `DELETE /logo`: **só o owner**,
     como o resto da edição da equipe.
3. **Link público** (ADR-0014): `GET /api/v1/ficha-publica/:token` passa a
   devolver `equipe: { nome, temLogo }`, sem id. O logo é servido em
   `GET /api/v1/ficha-publica/:token/logo`. A equipe é resolvida pelo token,
   nunca pela URL, e as regras de utilização do link continuam valendo
   (expirado/revogado → 410). O token passa a dar acesso também ao nome e ao
   logo da equipe, que são públicos por natureza.
4. **Onde aparece**: no topo do documento do PDF (à direita do nome do aluno,
   também na impressão) e no cabeçalho do link da ficha. Sem logo, aparece
   só o nome da equipe.
5. **Envio do logo** (tela Equipe, owner): colar (Ctrl+V em qualquer lugar da
   tela, fora de campos de texto), arrastar para o quadro ou escolher arquivo.
   O navegador reduz para no máximo 512 px no maior lado e converte para PNG,
   o que preserva a transparência (`utils/logoEquipe.js`). Nada é salvo
   direto: a imagem fica em pré-visualização até o personal clicar em "Salvar".

## Alternativas consideradas

- **Tema completo (cores da equipe)**: ficou para depois. O logo resolve a
  maior parte da sensação de identidade sem abrir um sistema de temas.
- **Logo no `/admin` (sidebar)**: a equipe vê o próprio painel e não precisa
  ser lembrada da marca. A prioridade é o que o aluno vê.
- **Aceitar SVG sanitizado**: exigiria uma biblioteca de sanitização só para
  isso. PNG com fundo transparente atende.
- **Servir o logo como estático público**: quebraria o critério da ADR-0010
  (arquivos fora do estático, sempre atrás de checagem). O link público já tem
  um mecanismo de escopo pelo token.

## Consequências

- A migration `20261031150000-alter-equipe-add-logo` precisa rodar antes do
  deploy. O arquivo do logo vive no mesmo volume das fotos e entra no mesmo
  backup.
- O PDF continua gerado no cliente, sem endpoint público novo. O logo entra
  como uma imagem comum do documento.
- Um logo trocado aparece no próximo carregamento do link. A rota pública
  manda `Cache-Control: private, max-age=300`.

## Adendo (2026-10-31): logo no ícone da sidebar do `/admin`

O logo, quando existe, substitui só o ícone do topo da sidebar (64px, cantos
arredondados, sem placa nem borda). O texto "Personal Assistant / Painel de
gestão" continua igual, e os avatares do rodapé e da topbar continuam sendo
do usuário. O estado fica em `stores/equipe.store.js`: o `AdminShell` carrega
o logo e a tela Equipe atualiza o store quando o logo é trocado. Uma versão
anterior, com placa branca e layout por formato do logo, foi descartada por
ficar ruim visualmente.

**Movido para o rodapé no mesmo dia (2026-10-31).** O topo da sidebar ganhou
o ☰ que recolhe o menu no desktop e voltou ao ícone original 🏋️. O usuário
(avatar, nome, Sair) foi para a topbar, e o rodapé da sidebar passou a ser só
a identidade da equipe: logo (44px; sem logo, as iniciais da equipe) + nome.
Com o menu recolhido, fica só o logo. O `stores/equipe.store.js` continua
fazendo a troca na tela Equipe aparecer na hora.
