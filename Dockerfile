FROM node:20-slim

WORKDIR /app

# Install native compilation dependencies for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

# Ensure storage directories exist
RUN mkdir -p /app/db /app/backups

ENV PORT=4200
ENV NODE_ENV=production

EXPOSE 4200

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4200/api/dashboard/overview || exit 1

CMD ["node", "server.js"]
