# Migração para a VM `servidor02` — análise (não executada)

**Status:** análise feita em 2026-09-28, **nada foi alterado** (nem no repositório, nem nas VMs). Registro para
retomar se a mudança for decidida. Quando executada, a decisão vira ADR (sugestão: 0025) e este documento é
atualizado ou aposentado.

Fontes consultadas: repositório FinMind (`docs/architecture.md` § "Deploy", `docs/adr/0026-postgresql-como-banco.md`,
`docker/compose.prod.yml`, `scripts/*deploy.sh`, `.github/workflows/deploy.yml`) e o repositório privado
`servidor02-infra` (`postgres/docker-compose.yml`, `scripts/criar-app.sh`, `scripts/backup.sh`, README).

## Contexto

O Personal roda hoje na `servidor01` (Oracle Always Free, x86, 1 GB, dividida com AgroMind e Portal; ~920 MB em
swap e vários servidores de banco). O FinMind já saiu dela em 2026-09-26 para a `servidor02` (Ampere A1 **arm64**,
2 OCPU / 12 GB, São Paulo), com um **PostgreSQL 16 compartilhado** por todos os apps da VM (um database e um
usuário por app). A ADR 0026 do FinMind já cita o Personal como o próximo app a ir para lá.

## Hoje × alvo

| | Personal hoje (`servidor01`) | Padrão na `servidor02` (FinMind) |
|---|---|---|
| Arquitetura | x86 (amd64) | ARM (arm64) |
| Banco | serviço `postgres` próprio no `docker/compose.prod.yml` (volume `postgres_data`) | Postgres 16 compartilhado em `/opt/apps/infra/postgres`, rede Docker externa `db`, sem porta no host; `POSTGRES_HOST=postgres` |
| Build das imagens | `ubuntu-latest`, só amd64 | runner `ubuntu-24.04-arm`, `platforms: linux/arm64` (QEMU num runner x86 travava no `npm ci`) |
| Compose na VM | `docker-compose` v1 fixo em `scripts/deploy.sh` | detecta `docker compose` (v2) ou `docker-compose` (v1) |
| Login no GHCR | reaproveita a sessão que o deploy do AgroMind deixa no usuário `deploy` | `scripts/github-deploy.sh` com secrets `GHCR_PAT` / `GHCR_USERNAME` |
| Frontend | porta `8082` publicada | publicado só em `127.0.0.1:<porta>`; HTTPS pelo Nginx Proxy Manager da VM (`/opt/apps/proxy`) |
| Backup do banco | comando manual descrito em `docs/deploy.md` | `backup.sh` diário (10:00 UTC, cron do `deploy`): `pg_dump` de **todos** os databases, 7 diários + 4 semanais, cópia para o bucket `backups-servidor02` (Object Storage, 35 dias) |
| Local na VM | `/opt/apps/personal-assistant/app` | mesmo padrão: `/opt/apps/<app>/app` |

O que já é compatível e não pede mudança:

- Postgres 16 dos dois lados → `pg_dump`/`pg_restore` direto.
- Nenhuma migration usa extensão (`CREATE EXTENSION`), então o usuário sem superusuário basta.
- Dependências do backend são JS puro (`bcryptjs`, `pg`, `@google/genai`...) — nada nativo que quebre no ARM.
- Jobs (fila de IA, lote mensal, Radar) são `setInterval` dentro do backend — nenhum cron de host a migrar.
- Postgres compartilhado roda com `timezone=UTC` (conferir `SHOW timezone` no banco atual antes da virada).

## Pontos de atenção

1. **Imagens arm64 são obrigatórias.** As atuais (amd64) não rodam na `servidor02`.
2. **Nome da variável do database.** `criar-app.sh` imprime `POSTGRES_DATABASE`; o Personal lê **`POSTGRES_DB`**
   (`backend/src/config/env.js`, `backend/sequelize.config.js`). Renomear ao copiar para o `.env`.
