FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# "127.0.0.1", nunca "localhost": /etc/hosts da imagem resolve "localhost"
# para ::1 primeiro, e o nginx só escuta em IPv4 (listen 80) - com
# "localhost" o wget tenta IPv6 e falha com "Connection refused", mesmo
# com o nginx respondendo normalmente (achado real, ver docs/deploy.md).
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --spider -q http://127.0.0.1/ || exit 1
