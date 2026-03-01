FROM node:22-alpine AS build
ARG APP_VERSION=0.0.0
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run generate:notices
RUN APP_VERSION=$APP_VERSION npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
