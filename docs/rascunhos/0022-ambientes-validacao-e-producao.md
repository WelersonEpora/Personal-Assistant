# RASCUNHO — ADR-0022: Ambientes de validação e de produção

> **Status: PROPOSTA / RASCUNHO.** Nada aqui foi decidido nem implementado.
> Documento de trabalho para discussão. Quando aprovado, vira
> `docs/adr/0022-ambientes-validacao-e-producao.md` e a numeração é
> confirmada. Não commitar como decisão até revisão.

## Contexto

Hoje o Personal Assistant tem **um único ambiente**: a branch `main`,
publicada automaticamente pelo `.github/workflows/ci-cd.yml` numa VM Oracle
**compartilhada com o AgroMind** (stack Docker isolada, projeto
`personal-assistant`, porta `FRONTEND_PORT=8082`). Esse ambiente é usado
para a validação do MVP com usuários reais.

`docs/deploy.md` e `CLAUDE.md` ainda descrevem o deploy automático como
"ainda não existe" — **estão desatualizados**: o commit `d8f858d` adicionou
o passo `Deploy on Oracle VM` (via `appleboy/ssh-action`, secrets
`ORACLE_HOST` / `ORACLE_USER` / `ORACLE_SSH_KEY`, rodando
`scripts/deploy.sh` em `/opt/apps/personal-assistant/app`).

Depois da validação, a intenção é **"pôr em produção"**: um ambiente
estável, com dados reais de clientes (dado sensível de saúde → LGPD),
separado do ambiente onde se continua testando alterações.

Restrições e desejos levantados pelo dono do produto:

1. **VM nova na Oracle** dedicada a produção (a mais barata possível).
2. **Backup semanal da VM inteira** contratado na Oracle.
3. **Branch `dev`** publica automaticamente no servidor atual (validação);
   **branch `main`**, ao receber merge, dispara o CI/CD de produção.
