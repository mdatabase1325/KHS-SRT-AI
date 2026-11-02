# Use lightweight LTS Node.js image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Install dependencies first for Docker layer caching
COPY package*.json ./
RUN npm ci --only=production || npm install --production

# Copy application files
COPY . .

# Expose the server port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]

