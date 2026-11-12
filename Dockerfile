# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/protocol packages/protocol

RUN npm ci

COPY tsconfig.json ./
COPY src src
COPY dashboard/public dashboard/public

RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime

RUN addgroup -g 10001 chatexport \
  && adduser -D -u 10001 -G chatexport chatexport

WORKDIR /app

ENV NODE_ENV=production \
    CHAT_EXPORT_HOME=/data \
    CHAT_EXPORT_HOST=0.0.0.0 \
    CHAT_EXPORT_PORT=8765

LABEL org.opencontainers.image.source="https://github.com/svergio/chat-export-server" \
      org.opencontainers.image.description="Local MCP server for Chat Export Chrome extension" \
      io.modelcontextprotocol.server.name="io.github.svergio/chat-export-server"

COPY --from=builder --chown=chatexport:chatexport /app /app

RUN mkdir -p /data && chown chatexport:chatexport /data

USER chatexport

EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8765/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# --stdio lets Glama / mcp-proxy introspect tools; HTTP /health still serves for HEALTHCHECK.
CMD ["node", "dist/cli/index.js", "start", "--stdio"]
