FROM node:24-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install --include=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/tsconfig.json ./tsconfig.json

EXPOSE ${PORT:-3001}
ENV NODE_ENV=production
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]

