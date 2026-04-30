FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

# For testing, we run the dev server. For production, change this to: RUN npm run build && CMD ["npm", "start"]
CMD ["npm", "run", "dev"]
