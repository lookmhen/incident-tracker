#!/bin/sh
set -e

# Ensure SQLite database directory and upload folder are writable by nextjs user
mkdir -p /app/data /app/public/uploads
chown -R nextjs:nodejs /app/data /app/public/uploads 2>/dev/null || true
chmod -R 775 /app/data /app/public/uploads 2>/dev/null || true

# Execute container command as unprivileged nextjs user
exec su-exec nextjs "$@"
