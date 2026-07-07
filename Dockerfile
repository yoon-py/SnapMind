FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run backend-core:build
RUN npm prune --omit=dev

ENV NODE_ENV=production

EXPOSE 8788

CMD ["node", "server/index.js"]
