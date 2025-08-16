# Use Node 20 LTS with full Debian for better compatibility
FROM node:20

WORKDIR /app

# Copy package files (npm will work better for native modules in Docker)
COPY package*.json ./

# Install dependencies using npm (no security restrictions like pnpm)
RUN npm install --production

# Copy application code
COPY . .

# Start the bot
CMD [ "node", "src/index.js" ]