# Vellum — zero-dependency Node runtime image.
FROM node:20-alpine

WORKDIR /app

# Only source is needed — Vellum has no npm dependencies.
COPY server-node ./server-node
COPY web ./web

ENV PORT=4321
ENV VELLUM_DB=/data/vellum-data.json

# Persist the workspace outside the container.
VOLUME ["/data"]

EXPOSE 4321

CMD ["node", "server-node/src/index.js"]
