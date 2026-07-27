# API BjDrive (NestJS + Prisma)
FROM node:20-alpine
WORKDIR /app

# Dépendances système pour Prisma (OpenSSL) + bcrypt
RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# Répertoire des images uploadées (monter un volume dessus pour les conserver)
RUN mkdir -p /app/uploads

EXPOSE 3007

# Vérification de santé : API + base de données (endpoint /api/health)
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3007}/api/health" | grep -q '"ok":true' || exit 1

RUN chmod +x docker-entrypoint.sh
CMD ["./docker-entrypoint.sh"]
