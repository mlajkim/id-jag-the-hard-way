FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src

ENV NODE_ENV=production PORT=8080
USER node
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "src/index.ts"]
