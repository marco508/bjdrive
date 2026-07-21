# API BjDrive (NestJS + Prisma)
FROM node:20-alpine
WORKDIR /app

# Dépendances système pour Prisma (OpenSSL) + bcrypt
RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

EXPOSE 3000
RUN chmod +x docker-entrypoint.sh
CMD ["./docker-entrypoint.sh"]
