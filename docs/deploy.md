# Publicação do MVP

Este documento cobre o que falta configurar para publicar o Personal
Assistant num servidor — os artefatos (Dockerfiles, `docker/compose.prod.yml`,
`nginx.conf`) já existem no repositório; o que falta é específico do
ambiente real (servidor, domínio, credenciais, pipeline de CI/CD), que este
MVP deliberadamente não inventa.

## Build de produção

```bash
docker build -t personal-assistant-backend ./backend
docker build -t personal-assistant-frontend ./frontend
```

O backend não tem passo de build (JavaScript puro) — a imagem só instala
dependências de produção (`npm ci --omit=dev`). O frontend builda com Vite
(`npm run build`) num estágio intermediário e serve os estáticos resultantes
com nginx (build multi-stage, ver `frontend/Dockerfile`).

## Publicar imagens (GHCR ou outro registry)

Este MVP **não tem pipeline de CI/CD configurado ainda** (sem GitHub Actions,
sem publicação automática no GHCR). `docker/compose.prod.yml` já está
preparado para consumir imagens de um registry (`BACKEND_IMAGE`/
`FRONTEND_IMAGE` em `.env`, ver `.env.example`) — falta só:

1. Publicar as imagens buildadas acima num registry acessível pelo servidor
   (GHCR, Docker Hub, etc.) — `docker tag` + `docker push`.
2. Ajustar `BACKEND_IMAGE`/`FRONTEND_IMAGE`/`*_IMAGE_TAG` no `.env` do
   servidor para apontar para onde elas realmente ficaram.

Automatizar isso (build → push → deploy via GitHub Actions) é uma etapa
futura, fora do escopo deste MVP.

## Subir em produção

```bash
cp .env.example .env   # ajustar todos os valores para o ambiente real
docker compose --project-directory . -f docker/compose.prod.yml up -d
docker exec $(docker compose --project-directory . -f docker/compose.prod.yml ps -q backend) npm run db:migrate
```

- O backend nunca expõe porta no host (`expose`, não `ports`) — só o
  `frontend` fica acessível externamente; o nginx do frontend faz proxy
  interno de `/api` e `/health` para o `backend` pela rede Docker (mesma
  origem, sem CORS).
- Rollback: trocar `BACKEND_IMAGE_TAG`/`FRONTEND_IMAGE_TAG` no `.env` para
  uma tag anterior e rodar `up -d` de novo — sem editar o compose.

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

## Variáveis de ambiente

Ver `.env.example` (raiz) — usado tanto pelo Docker Compose quanto pelo
backend (`env_file` em `compose.prod.yml`). Nunca commitar o `.env` real;
gerar `JWT_SECRET` novo por ambiente (`openssl rand -hex 32`).
