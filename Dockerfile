# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json pnpm-lock.yaml* ./

# Install latest pnpm and build dependencies (including ffmpeg for audio processing)
RUN npm install -g pnpm@latest && \
    apk add --no-cache python3 make g++ ffmpeg opus-dev

# Install dependencies (including native modules that need compilation)
RUN pnpm install --force

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install latest pnpm and runtime dependencies
RUN npm install -g pnpm@latest && \
    apk add --no-cache ffmpeg opus

# Copy package files and installed dependencies from builder
COPY package*.json pnpm-lock.yaml* ./
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY . .

# Start the bot
CMD [ "node", "src/index.js" ]