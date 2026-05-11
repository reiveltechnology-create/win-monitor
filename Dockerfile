# WIN Monitor - Dockerfile para deploy em Coolify ou Docker padrão
FROM node:20-alpine

# wget para healthcheck
RUN apk add --no-cache wget

WORKDIR /app

# Copia manifesto primeiro (cache de layers)
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copia o restante do código
COPY . .

# Cria diretório de dados persistente
RUN mkdir -p /app/data

# Healthcheck pro Coolify saber que está vivo
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget --quiet --tries=1 --spider http://localhost:${PORT:-3030}/ || exit 1

EXPOSE 3030

CMD ["node", "src/server.js"]
