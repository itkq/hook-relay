FROM public.ecr.aws/docker/library/node:24.22.1-slim AS builder

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

FROM public.ecr.aws/docker/library/node:24.22.1-slim

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml ./

RUN corepack enable && pnpm install --prod --frozen-lockfile

CMD ["node", "dist/server/index.js"]
