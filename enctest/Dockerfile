FROM node:16
ADD . /app
WORKDIR /app
RUN yarn
RUN yarn build
CMD ["node", "./lib/index.js", "-c", "/data/config.yaml", "-f", "/registration/registration.yml"]
