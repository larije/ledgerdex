FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S ledgerdex && adduser -S ledgerdex -G ledgerdex

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next/standalone  ./
COPY --from=builder /app/.next/static      ./.next/static
COPY --from=builder /app/public            ./public
COPY --from=builder /app/prisma            ./prisma
COPY --from=builder /app/src/generated     ./src/generated

RUN npm ci --only=production && npm install prisma @prisma/client bcryptjs

RUN mkdir -p uploads/documents uploads/attachments logs backups \
 && chown -R ledgerdex:ledgerdex /app

USER ledgerdex

EXPOSE 3100
CMD ["node", "server.js"]
