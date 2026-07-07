FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run backend-core:build

EXPOSE 8788

CMD ["node", "server/index.js"]
