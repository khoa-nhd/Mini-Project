FROM mcr.microsoft.com/playwright:v1.64.1-noble

WORKDIR /app

# Copy package manifests for caching
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY server/package*.json ./server/
COPY web/package*.json ./web/

# Install all dependencies including dev for build
RUN npm install

# Copy source code
COPY packages/shared ./packages/shared
COPY server ./server

# Build shared first (the server consumes its compiled output), then the server
RUN npm run build --workspace=@quizgenerator/shared \
 && npm run build --workspace=@quizgenerator/server

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server/dist/index.js"]
