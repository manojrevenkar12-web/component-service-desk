FROM node:22.23-slim AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web ./
RUN npm run build

FROM node:22.23-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY config ./config
COPY db ./db
COPY demo ./demo
COPY knowledge ./knowledge
COPY prompts ./prompts
COPY reports ./reports
COPY src ./src
COPY tsconfig.json ./
COPY --from=web /app/web/dist ./web/dist
USER node
EXPOSE 8790
CMD ["npx", "tsx", "src/desk/service/main.ts"]
