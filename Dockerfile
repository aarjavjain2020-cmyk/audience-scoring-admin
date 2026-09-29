FROM node:22-alpine
WORKDIR /app
COPY railway/package*.json ./railway/
RUN cd railway && npm ci --omit=dev
COPY railway ./railway
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "railway/server.mjs"]
