#!/bin/sh
set -e

echo "Installing dependencies..."
npm install

echo "Prisma generate..."
npx prisma generate

echo "NODE_ENV is set to $NODE_ENV"

if [ "$NODE_ENV" = "local" ] || [ "$NODE_ENV" = "development" ]; then
  echo "Running development mode..."
  # Push schema to database (creates tables if they don't exist)
  echo "Pushing Prisma schema to database..."
  npx prisma db push --accept-data-loss || echo "Database push failed or database not available"
  npm run start:dev
elif [ "$NODE_ENV" = "staging" ]; then
  echo "Running staging mode..."
  npm run build
  npx prisma migrate deploy
  npm run start:prod
elif [ "$NODE_ENV" = "production" ]; then
  echo "Running production mode..."
  npm run build
  npx prisma migrate deploy
  npm run start:prod
else
  echo "NODE_ENV not set → defaulting to dev"
  echo "Pushing Prisma schema to database..."
  npx prisma db push --accept-data-loss || echo "Database push failed or database not available"
  npm run start:dev
fi

