# ADR-0010: Armazenamento de arquivos de áudio (disco local em volume Docker)

**Status:** Aceita (2026-08-25)

## Contexto

Cada entrada de áudio sincronizada precisa ser armazenada no servidor de
forma persistente (para o Gemini poder transcrevê-la, e para auditoria/
reprocessamento futuro), com proteção de acesso (seção 12 do pedido:
"proteção dos arquivos de áudio").

## Decisão

- Arquivos de áudio são gravados em **disco local**, num diretório dedicado
  (`backend/storage/audio/` em desenvolvimento; um **volume Docker
  nomeado** — `audio_data:/app/storage/audio` — em produção, para
  sobreviver a recriação do container).
- `arquivo_audio.caminho_armazenamento` guarda o caminho relativo dentro
  desse diretório (nunca a URL pública nem o caminho absoluto do host).
- **Nenhum acesso estático direto** — os arquivos não ficam numa pasta
  servida pelo Express/nginx como público. Só existe uma rota autenticada
  (`GET /api/v1/registros/:id/entradas/:entradaId/audio`, escopada ao
  `usuario_id` dono do Registro) que faz stream do arquivo depois de
  validar o token e a posse do recurso.
- Nome de arquivo gerado no servidor a partir do `id` da entrada (não do
  nome original enviado pelo cliente) — evita colisão e qualquer risco de
  path traversal via nome de arquivo controlado pelo cliente.

## Alternativas consideradas

- **Object storage compatível com S3** (MinIO, S3 real, R2 etc.).
  Rejeitada para o MVP — adicionaria mais um serviço de infraestrutura
  (ou mais uma conta/credencial de provedor externo) sem necessidade
  comprovada no volume de uso atual (fase de aprendizado com uso real,
  seção final do pedido). Fica como evolução natural se o volume de áudio
  ou a necessidade de distribuição geográfica crescer — a única mudança de
  código esperada nesse momento é trocar a implementação de
  `services/storage-audio.service.js`, cuja interface (salvar por id de
  entrada, ler por id de entrada) já isola essa decisão do resto do
  backend.
- **Guardar o áudio como `bytea`/`bloB` dentro do Postgres.** Rejeitada —
  infla o banco com dados binários grandes, complica backup incremental do
  banco (seção 13 do pedido pede estratégia simples de backup) e não traz
  benefício real sobre um volume de disco dedicado.
- **Servir os arquivos como estáticos públicos** (pasta `public/` do
  Express/nginx). Rejeitada — viola diretamente o requisito de proteção dos
  arquivos de áudio (seção 12); dados de treino/avaliação de aluno são
  informação sensível.

## Consequências

- Backup do volume de áudio precisa ser considerado separadamente do backup
  do banco (ambos documentados na seção de deploy do `CLAUDE.md`) — são
  dois ativos persistentes distintos em produção.
- Migrar para object storage no futuro é uma troca isolada dentro do
  serviço de storage, sem tocar em controllers/models.
- Sem CDN/distribuição — aceitável para o MVP, já que o consumo do áudio é
  interno (pipeline de IA e, ocasionalmente, o próprio personal auditando),
  não um caso de uso de distribuição em massa.
