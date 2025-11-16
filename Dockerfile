# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
# Provide a build-time DB URL for tools that expect DATABASE_URL
ARG PRISMA_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres?schema=public"
ENV DATABASE_URL=${PRISMA_DATABASE_URL}

COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./

# Make npm behave like local (ignore strict peer conflicts)
RUN npm config set legacy-peer-deps true

# Install deps (prefer lockfile when present)
RUN if [ -f package-lock.json ]; then npm ci; \
    elif [ -f pnpm-lock.yaml ]; then corepack pnpm install --frozen-lockfile; \
    elif [ -f yarn.lock ]; then corepack yarn install --immutable; \
    else npm install; \
    fi

# Prisma generate needs a DATABASE_URL but doesn't actually connect
COPY prisma ./prisma
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate

FROM deps AS builder
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

# Copy runtime artifacts
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Railway provides PORT; ensure your app reads process.env.PORT
EXPOSE 3001
CMD ["node", "dist/main.js"]