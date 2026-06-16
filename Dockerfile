FROM mcr.microsoft.com/playwright/node:20-jammy

WORKDIR /app

COPY package*.json ./

RUN npm install

RUN npx playwright install chromium

COPY . .

EXPOSE 3000

CMD ["node", "backend/server.js"]
