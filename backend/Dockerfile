FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
COPY src/db/schema.sql ./src/db/schema.sql
EXPOSE 3000
CMD ["node", "dist/index.js"]