3. **Três volumes de arquivos além do banco:** `audio_data`, `foto_data`, `exercicio_imagem_data`. O `backup.sh`
   compartilhado só cobre o banco — os volumes precisam de backup próprio.
4. **Offline / PWA — origem.** O IndexedDB é preso à origem (esquema + domínio + porta). Se o endereço de acesso
   mudar, Registros **não sincronizados** nos celulares ficam presos na origem antiga. Antes da virada, todos os
   aparelhos precisam sincronizar tudo. Manter o mesmo domínio (só trocando o DNS) evita o problema.
5. **Jobs duplicados.** Com os dois backends no ar, Radar e lote mensal rodariam duas vezes (chamadas Gemini em
   dobro) e o antigo continuaria gravando no banco velho. Parar o backend antigo **antes** do dump.
6. **HTTPS é obrigatório** para o microfone no iPhone (ver memória de captura no iOS) — o proxy com Let's Encrypt
   precisa estar pronto antes da virada.
7. **O commit de preparação dispara deploy.** O `ci-cd.yml` faz deploy na `servidor01` a cada push em `main`.
   As mudanças da Fase A ficam numa branch (ou com o passo de deploy desligado) até a Fase C.
8. **`docs/deploy.md` está desatualizado**: diz que não há deploy automático, mas o `ci-cd.yml` já faz SSH e roda
   `scripts/deploy.sh`. Corrigir junto.

## Passo a passo

### Fase A — repositório (commit, sem deploy)

1. `docker/compose.prod.yml`: remover o serviço `postgres`, o volume `postgres_data` e o `depends_on` do backend;
   backend em `networks: [default, db]` com `db: external: true` (igual ao FinMind). Manter os três volumes de
   arquivo.
2. `scripts/deploy.sh`: detecção v2/v1 do compose (copiar do FinMind). Criar `scripts/github-deploy.sh`
   (`docker login ghcr.io ... --password-stdin` + `deploy.sh`).
3. `.github/workflows/ci-cd.yml`:
   - `build-and-push` em `runs-on: ubuntu-24.04-arm`, `platforms: linux/arm64` nos dois `build-push-action`
     (jobs de teste continuam em `ubuntu-latest`);
   - passo de deploy: `git checkout -- scripts/ && git pull --ff-only && chmod +x scripts/deploy.sh &&
     bash scripts/github-deploy.sh "$GHCR_USERNAME"`, com o `GHCR_PAT` via stdin (mesmo formato do FinMind).
4. `.env.example`: remover `POSTGRES_INITDB_*`; comentar o Postgres compartilhado (`POSTGRES_HOST=postgres`,
   usuário/senha do `criar-app.sh`); `FRONTEND_PORT=127.0.0.1:8082` (8083 é do FinMind; na `servidor02` a 8082
   está livre).
5. Docs: `docs/deploy.md`, `CLAUDE.md` (Arquitetura, CI/CD, Como publicar, Estado atual) e ADR 0025 curta
   ("Produção na `servidor02` com Postgres compartilhado", remetendo à ADR 0026 do FinMind).

### Fase B — preparar a `servidor02` (sem downtime)

6. Criar database e usuário: `cd /opt/apps/infra/postgres && ./scripts/criar-app.sh personal` (ou
   `personal_assistant` — ver "Decisões em aberto"). Guardar a senha (mostrada uma vez só).
7. Como `deploy`: clonar o repositório em `/opt/apps/personal-assistant/app` e criar o `.env`:
   - `POSTGRES_HOST=postgres`, `POSTGRES_PORT=5432`, `POSTGRES_DB=<nome>`, `POSTGRES_USER=<nome>`,
     `POSTGRES_PASSWORD=<gerada>`;
   - **mesmo `JWT_SECRET`** da produção atual (senão todos são deslogados);
   - mesma `GEMINI_API_KEY`, `GEMINI_MODEL`, `RADAR_JOB_ATIVO`, `RADAR_MODEL`;
   - `NODE_ENV=production`, imagens/tags, `FRONTEND_PORT=127.0.0.1:8082`.
