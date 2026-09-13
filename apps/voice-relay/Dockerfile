FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/package.json
COPY packages/data/package.json ./packages/data/package.json
COPY apps/voice-relay/package.json ./apps/voice-relay/package.json
RUN pnpm install --filter @giokon/voice-relay... --frozen-lockfile --ignore-scripts
COPY packages/core/src ./packages/core/src
COPY packages/data/src ./packages/data/src
COPY apps/voice-relay/src ./apps/voice-relay/src
ENV VOICE_RELAY_BIND=0.0.0.0
ENV PORT=8080
USER node
EXPOSE 8080
CMD ["pnpm", "-F", "@giokon/voice-relay", "start"]
