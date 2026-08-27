# Publicação do MVP

Este documento cobre o que falta configurar para publicar o Personal
Assistant num servidor — os artefatos (Dockerfiles, `docker/compose.prod.yml`,
`nginx.conf`, `.github/workflows/ci-cd.yml`) já existem no repositório; o
que falta é específico do ambiente real (servidor, domínio, credenciais),
que este MVP deliberadamente não inventa.

## Build de produção

```bash
docker build -t personal-assistant-backend ./backend
docker build -t personal-assistant-frontend ./frontend
```

O backend não tem passo de build (JavaScript puro) — a imagem só instala
dependências de produção (`npm ci --omit=dev`). O frontend builda com Vite
(`npm run build`) num estágio intermediário e serve os estáticos resultantes
com nginx (build multi-stage, ver `frontend/Dockerfile`).

## CI/CD (`.github/workflows/ci-cd.yml`)

Em todo push/PR para `main`: `test-backend` (Postgres de serviço, migrations,
`npm test`) e `test-frontend` (`npm test` + `npm run build`). Em push direto
para `main`, depois dos dois jobs de teste passarem, `build-and-push` builda
e publica as imagens no GHCR:

- `ghcr.io/welersonepora/personal-assistant-backend:latest` (+ tag do SHA)
- `ghcr.io/welersonepora/personal-assistant-frontend:latest` (+ tag do SHA)

Usa só `secrets.GITHUB_TOKEN` (automático, sem configuração) — nenhum
segredo novo precisa ser cadastrado no repositório para essa parte.

**O que falta — deploy automático no servidor.** O workflow builda e publica
as imagens, mas ainda **não** faz SSH num servidor e roda `scripts/deploy.sh`
lá (diferente do `.github/workflows/deploy.yml` do AgroMind, que já tem essa
etapa porque já existe uma VM real rodando). Falta, quando houver um
servidor real:

1. Provisionar o servidor (Docker + Docker Compose instalados, repositório
   clonado, `.env` configurado).
2. Cadastrar os secrets do repositório GitHub: host/usuário/chave SSH do
   servidor.
3. Adicionar ao final do job `build-and-push` um passo de deploy via SSH
   (`appleboy/ssh-action`, mesmo padrão do AgroMind) que roda
   `scripts/deploy.sh` no servidor.

Até lá, publicar em produção é manual: `docker tag` + `docker push` das
imagens buildadas localmente, ou puxar as imagens já publicadas pelo CI
(`docker compose ... pull`) direto no servidor.

## Subir em produção

```bash
cp .env.example .env   # ajustar todos os valores para o ambiente real
bash scripts/deploy.sh   # pull + up -d + migrations + seeders pendentes + limpeza de imagens antigas
```

- O backend nunca expõe porta no host (`expose`, não `ports`) — só o
  `frontend` fica acessível externamente; o nginx do frontend faz proxy
  interno de `/api` e `/health` para o `backend` pela rede Docker (mesma
  origem, sem CORS).
- Rollback: trocar `BACKEND_IMAGE_TAG`/`FRONTEND_IMAGE_TAG` no `.env` para
  uma tag anterior e rodar `scripts/deploy.sh` de novo — sem editar o
  compose.

### Primeiro usuário

Não existe cadastro público neste MVP (seção 12 do pedido original —
superfície de auth mínima). Depois do primeiro deploy, criar o primeiro
personal trainer real dentro do container do backend:

```bash
docker compose -p personal-assistant --project-directory . -f docker/compose.prod.yml \
  exec backend npm run criar-usuario -- --nome="Fulano" --email="fulano@exemplo.com" --senha="uma-senha-forte"
```

