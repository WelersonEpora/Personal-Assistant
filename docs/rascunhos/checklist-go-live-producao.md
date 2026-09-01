# RASCUNHO — Checklist de go-live de produção

> **Status: RASCUNHO.** Nada aqui foi executado. Documento de trabalho,
> par do rascunho `0022-ambientes-validacao-e-producao.md`. Revisar antes
> de tratar como runbook oficial.

Ordem sugerida. Cada item é pré-requisito do seguinte, salvo indicação.

## Fase 0 — Decisões antes de tocar em infra

- [ ] Confirmar modelo de branches: `dev` → validação (VM atual),
      `main` → produção (VM nova). (rascunho ADR-0022 §3)
- [ ] Decidir se o deploy de produção é automático no merge ou com
      aprovação manual (GitHub Environment `production` + required
      reviewer). (§3, opcional recomendado)
- [ ] Definir subdomínio de produção (ex.: `app.<dominio>`).
- [ ] Decidir key do Gemini: AI Studio vs projeto GCP dedicado
      (recomendado: projeto dedicado). (§5)
- [ ] Escrever adendo ao ADR-0006 (LGPD / dados no Gemini em produção).

## Fase 1 — Google Cloud (Gemini de produção)

- [ ] Criar projeto `personal-assistant-prod` (ou equivalente).
- [ ] Habilitar billing + Gemini API.
- [ ] Gerar API key; restringir por API e, se possível, por IP da VM de
      produção.
- [ ] Definir orçamento + alerta de billing.
- [ ] Escolher e **pinar** `GEMINI_MODEL` numa versão específica (não
      `*-latest`).
- [ ] Guardar a key no gerenciador de segredos (não no repo).

## Fase 2 — VM de produção (Oracle)

- [ ] Criar VM **Ampere A1 Flex**, 1 OCPU / 6 GB, boot volume ≥ 50 GB.
      (NÃO a `E2.1.Micro` de 1 GB — §2)
- [ ] SO atualizado; usuário `deploy` criado; Docker + Docker Compose
      instalados.
- [ ] `docker login ghcr.io` persistente para o usuário `deploy` (ou
      configurar `GHCR_PAT` / `GHCR_USERNAME` como no AgroMind).
- [ ] Clonar o repo em `/opt/apps/personal-assistant/app`, checkout fixo na
      branch `main`.
- [ ] Firewall: abrir só a porta do reverse proxy (80/443); Postgres e
      backend nunca publicados no host.
- [ ] Configurar **Backup Policy** de block volume (Bronze / semanal). (§7)

## Fase 3 — Rede / domínio

