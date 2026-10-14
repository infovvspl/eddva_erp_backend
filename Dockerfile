# syntax=docker/dockerfile:1
# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# ── Stage 2: Production deps + generated Prisma client ───────────────────────
FROM node:20-bookworm-slim AS deps
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
# prisma CLI is a devDependency but is needed at runtime for `migrate deploy`.
COPY prisma ./prisma
RUN npm install --no-save --ignore-scripts "prisma@$(node -p "require('./package.json').devDependencies.prisma.replace(/^[^0-9]*/,'')")" \
    && npx prisma generate

# ── Stage 3: Runtime ─────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS production
WORKDIR /app

# Chromium for puppeteer (PDF generation), openssl for Prisma's engine,
# Noto fonts so generated PDFs render Indic scripts.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium openssl ca-certificates fonts-noto-core fonts-liberation tini \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/dist         ./dist
COPY prisma ./prisma
COPY package.json ./

# Upload dirs (modules write under ./uploads/<module>); mount a volume here.
RUN mkdir -p uploads && chown -R node:node /app
USER node

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main"]
