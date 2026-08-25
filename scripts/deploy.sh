#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

COMPOSE_FILE="docker/compose.prod.yml"
COMPOSE_PROJECT="personal-assistant"

echo "========================================"
echo " Personal Assistant - Deploy"
echo "========================================"

echo "[1/5] Baixando imagens..."
docker-compose -p "$COMPOSE_PROJECT" --project-directory . -f "$COMPOSE_FILE" pull

echo "[2/5] Atualizando containers..."
docker-compose -p "$COMPOSE_PROJECT" --project-directory . -f "$COMPOSE_FILE" up -d --remove-orphans

echo "[3/5] Aguardando backend iniciar..."
sleep 10

echo "[4/5] Executando migrations..."
docker-compose -p "$COMPOSE_PROJECT" --project-directory . -f "$COMPOSE_FILE" exec -T backend npm run db:migrate

# Sem "db:seed" aqui de propósito: o seeder de desenvolvimento
# (database/seeders/20260825110000-seed-usuario-dev.js) cria um usuário com
# credenciais fracas fixas (personal@dev.local / personal123) - nunca deve
# rodar em produção. O primeiro usuário real de produção é criado à parte
# (ainda não há um fluxo de cadastro/self-service neste MVP).

echo "[5/5] Limpando imagens antigas..."
docker image prune -f

echo "========================================"
echo " Deploy concluído com sucesso!"
echo "========================================"
