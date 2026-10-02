# syntax = docker/dockerfile:1

ARG NODE_VERSION=26.10.0
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

WORKDIR /app

ENV NODE_ENV="production"

# Copy package manifests before installing the package manager and dependencies.
COPY --link .npmrc pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Install the package manager version pinned in package.json.
RUN npm install --global pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")

# Install dependencies before copying application code so this layer stays
# reusable until package.json or pnpm-lock.yaml changes.
FROM base AS dependencies

RUN pnpm install --frozen-lockfile --prod=false

# Produce a runtime-only dependency tree from the same clean install. This
# stage deliberately does not depend on application source, so code-only
# changes cannot invalidate the final image's node_modules layer.
FROM dependencies AS production-dependencies

RUN pnpm prune --prod

# Build stage
FROM dependencies AS build

COPY --link . .

RUN mkdir /data && pnpm build && \
    mv /app/node_modules /build-dependencies

# Final stage
FROM base

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y sqlite3 procps curl nano less ca-certificates && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Litestream for continuous database replication (see README → Automated backups)
ARG LITESTREAM_VERSION=0.5.17
ADD https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-x86_64.deb /tmp/litestream.deb
RUN dpkg -i /tmp/litestream.deb && rm /tmp/litestream.deb

# Keep the large dependency tree separate from the frequently changing
# application so registries and Docker's local image store can share it across
# code-only releases. The build stage moved its development dependencies out
# of /app, making the broad application copy below safe and omission-proof.
COPY --link --from=production-dependencies /app/node_modules /app/node_modules
COPY --link --from=build /app /app

# Copy .sqliterc for convenient sqlite3 CLI usage
COPY --link --from=build /app/.sqliterc /root/.sqliterc

RUN mkdir -p /data
VOLUME /data

EXPOSE 3000

CMD ["node", "/app/scripts/start-app.js"]
