FROM node:26-alpine AS base
# libc6-compat + openssl are required by the Prisma query engine on Alpine.
# su-exec allows stepping down from root to nextjs after setting volume permissions.
RUN apk add --no-cache libc6-compat openssl su-exec

# 1. Install dependencies
FROM base AS deps
WORKDIR /app
# Copy the Prisma schema before `npm ci` because the `postinstall` script
# runs `prisma generate` (without the schema the install step fails).
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# 2. Build Next.js
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
RUN npx prisma generate
RUN npm run build

# 3. Production Runner (Pure Docker Standalone - No Apache)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
RUN mkdir -p .next /app/data /app/public/uploads
RUN chown -R nextjs:nodejs .next /app/data /app/public/uploads

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
