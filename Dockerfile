# Imagen de producción del monorepo.
#
# Se usa node:22-slim y no alpine a propósito: el puente serie depende de
# serialport, que publica binarios precompilados para glibc pero no para musl.
# Con alpine habría que compilarlo, lo que agrega compiladores a la imagen y
# una fuente de fallos que no vale la pena.
#
# Los paquetes se consumen desde TypeScript (su "main" apunta a src/index.ts) y
# se ejecutan con tsx, igual que en desarrollo. Así el código que corre en
# producción es exactamente el que se probó, sin un paso de compilación propio
# que pueda diferir.

FROM node:22-slim AS dependencias
WORKDIR /app
# Primero solo los manifiestos: si no cambian, la capa de dependencias se reutiliza
COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/
COPY packages/console/package.json packages/console/
COPY packages/db/package.json packages/db/
COPY packages/engine/package.json packages/engine/
COPY packages/pima-bridge/package.json packages/pima-bridge/
COPY packages/protocols/package.json packages/protocols/
COPY packages/receiver/package.json packages/receiver/
COPY packages/shared/package.json packages/shared/
COPY tools/simulator/package.json tools/simulator/
RUN npm ci --no-audit --no-fund

FROM dependencias AS fuente
COPY . .

# La consola se compila a archivos estáticos que sirve Caddy
FROM fuente AS consola
RUN npm run build -w @monitoring/console

# Servicios de Node: la API y el receptor comparten esta imagen y cambian el comando
FROM fuente AS app
ENV NODE_ENV=production
# Sin comando por defecto: cada servicio del compose declara el suyo,
# para que una imagen mal invocada falle a la vista y no arranque algo inesperado.
CMD ["node", "-e", "console.error('Indique el comando del servicio'); process.exit(1)"]

# Servidor web: la consola ya compilada, sin Node en la imagen final
FROM caddy:2-alpine AS web
COPY --from=consola /app/packages/console/dist /srv
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
