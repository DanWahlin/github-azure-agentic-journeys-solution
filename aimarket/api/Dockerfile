# AIMarket API — multi-stage build.
# The build stage compiles TypeScript and the native better-sqlite3 binding for
# the target platform; the final stage ships production artifacts only. Images
# MUST be built for linux/amd64 (Azure Container Apps) — this repo builds the API
# via azd remoteBuild (ACR native amd64), so no local ARM64 emulation is used.
FROM node:24-alpine AS build
WORKDIR /app

# Toolchain for better-sqlite3's native build (no Node 24 ABI prebuilt yet).
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune to production dependencies (keeps the compiled better-sqlite3 binding).
RUN npm prune --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
