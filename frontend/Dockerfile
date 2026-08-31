# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Publish the built assets into the shared volume on every start.
# Copying at runtime (not just at image build) means a plain `docker compose
# up -d` with a new image refreshes the volume — no `docker volume rm` needed.
FROM alpine:latest
COPY --from=build /app/dist /opt/site
# Copy fresh assets in, then drop files from older builds that are no longer
# present (keeps the volume from growing without a hard wipe / race window).
CMD ["sh", "-c", "cp -a /opt/site/. /usr/share/nginx/html/ && find /usr/share/nginx/html -type f | while read f; do [ -e \"/opt/site/${f#/usr/share/nginx/html/}\" ] || rm -f \"$f\"; done && tail -f /dev/null"]