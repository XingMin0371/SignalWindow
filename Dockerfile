FROM node:24-alpine AS web
WORKDIR /build/apps/web
COPY apps/web/package.json ./
RUN npm install --no-audit --no-fund
COPY apps/web ./
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY services ./services
COPY apps ./apps
COPY --from=web /build/apps/web/dist ./apps/web/dist
ENV HOST=0.0.0.0
ENV PORT=8787
EXPOSE 8787
CMD ["node", "services/gateway/src/index.mjs"]
