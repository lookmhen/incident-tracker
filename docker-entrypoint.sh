#!/bin/sh
set -e

# Ensure SQLite database directory is writable by nextjs user (local disk only)
mkdir -p /app/data
chown -R nextjs:nodejs /app/data 2>/dev/null || true
chmod -R 775 /app/data 2>/dev/null || true

# Upload folder (may be a Synology NFS mount; NEVER run recursive chown/chmod on NFS to avoid startup stalls)
mkdir -p /app/public/uploads
chown nextjs:nodejs /app/public/uploads 2>/dev/null || true

# Execute container command as unprivileged nextjs user
exec su-exec nextjs "$@"
