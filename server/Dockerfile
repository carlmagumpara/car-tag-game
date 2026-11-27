FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY src/ ./src/

ENV PORT=3001

# Set CLIENT_ORIGINS at deploy time to the exact frontend origin(s).
EXPOSE 3001

CMD ["node", "src/index.js"]
