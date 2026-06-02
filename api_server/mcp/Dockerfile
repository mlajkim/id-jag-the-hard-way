FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY src ./src

RUN mkdir -p /app/certs

ENV PORT=8081
ENV UPSTREAM_BASE_URL=http://api-server.api.svc.cluster.local
ENV PUBLIC_BASE_URL=http://mcp-server.api.svc.cluster.local
ENV MCP_CERT_DIR=/app/certs

EXPOSE 8081

CMD ["./node_modules/.bin/tsx", "./src/index.ts"]
