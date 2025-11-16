# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
# Provide a build-time DB URL for prisma generate
ARG PRISMA_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres?schema=public"
ENV DATABASE_URL=${PRISMA_DATABASE_URL}

COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
# Match local behavior: relax peer deps
RUN npm config set legacy-peer-deps true
RUN if [ -f package-lock.json ]; then npm ci; \
    elif [ -f pnpm-lock.yaml ]; then corepack pnpm install --frozen-lockfile; \
    elif [ -f yarn.lock ]; then corepack yarn install --immutable; \
    else npm install; \
    fi

# Prisma generate (doesn't actually connect)
COPY prisma ./prisma
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate

FROM base AS builder
# Bring deps
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build backend -> must emit to ./dist
RUN npm run build
# Fail fast if build didn't emit the expected entry
RUN test -f dist/main.js

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

# Runtime artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./package.json

# Railway will set PORT; your app should use process.env.PORT
EXPOSE 3001
CMD ["npm", "run", "start:prod"]