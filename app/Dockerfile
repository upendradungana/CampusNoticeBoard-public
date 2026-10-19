# app/Dockerfile
# Purpose: Build the Alpine-based, non-root Campus Notice Board image (one source tree, three release tags).
# Build command: docker build --build-arg VERSION=<version> -t notice-board:02230158-<version> app
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /usr/src/app

COPY server.js .

EXPOSE 8080

# Release version baked into the image; server.js reads it as APP_VERSION
ARG VERSION=1.0.0
ENV APP_VERSION=$VERSION

# Non-root user shipped with the node image (required by Task 2.1)
USER node

CMD ["node", "server.js"]