`scripts/deploy.sh` roda `npm run db:seed` (`db:seed:all`) genericamente a
cada deploy, mesmo critério de `db:migrate`: cada seeder só executa uma vez
(controle próprio do `sequelize-cli`, tabela `sequelize_data`), então um
novo seeder adicionado ao repositório (ex.: catálogo global de exercícios,
`docs/adr/0013-catalogo-exercicios-ficha-treino.md`) é aplicado sozinho no
próximo deploy, sem precisar editar `scripts/deploy.sh` (mesmo padrão do
AgroMind). O seeder de desenvolvimento
(`database/seeders/20260825110000-seed-usuario-dev.js`, credenciais fracas
fixas `personal@dev.local` / `personal123`) é o único caso especial: ele
mesmo verifica `NODE_ENV === "production"` e não faz nada nesse caso, então
nunca cria esse usuário em produção mesmo rodando dentro do `db:seed`
genérico.

## Domínio e TLS

Não incluído neste MVP. O jeito mais simples de colocar um domínio com
HTTPS na frente do serviço `frontend` (porta `FRONTEND_PORT`, padrão 8081)
é um reverse proxy própria (Nginx Proxy Manager, Caddy, Traefik) rodando à
parte, apontando para essa porta — decisão de infraestrutura a ser tomada
quando houver um domínio real para configurar.

## Health checks

- Backend: `GET /health` (fora do prefixo `/api/v1`, não é recurso de
  domínio) — retorna `{ status: "ok", service, timestamp }`. Configurado
  como `HEALTHCHECK` da imagem Docker (`backend/Dockerfile`).
- Frontend: `HEALTHCHECK` da imagem Docker faz `wget --spider` em `/`
  (nginx respondendo com os estáticos da SPA).
- Postgres: `healthcheck` do `docker/compose.prod.yml` via `pg_isready` —
  o backend só inicia depois que o Postgres reporta saudável
  (`depends_on: condition: service_healthy`).

## Logs

O backend usa `pino` (JSON estruturado em produção, `NODE_ENV=production`);
`docker logs <container>` (ou `docker compose logs -f backend`) já são
suficientes para o volume deste MVP — sem stack de agregação de logs
(ELK, Loki etc.) por ora.

## Backup

Dois ativos persistentes distintos em produção — cada um com sua própria
estratégia:

### Banco de dados (Postgres)

```bash
docker exec <container_postgres> pg_dump -U personal_assistant personal_assistant | gzip > backup-$(date +%Y%m%d-%H%M).sql.gz
```

Restaurar:

```bash
gunzip -c backup-AAAAMMDD-HHMM.sql.gz | docker exec -i <container_postgres> psql -U personal_assistant personal_assistant
```

Rodar isso via `cron` do servidor, apontando para um diretório fora do
volume Docker (ou copiado para armazenamento externo depois) — suficiente
para o volume de dados deste MVP; sem WAL archiving/point-in-time-recovery
por ora.

### Arquivos de áudio (volume `audio_data`)

```bash
docker run --rm -v personal-assistant_audio_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/audio-backup-$(date +%Y%m%d-%H%M).tar.gz -C /data .
```

Mesma lógica simples: `tar` do volume nomeado, agendado via `cron`, copiado
para fora do servidor periodicamente. Ver `docs/adr/0010-armazenamento-arquivos-audio.md`
para a decisão de manter os áudios em disco local (não object storage) neste
MVP — migrar para object storage no futuro elimina a necessidade deste
backup manual.

### Fotos de aluno (volume `foto_data`)

Mesmo critério do volume `audio_data` acima (troque `audio_data` por
`foto_data` e `/app/storage/audio` por `/app/storage/fotos` no comando de
backup) — arquivos pequenos, mesma lógica de `tar` + `cron`.

### Imagens de exercício (volume `exercicio_imagem_data`)

Mesmo critério dos dois volumes acima (troque `audio_data` por
`exercicio_imagem_data` e `/app/storage/audio` por `/app/storage/exercicios`)
— inclui tanto as imagens dos exercícios próprios de cada equipe quanto,
depois do primeiro deploy, as do catálogo global (populadas pelo seeder,
ver `docs/adr/0013-catalogo-exercicios-ficha-treino.md`).

## Variáveis de ambiente

Ver `.env.example` (raiz) — usado tanto pelo Docker Compose quanto pelo
backend (`env_file` em `compose.prod.yml`). Nunca commitar o `.env` real;
gerar `JWT_SECRET` novo por ambiente (`openssl rand -hex 32`).
