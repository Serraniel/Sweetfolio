# syntax=docker/dockerfile:1.7
# ---- Build ----
FROM node:25-alpine AS build
WORKDIR /app
ARG APP_VERSION=0.0.0-dev
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run licenses:notices && APP_VERSION=${APP_VERSION} npm run build

# ---- Serve ----
FROM nginxinc/nginx-unprivileged:stable-alpine
ARG APP_VERSION=0.0.0-dev
LABEL org.opencontainers.image.title="Sweetfolio" \
      org.opencontainers.image.description="Client-side portfolio planning, backtesting, tracking and Monte Carlo simulation" \
      org.opencontainers.image.licenses="EUPL-1.2" \
      org.opencontainers.image.source="https://github.com/Serraniel/Sweetfolio" \
      org.opencontainers.image.version="${APP_VERSION}"
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
