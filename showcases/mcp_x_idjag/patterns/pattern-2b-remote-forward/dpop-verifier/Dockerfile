FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY proto ./proto
COPY src ./src
EXPOSE 8090 50051
CMD ["node", "src/index.js"]
