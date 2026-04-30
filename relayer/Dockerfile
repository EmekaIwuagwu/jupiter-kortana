FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose the API port (Render binds to the PORT env variable automatically)
ENV PORT=3001
EXPOSE 3001

# Start the relayer
CMD ["npm", "start"]
