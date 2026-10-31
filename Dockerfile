# Halloween Eyeballs: one small, dependency-free Node container.
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080 \
    HTTPS_PORT=8443 \
    DATA_DIR=/data

WORKDIR /app
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY public ./public

RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 8080 8443
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" > /dev/null || exit 1

CMD ["node", "server/index.js"]
