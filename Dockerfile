FROM node:22-bookworm-slim

WORKDIR /app

# Install root dependencies
COPY package*.json ./
RUN npm ci

# Install frontend dependencies
COPY web/package*.json ./web/
RUN cd web && npm ci

# Copy source code
COPY . .

# Build backend and frontend
RUN npm run backend-core:build
RUN cd web && npm run build
RUN npm prune --omit=dev
RUN cd web && npm prune --omit=dev

ENV NODE_ENV=production

EXPOSE 8788

CMD ["node", "server/index.js"]