8. Nginx Proxy Manager: proxy host `<domínio do Personal>` → `127.0.0.1:8082`, Let's Encrypt. DNS apontado para
   a `servidor02` só na virada (ou antes, se for um domínio novo).
9. Gerar as imagens arm64 (merge com o deploy desligado, ou `workflow_dispatch`) e `docker compose pull` na VM.

### Fase C — virada (downtime de alguns minutos)

10. Avisar para **sincronizar todos os celulares** (crítico se a origem mudar — ponto 4).
11. `servidor01`: parar `backend` e `frontend` do projeto `personal-assistant` (Postgres continua de pé).
12. Dump: `docker compose ... exec -T postgres pg_dump -U personal_assistant -Fc personal_assistant > personal.dump`.
13. Volumes: `docker run --rm -v personal-assistant_<volume>:/data -v $(pwd):/backup alpine tar czf
    /backup/<volume>.tar.gz -C /data .` para `audio_data`, `foto_data` e `exercicio_imagem_data`.
14. Copiar dump + tars para a `servidor02` (`scp`).
15. Restaurar o banco (database vazio):
    `docker compose exec -T postgres pg_restore -U postgres -d <nome> --no-owner --role=<nome> < personal.dump`
    (de `/opt/apps/infra/postgres`). O dump leva `sequelize_meta`/`sequelize_data` — nenhuma migration nem seeder
    roda de novo.
16. Restaurar os volumes **antes** do primeiro `up`: `docker volume create personal-assistant_<volume>`, extrair o
    tar dentro dele e garantir dono `1000:1000` (usuário `node` da imagem).
17. `bash scripts/deploy.sh` (o `db:migrate` só confirma que não há pendências).
18. Conferência: contagem por tabela igual ao banco antigo; login; ouvir um áudio antigo na revisão; foto de aluno
    e imagem de exercício; `/health`; uma captura nova de ponta a ponta (texto e áudio, inclusive no iPhone).
19. GitHub (Settings → Secrets do repositório do Personal): `ORACLE_HOST` → IP da `servidor02` (e
    `ORACLE_SSH_KEY`, se outra chave), cadastrar `GHCR_PAT`/`GHCR_USERNAME`; religar o deploy.
20. DNS do domínio → `servidor02` (se for o mesmo domínio de hoje).

### Fase D — depois

21. Backup dos três volumes: cron do `deploy` com `tar` para `/opt/backups/personal` + `rclone copy` para o bucket
    `backups-servidor02` (mesma configuração `oci` que o `backup.sh` usa). Idealmente versionado no
    `servidor02-infra`.
22. `servidor02-infra` README: linha do Personal na tabela "Apps no servidor".
23. `servidor01`: manter stack e volumes do Personal **parados** por algumas semanas (rollback = subir de novo, as
    imagens amd64 continuam lá; voltar o DNS e os secrets). Depois apagar containers, volumes, imagens e pasta,
    como foi feito com o FinMind.

## Rollback

Até a Fase D.23, voltar é: parar o Personal na `servidor02`, subir de novo a stack na `servidor01`, voltar DNS e
`ORACLE_HOST`. **Cuidado:** o que foi gravado na `servidor02` depois da virada não existe no banco antigo — se o
rollback vier depois de uso real, fazer o caminho inverso (dump da `servidor02` → restore na `servidor01`).

## Decisões em aberto

- **Endereço de acesso hoje:** o Personal é acessado por um domínio com HTTPS na `servidor01` ou por `IP:8082`?
  Define o risco do ponto 4 e o que muda no DNS.
- **Nome do database/usuário:** `personal` (como a ADR 0026 do FinMind antecipa) ou `personal_assistant` (nome
  atual)?
- **Backup atual:** existe cron de backup (banco ou volumes) na `servidor01`, ou nunca foi configurado?
- **Imagens no GHCR:** públicas ou privadas? Se públicas, o login no GHCR na VM é dispensável.