- [ ] DNS do subdomínio → IP da VM de produção.
- [ ] Reverse proxy externo (Caddy / Nginx Proxy Manager / Traefik)
      apontando para `FRONTEND_PORT` da VM, com TLS (Let's Encrypt).
- [ ] Verificar que o nginx do frontend recebe `X-Forwarded-Proto`
      corretamente (já tratado em `frontend/nginx.conf`).

## Fase 4 — Configuração da aplicação

- [ ] Criar `.env` de produção na VM (a partir de `.env.example`):
  - [ ] `JWT_SECRET` novo (`openssl rand -hex 32`)
  - [ ] `POSTGRES_PASSWORD` / `POSTGRES_INITDB_PASSWORD` fortes e únicos
  - [ ] `GEMINI_API_KEY` de produção
  - [ ] `GEMINI_MODEL` pinado
  - [ ] `BACKEND_IMAGE_TAG` / `FRONTEND_IMAGE_TAG` pinados num `:sha-xxx`
        (nunca `latest`)
  - [ ] `FRONTEND_PORT` definido
  - [ ] `NODE_ENV=production` (já no compose, conferir)
- [ ] `.env` fora do controle de versão; backup do `.env` em local seguro.

## Fase 5 — CI/CD

- [ ] Criar branch `dev` a partir de `main`.
- [ ] Ajustar `.github/workflows/ci-cd.yml`:
  - [ ] `on.push.branches: [main, dev]`
  - [ ] `build-and-push` roda nas duas branches; tags por branch
        (`dev` → `:dev`+`:sha`; `main` → `:latest`+`:sha`)
  - [ ] `deploy-validacao` (`if` ref == `dev`) → secrets `ORACLE_*`
  - [ ] `deploy-producao` (`if` ref == `main`) → secrets `PROD_*`
  - [ ] script inline: `git fetch && git checkout <branch> && git reset
        --hard origin/<branch>` (ou clones fixos por branch)
- [ ] Cadastrar secrets `PROD_HOST` / `PROD_USER` / `PROD_SSH_KEY`.
- [ ] (Opcional) GitHub Environment `production` com required reviewer.
- [ ] VM atual: garantir que o clone está na branch `dev`.

## Fase 6 — Ajustes no `scripts/deploy.sh` (rascunho ADR-0022 §6)

- [ ] `pg_dump` automático **antes** do `db:migrate`, retenção ~7.
- [ ] Trocar `docker image prune -f` por limpeza direcionada: manter as 3
      imagens mais recentes de `personal-assistant-backend` e
      `-frontend`, `docker rmi` o resto ignorando "em uso".

## Fase 7 — Primeiro deploy de produção

- [ ] Merge `dev` → `main` (ou disparo manual) → pipeline builda e faz
      deploy na VM nova.
- [ ] Conferir `docker compose ps` — 3 serviços `healthy`.
- [ ] `GET /health` respondendo através do domínio (HTTPS).
- [ ] Seeder do catálogo global de exercícios aplicado; seeder de dev
      **não** aplicado (`NODE_ENV=production`).

## Fase 8 — Bootstrap de dados

- [ ] Criar o primeiro usuário/equipe:
      `docker compose -p personal-assistant --project-directory . -f
      docker/compose.prod.yml exec backend npm run criar-usuario --
      --nome="..." --email="..." --senha="..."`
- [ ] Anotar o `equipe_id` criado.
- [ ] Import do BodyMove (personal case):
  - [ ] Levar `bodymove.bak` para a VM (não vai na imagem; gitignored).
  - [ ] Resolver o `mdb-reader` (devDependency, ausente na imagem):
        `docker compose ... exec backend npm i --no-save mdb-reader`
        **ou** rodar da máquina do dev via túnel SSH para o Postgres.
  - [ ] `docker cp bodymove.bak <container_backend>:/tmp/`
  - [ ] `--dry-run` primeiro:
        `... exec backend node scripts/importar-avaliacoes-bodymove.js
        --arquivo=/tmp/bodymove.bak --equipe-id=<uuid> --dry-run`
  - [ ] Conferir o relatório (alunos criados/vinculados, avisos).
  - [ ] Rodar de verdade (sem `--dry-run`).
  - [ ] `scripts/recalcular-derivadas-avaliacao-fisica.js` se o relatório
        indicar derivadas faltando.
  - [ ] Apagar o `.bak` do container e da VM.

## Fase 9 — Validação end-to-end em produção

- [ ] Login no `/admin` com o usuário criado.
- [ ] Conferir alunos e avaliações físicas importadas na tela do aluno.
- [ ] Capturar 1 Registro só-texto no `/captura` → sincronizar → conferir
      que a IA processou (proposta gerada) → revisar → confirmar →
      `validacao` criada.
- [ ] Capturar 1 Registro com áudio → conferir transcrição real do Gemini.
- [ ] Forçar reconfirmação → conferir que `validacao` não é sobrescrita.
- [ ] Navegar as telas principais sem erro de console.

## Fase 10 — Operação contínua

- [ ] Cron de `pg_dump` diário para diretório fora do volume + cópia
      off-site.
- [ ] Monitor de uptime externo (UptimeRobot ou similar) no `/health`.
- [ ] Alerta de container em restart loop.
- [ ] Testar um restore do `pg_dump` num ambiente descartável.
- [ ] Ensaiar um rollback: trocar `BACKEND_IMAGE_TAG` para o `:sha`
      anterior + `bash scripts/deploy.sh`, confirmar subida rápida.
- [ ] Atualizar `docs/deploy.md` e `CLAUDE.md` com a realidade dos dois
      ambientes.

## Riscos / gotchas registrados

- **Rollback + migrations:** voltar a imagem não volta o schema. Migration
  destrutiva exige restaurar o banco do dump pré-deploy. (ADR-0022 §6)
- **IA obrigatória na prática:** sem `GEMINI_API_KEY`, captura e sync
  funcionam mas o Registro nunca vira `validacao`, e estados `erro_*` não
  se retomam sozinhos. Key de produção configurada desde o dia 1.
- **`mdb-reader` é devDependency** — import do BodyMove não roda numa
  imagem de produção limpa sem o passo extra.
- **`.bak` com PII** — nunca commitar, nunca deixar no container/VM depois
  do import.
- **Pipeline de IA pouco exercitado com key real** — só o interpretador de
  avaliação física foi testado ponta a ponta; transcrição de áudio,
  interpretação de relato e acompanhamento mensal ainda não. Validar na
  Fase 9.
- **Free tier do Gemini pode usar o conteúdo para treino** — usar tier
  pago em produção (dado de saúde de aluno).
