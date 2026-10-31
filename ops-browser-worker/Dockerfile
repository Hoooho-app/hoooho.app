FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /app/ops-browser-worker
COPY ops-browser-worker/package*.json ./
RUN npm ci --omit=dev
COPY ops-browser-worker/ ./
COPY server/ops/billing-page-reader.mjs /app/server/ops/billing-page-reader.mjs
COPY shared/ops-billing-catalog.mjs /app/shared/ops-billing-catalog.mjs
ENV NODE_ENV=production PORT=8080 CAPTURE_DATA_DIRECTORY=/profiles
EXPOSE 8080
CMD ["node","app.mjs"]
