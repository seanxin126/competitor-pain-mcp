# competitor-pain-mcp — stdio MCP server (Node 20, ESM, zero runtime deps)
FROM node:20-alpine

WORKDIR /app

# Dependencies first for better layer caching (no lockfile in this repo yet).
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Application source (index.js etc.); node_modules/.git excluded via .dockerignore
COPY . .

# Run as the unprivileged "node" user built into the official image
USER node

ENV NODE_ENV=production

CMD ["node", "index.js"]
