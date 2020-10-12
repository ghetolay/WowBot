FROM node:current-alpine as builder

RUN apk add --no-cache python make g++
RUN npm install zlib-sync erlpack bufferutil utf-8-validate

FROM node:alpine as app

WORKDIR /home/node/app
ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
ENV NODE_ENV=production

COPY --from=builder node_modules .
COPY package*.json ./

RUN npm install --production

COPY $CONFIG_PATH .
COPY /build/. .

USER node
CMD ["node", "index.js"]

