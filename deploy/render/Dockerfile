# Build only the clean directory produced by prepare-package.mjs.
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pil ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json render-entrypoint.mjs ./
COPY dist ./dist
COPY server ./server
COPY scripts ./scripts
COPY src ./src
ENV NODE_ENV=production APP_ROOT=/app APP_HOST=0.0.0.0 \
    APP_DATA_DIR=/var/data/runtime APP_PRIVATE_DIR=/var/data/private \
    APP_COOKIE_SECURE=true APP_TRUST_PROXY=true \
    PYTHON_COMMAND=python3 PYTHONDONTWRITEBYTECODE=1 \
    TZ=America/Argentina/Buenos_Aires GUARDIA_MODE=preparacion
EXPOSE 10000
CMD ["node", "render-entrypoint.mjs"]
