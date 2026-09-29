FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/
RUN npm ci --workspace=@skillaz/worker
COPY apps/worker ./apps/worker
WORKDIR /app/apps/worker
CMD ["npx", "ts-node", "--transpile-only", "src/index.ts"]
