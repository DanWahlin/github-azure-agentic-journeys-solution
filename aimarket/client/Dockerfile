# AIMarket storefront — multi-stage build.
# The static Vite/esbuild build runs NATIVELY on the build host via
# $BUILDPLATFORM (esbuild ships no reliable emulated binary for ARM64->AMD64),
# while the final nginx runtime image targets the requested platform
# (linux/amd64 for Azure Container Apps). VITE_API_URL is baked in at build time.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
