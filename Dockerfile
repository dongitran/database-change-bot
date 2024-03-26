FROM node:latest

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY dist/ ./dist/
COPY functions/ ./dist/functions/
COPY services/ ./dist/services/

EXPOSE 3000

CMD ["node", "dist/app.js"]
