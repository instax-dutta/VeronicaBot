FROM node:18-slim

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY src/ ./src/
COPY scripts/ ./scripts/
COPY data/ ./data/
COPY package.json ./

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

WORKDIR /app

CMD ["node", "--experimental-specifier-resolution=node", "src/index.js"]
