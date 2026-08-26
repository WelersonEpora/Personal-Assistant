FROM node:22-alpine

WORKDIR /app

COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node . .

# docs/adr/0010-armazenamento-arquivos-audio.md: o diretório precisa existir
# e pertencer ao usuário não-root ANTES do volume ser montado em produção -
# Docker inicializa um volume nomeado novo copiando o conteúdo/dono do
# diretório da imagem no ponto de montagem, na primeira vez que ele sobe.
RUN mkdir -p /app/storage/audio /app/storage/fotos && chown -R node:node /app/storage

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/server.js"]
