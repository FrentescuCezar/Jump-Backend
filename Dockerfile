FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
ARG PRISMA_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres?schema=public"
ENV DATABASE_URL=${PRISMA_DATABASE_URL}
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN if [ -f package-lock.json ]; then npm ci --legacy-peer-deps; \
    elif [ -f pnpm-lock.yaml ]; then corepack pnpm install --frozen-lockfile; \
    elif [ -f yarn.lock ]; then corepack yarn install --immutable; \
    else npm install --legacy-peer-deps; \
    fi

COPY prisma ./prisma
# Set dummy DATABASE_URL for prisma generate (not actually used during generation)
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate

FROM deps AS builder
COPY . .
RUN npm run build
# Fail fast if build didn't emit the expected entry
RUN test -f dist/src/main.js || test -f dist/main.js || (echo "Build failed: expected dist/src/main.js or dist/main.js not found" && ls -la dist/ && exit 1)

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3001
# Use dist/src/main.js if it exists, otherwise fall back to dist/main.js
CMD ["sh", "-c", "if [ -f dist/src/main.js ]; then node dist/src/main.js; else node dist/main.js; fi"]


