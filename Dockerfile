FROM node:24-alpine AS web
RUN corepack enable && corepack prepare pnpm@11.28.5 --activate
WORKDIR /build/apps/web
COPY apps/web/package.json apps/web/pnpm-lock.yaml apps/web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --config.dangerouslyAllowAllBuilds=true
COPY apps/web ./
RUN pnpm run build

FROM node:24-alpine
RUN corepack enable && corepack prepare pnpm@11.28.5 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY services ./services
COPY scripts ./scripts
COPY --from=web /build/apps/web/dist ./apps/web/dist
RUN mkdir -p /app/data /app/config && chown -R node:node /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787
EXPOSE 8787
USER node
CMD ["node", "scripts/start.mjs", "--no-open"]
