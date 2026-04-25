FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY src ./src
COPY database ./database

RUN npm install

EXPOSE 3002
CMD ["node", "src/index.js"]
