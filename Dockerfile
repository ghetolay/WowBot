FROM node:current-alpine as builder

WORKDIR /app

RUN apk add --no-cache python make g++
RUN npm install zlib-sync erlpack bufferutil utf-8-validate

FROM node:alpine as app

WORKDIR /home/node/app
ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
ENV NODE_ENV=production

COPY package*.json ./

RUN npm install --production

COPY --from=builder /app/node_modules ./node_modules
# COPY $CONFIG_PATH . // not working using file name directly for the moment
COPY config.json .
COPY /build/. .

USER node
CMD ["node", "index.js"]

