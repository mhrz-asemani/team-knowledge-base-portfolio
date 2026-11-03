FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@12.15.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
RUN pnpm --filter @tkb/api build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
RUN npm install --global pnpm@12.15.0
COPY --from=build --chown=node:node /workspace /workspace
USER node
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @tkb/api db:migrate:up && exec node apps/api/dist/main.js"]