4. **Produção nasce zerada.** Exceção: o primeiro personal ("personal
   case") tem os dados históricos importados do `.bak` do BodyMove já usado
   em desenvolvimento (ADR-0016).
5. Na VM de produção, **as 3 últimas imagens** do app ficam disponíveis
   localmente para rollback rápido em caso de erro na publicação.

## Decisão (proposta)

### 1. Dois ambientes, duas VMs

| Ambiente | Branch | VM | Projeto Docker | Uso |
|---|---|---|---|---|
| Validação / staging | `dev` | VM Oracle atual (compartilhada com AgroMind) | `personal-assistant` | Teste contínuo de alterações com usuários piloto |
| Produção | `main` | **VM Oracle nova, dedicada** | `personal-assistant` (na VM nova) | Dados reais de clientes |

Motivo de VM dedicada para produção (e não um segundo projeto compose na
mesma VM): isolamento real de CPU/RAM/disco, e o `docker image prune` /
`docker compose` do deploy de um ambiente não mexe no outro nem no
AgroMind. Dado sensível de cliente não divide host com ambiente de teste.

### 2. Dimensionamento da VM de produção

- **NÃO** usar a *Always Free* AMD `VM.Standard.E2.1.Micro` (1 OCPU /
  1 GB RAM): insuficiente para Postgres (container) + Node com a **fila de
  IA em processo** (o buffer de áudio é carregado na memória do processo
  para enviar ao Gemini — ADR-0009) + nginx + job mensal (ADR-0015). 1 GB
  causa swap/OOM na transcrição de áudios grandes.
- **Escolha:** Ampere **A1 Flex** (Always Free, até 4 OCPU / 24 GB no
  tenancy) configurada como **1 OCPU / 6 GB**. Se for instância paga:
  mínimo 2 GB, ideal 4.
- Boot volume ≥ 50 GB. Áudios acumulam no volume `audio_data` — monitorar;
  migração futura para object storage elimina esse crescimento (previsto no
  ADR-0010).
- Build **não** roda na VM (imagens vêm prontas do GHCR via GitHub
  Actions; a VM só faz `docker compose pull`).

### 3. Fluxo de branches e CI/CD

```
feature/* → PR → dev → (merge) → deploy AUTOMÁTICO validação (VM atual)
                                   ↓ testa com usuários
              dev → PR → main → (merge) → deploy AUTOMÁTICO produção (VM nova)
```

Mudanças no `.github/workflows/ci-cd.yml`:

- `on.push.branches: [main, dev]` (mantém `pull_request` para as duas).
- `test-backend` / `test-frontend`: já rodam em tudo — sem mudança.
- `build-and-push`: roda em push nas duas branches. Tags por branch:
  - `dev`  → `:dev` + `:sha-<curto>`
  - `main` → `:latest` + `:sha-<curto>` (+ opcional `:vX.Y.Z` por git tag)
- Deploy dividido em dois jobs, com `if` por ref:
  - `deploy-validacao` — `if: github.event_name == 'push' && github.ref == 'refs/heads/dev'`
    → SSH na VM atual, secrets `ORACLE_HOST` / `ORACLE_USER` / `ORACLE_SSH_KEY`.
  - `deploy-producao` — `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`
    → SSH na VM nova, secrets **novos** `PROD_HOST` / `PROD_USER` / `PROD_SSH_KEY`.
- O script inline hoje faz `git pull --ff-only` na branch em checkout na
  VM. Cada VM precisa do clone **fixado na sua branch** (atual → `dev`,
  nova → `main`), OU trocar o comando para
  `git fetch origin && git checkout <branch> && git reset --hard origin/<branch>`.
- `scripts/deploy.sh` continua agnóstico de branch (usa compose + `.env`) —
  sem mudança.
- **Opcional recomendado:** GitHub Environment `production` com *required
  reviewer* — o merge em `main` dispara o pipeline, mas o deploy fica
  pausado esperando 1 aprovação manual. O pedido é deploy automático no
  merge; fica registrado como alternativa de baixo custo e alto ganho de
  segurança.

### 4. Configuração por ambiente (`.env` separado em cada VM)

Valores obrigatoriamente distintos em produção:

- `JWT_SECRET` — novo (`openssl rand -hex 32`). Consequência: invalida todas
  as sessões (todos os personais relogam) — irrelevante em produção nova.
- `POSTGRES_PASSWORD` / `POSTGRES_INITDB_PASSWORD` — forte e único.
- `GEMINI_API_KEY` — key de produção (ver seção 5).
- `GEMINI_MODEL` — **pinar uma versão específica** em produção (hoje default
  `gemini-flash-latest`, que muda sozinho).
- `BACKEND_IMAGE_TAG` / `FRONTEND_IMAGE_TAG` — **pinados** num `:sha-xxx` (ou
  `:vX.Y.Z`), **nunca `latest`** (ver seção 6).
- `FRONTEND_PORT` — porta própria na VM nova (sem conflito, VM dedicada;
  padronizar mesmo assim).
- `NODE_ENV=production` (já forçado no `compose.prod.yml`).

### 5. Chave do Gemini de produção

- **Tecnicamente trivial:** só um valor diferente de `GEMINI_API_KEY` no
  `.env` de produção. Zero mudança de código (`gemini.service.js` lê
  `env.gemini.apiKey`).
- **Sem a key, a captura NÃO para, mas o processamento sim** (ver seção
  "Consequências" → IA). A key de produção precisa estar configurada
  **antes** do personal começar a capturar de verdade.
- **Por que separar a key:** billing/quota isolados de validação (que faz
  muito reprocessamento); poder revogar/rotacionar sem impacto cruzado;
  cobrir o pico do lote mensal (ADR-0015 — 1 chamada por aluno ativo a cada
  6h + no boot; transcrição de áudio é a chamada mais cara).
- **No Google Cloud:**
  - Decidir **AI Studio key** (rápido, provável atual) vs **projeto GCP
    dedicado** (`personal-assistant-prod`) com billing habilitado e Gemini
    API — recomendado o projeto dedicado para produção (quotas maiores,
    controle de billing, key restrita por API / IP da VM).
  - Habilitar billing: a free tier tem limites de RPM/RPD que esbarram no
    lote conforme cresce, **e conteúdo de free tier pode ser usado para
    treino do modelo** — relevante porque se envia áudio/texto com dado de
    saúde de aluno.
  - Definir **orçamento + alerta de billing** no GCP.
- **LGPD / privacidade:** conteúdo enviado ao Gemini é dado sensível de
  saúde. Para produção: tier pago (sem uso para treino), revisar retenção
  do Google, e um **adendo ao ADR-0006** registrando o tratamento em
  produção — possivelmente com consentimento do aluno / cláusula no
  contrato do personal.

### 6. Rollback e retenção de imagens na VM de produção

Situação atual: `scripts/deploy.sh` passo 6 faz `docker image prune -f`,
que remove só imagens **dangling** (sem tag). Como o CI usa `:latest` +
`:sha`, quando o novo `:latest` chega o antigo vira dangling e é apagado —
na prática **só a imagem atual fica** na VM.

Proposta:

- Produção pina `BACKEND_IMAGE_TAG` / `FRONTEND_IMAGE_TAG` num `:sha-xxx`
  (ou `:vX.Y.Z`) específico no `.env`. Rollback = editar o `.env` para a
  tag anterior + `bash scripts/deploy.sh` (imagem já local → `compose up
  -d` quase instantâneo). Já descrito em `docs/deploy.md` §Rollback.
- Trocar `docker image prune -f` por limpeza **direcionada**: manter as 3
  imagens mais recentes de cada repo (`personal-assistant-backend`,
  `-frontend`) e `docker rmi` o resto, ignorando "em uso".
- Fonte da verdade do rollback é sempre o **GHCR** (guarda todas as tags).
  As 3 locais são só velocidade / caso o GHCR esteja inacessível.
- **Gotcha migrations:** `deploy.sh` roda `db:migrate` sempre; voltar a
  imagem **não** volta o schema. Coluna adicionada → ok (imagem antiga
  ignora). Coluna removida/renomeada → imagem antiga quebra e o rollback
  exige também restaurar o banco do dump pré-deploy. Proposta: `deploy.sh`
  tira um `pg_dump` **antes** do `db:migrate`, retém ~7.

### 7. Backup

- **Baseline de DR:** Backup Policy de block volume da Oracle (Bronze =
  semanal, retém 4 semanas) na VM de produção — cobre boot volume +
  volumes (`postgres_data`, `audio_data`, `foto_data`,
  `exercicio_imagem_data`), sem script. É snapshot *crash-consistent*
  (recuperável para Postgres em container no start).
- **Somado a** um `pg_dump` **diário** via cron para um diretório fora do
  volume Docker (idealmente copiado para fora da VM) — restore granular e
  testado ("apaguei um aluno sem querer"); o restore da Oracle troca o
  volume inteiro, grosso demais para correção pontual.
- Com o backup da Oracle no lugar, **remover os scripts de `tar` manual por
  volume** de `docs/deploy.md` (simplificação).

### 8. Bootstrap de produção (resumo — detalhe no checklist)

- `NODE_ENV=production` → seeder de dev se auto-desativa; seeder do catálogo
  global de exercícios roda. Produção sobe limpa.
- Primeiro usuário via `npm run criar-usuario` dentro do container.
- Import do BodyMove (`npm run importar-bodymove -- --equipe-id=<uuid>`,
  ADR-0016): idempotente por `(aluno_id, data, origem)`, cria/vincula
  alunos por nome normalizado. Wrinkles conhecidos:
  - `mdb-reader` é `devDependency` → não está na imagem de produção
    (`npm ci --omit=dev`). Opções: `docker compose exec backend npm i
    --no-save mdb-reader` antes de rodar (some no próximo recreate), ou
    rodar da máquina do dev contra o Postgres de produção via túnel SSH
    (Postgres é `expose`, não publicado no host).
  - O `.bak` tem PII/dado de saúde real, é gitignored e não entra na imagem
    → `docker cp` para o container e apagar depois.
  - Nunca foi rodado contra banco real (só `--dry-run` + testes) → rodar
    `--dry-run` contra o banco de produção primeiro, conferir o relatório,
    depois rodar de verdade. Em seguida
    `scripts/recalcular-derivadas-avaliacao-fisica.js` se faltar derivada.

## Alternativas consideradas

1. **Um segundo projeto compose na mesma VM Oracle** (ex.:
   `personal-assistant-prod`, outra porta, outros volumes, outro banco).
   Mais barato e rápido, sem VM nova. Rejeitado para produção: sem
   isolamento real de recursos; `docker image prune` / operações de deploy
   de um ambiente afetam a VM toda (inclusive AgroMind); dado sensível de
   cliente dividindo host com ambiente de teste.
2. **Manter só `main` e promover por tag Docker** (staging usa `:latest`,
   produção fixa `:sha` no `.env` e roda `deploy.sh` manualmente ou por
   `workflow_dispatch`). Menos automação, mais controle. Compatível com
   esta proposta como modo de operação da branch `main` (item 3), mas o
   pedido é ter as duas branches; registrado como caminho de menor esforço
   se a branch `dev` for adiada.
3. **Segunda `GEMINI_API_KEY` como fallback** (padrão do AgroMind).
   Fora de escopo desta ADR — decisão do ADR-0006 de não ter. Pode ser
   revisitado se o volume em produção justificar.
4. **Deploy de produção só com aprovação manual** (GitHub Environment com
   required reviewer). Registrado como opcional recomendado (item 3).

## Consequências

### Positivas

- Isolamento real entre teste e produção; incidente em validação não
  derruba cliente.
- Rollback de produção rápido (imagem local pinada) e com fonte de verdade
  no GHCR.
- DR coberto (backup semanal Oracle + dump diário).
- Billing e quota do Gemini separados; corte de um ambiente não afeta o
  outro.

### Negativas / custos

- **+1 VM** para manter (SO, updates, monitoramento, certificado TLS).
- **2–3 ambientes** no total (validação + produção + AgroMind na VM
  compartilhada) — mais superfície operacional.
- Novo `.env` de produção com segredos próprios para gerir com cuidado.
- Domínio + TLS de produção precisam ser configurados antes de expor a
  clientes (reverse proxy externo — Caddy / NPM / Traefik — apontando para
  `FRONTEND_PORT`; o `compose.prod.yml` não inclui TLS). `VITE_API_BASE_URL`
  continua vazio se front e back ficam no mesmo domínio.
- Novos secrets no repositório: `PROD_HOST`, `PROD_USER`, `PROD_SSH_KEY`.

### Sobre a IA (confirmação de comportamento — não é decisão nova)

Sem `GEMINI_API_KEY` configurada:

| Camada | Sem a key |
|---|---|
| Captura no celular (`/captura`) | Funciona 100% (offline, IndexedDB) |
| Sincronização (`POST /registros/:id/sincronizar`) | Funciona — grava numa transação; a fila de IA é acionada depois, fora da transação; falha nela não afeta a resposta HTTP |
| Transcrição + interpretação (worker) | Falha, isolada por Registro |
| Revisão → confirmação → `validacao` | Bloqueado — não há entrada manual do resultado estruturado |

- **Nenhum dado é perdido** — texto, áudio e metadados ficam salvos. O
  Registro para em `erro_transcricao` / `erro_interpretacao`.
- **Fallback existente:** retry de erro transitório no `gemini.service`
  (429/500/502/503/504, "overloaded", "high demand") — 3 tentativas,
  backoff exponencial + jitter. Estados de erro são retomáveis via
  `POST /registros/:id/reprocessar` (botão inline no dashboard, seção
  "Ação necessária").
- **Fallback ausente:** sem segunda API key; sem retomada automática dos
  estados `erro_*` (o reenfileiramento no boot só pega `recebido` /
  `transcrevendo` / `interpretando`); sem modo de digitação manual do
  resultado.
- **Item para ADR/melhoria futura:** retomada automática dos `erro_*` num
  timer + ação "reprocessar todos" — relevante se o volume crescer ou se o
  Gemini ficar instável por períodos longos.

## Pendências que esta ADR cria (quando aprovada)

- [ ] Atualizar `docs/deploy.md` e `CLAUDE.md` (deploy automático já existe;
      documentar os dois ambientes).
- [ ] Adendo ao ADR-0006 sobre tratamento de dados no Gemini em produção
      (LGPD).
- [ ] Ajustar `.github/workflows/ci-cd.yml` (branches, tags, jobs de deploy).
- [ ] Ajustar `scripts/deploy.sh` (pg_dump pré-migrate; retenção de 3
      imagens em vez de `prune -f`).
- [ ] Provisionar VM de produção + reverse proxy + TLS + DNS + firewall.
- [ ] Criar projeto GCP de produção + key + billing + alerta de orçamento.
- [ ] Configurar Backup Policy da Oracle + cron de `pg_dump` diário.
