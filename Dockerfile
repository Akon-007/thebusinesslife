FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY server ./server
ENV NODE_ENV=production PORT=4000 DB_PATH=/var/data/businesslife.db
EXPOSE 4000
CMD ["npm", "start"]
