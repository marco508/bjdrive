# ---------- Étape 1 : build de l'application (Vite) ----------
FROM node:20-alpine AS build
WORKDIR /app

# Dépendances (couche mise en cache tant que package*.json ne change pas)
COPY package.json package-lock.json* ./
RUN npm ci

# Code source
COPY . .

# Variables injectées AU BUILD (Vite les intègre dans le bundle).
# Par défaut : API sur localhost:3007 (accès via le navigateur de l'hôte).
ARG VITE_API_URL="http://localhost:3007/api"
ARG VITE_SOCKET_URL="http://localhost:3007"
ARG VITE_KKIAPAY_PUBLIC_KEY=""
ARG VITE_GOOGLE_MAPS_API_KEY=""
ENV VITE_API_URL=$VITE_API_URL \
    VITE_SOCKET_URL=$VITE_SOCKET_URL \
    VITE_KKIAPAY_PUBLIC_KEY=$VITE_KKIAPAY_PUBLIC_KEY \
    VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY

RUN npm run build

# ---------- Étape 2 : image finale (Nginx, légère) ----------
FROM nginx:1.27-alpine AS runtime

# Config Nginx (fallback SPA + gzip + cache des assets)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Fichiers statiques construits
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Vérification de santé simple
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
