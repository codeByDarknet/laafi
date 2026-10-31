# Image de l'application Angular « console » (console d'administration, servie sous /console/).
# Contexte de build : ./frontend (l'application importe ../shared : styles et polices partagés).
#   docker build -f infra/docker/console.Dockerfile frontend      (depuis la racine du dépôt)

# --- Étape 1 : compilation Angular -------------------------------------------
FROM node:24.22.2-alpine AS build
WORKDIR /app
ENV NG_CLI_ANALYTICS=false \
    NODE_OPTIONS=--max-old-space-size=2048
# Dépendances d'abord (cache Docker) ; npm ci installe les versions exactes du package-lock.json.
COPY console/package.json console/package-lock.json ./console/
RUN cd console && npm ci --no-audit --no-fund
# Le code partagé (../shared) résout ses imports npm via les node_modules de l'application.
RUN ln -s /app/console/node_modules /app/node_modules
COPY shared ./shared
COPY console ./console
WORKDIR /app/console
RUN npx ng build --configuration production --base-href /console/ \
 && mkdir -p /out \
 && if ls -d dist/*/browser >/dev/null 2>&1; then cp -r dist/*/browser/. /out/; else cp -r dist/*/. /out/; fi \
 && test -f /out/index.html

# --- Étape 2 : service statique (nginx interne, derrière la passerelle) --------
FROM nginx:1.30.6-alpine
RUN rm -f /etc/nginx/conf.d/default.conf
COPY <<'NGINX' /etc/nginx/conf.d/console.conf
server {
    listen 80;
    server_name _;
    server_tokens off;
    access_log off;
    root /usr/share/nginx/html;

    # Fichiers dont le nom contient un hash : cache long.
    location ~* \.(?:js|mjs|css|wasm|woff2?|ttf|svg|png|jpg|jpeg|webp|ico)$ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Routage côté client Angular : une URL inconnue renvoie index.html.
    location / {
        try_files $uri $uri/ /console/index.html;
        add_header Cache-Control "no-cache";
    }
}
NGINX
COPY --from=build /out /usr/share/nginx/html/console
EXPOSE 80
