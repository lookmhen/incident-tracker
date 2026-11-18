#!/bin/sh
set -e

# Ensure SQLite database directory and upload folder are writable by nextjs user
mkdir -p /app/data /app/public/uploads
chown -R nextjs:nodejs /app/data /app/public/uploads 2>/dev/null || true
chmod -R 775 /app/data /app/public/uploads 2>/dev/null || true

# Automatically synchronize Prisma schema with SQLite database (additive only, never deletes data)
if [ -f "/app/prisma/schema.prisma" ] && [ -d "/app/node_modules/prisma" ]; then
  echo "[entrypoint] Syncing database schema with prisma db push (safe non-destructive)..."
  su-exec nextjs node /app/node_modules/prisma/build/index.js db push --skip-generate || true
fi

# Execute container command as unprivileged nextjs user
exec su-exec nextjs "$@"
