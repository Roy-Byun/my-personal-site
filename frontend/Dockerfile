# Stage 1: Build
FROM node:20-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Provide files to the shared volume
FROM alpine:latest
WORKDIR /usr/share/nginx/html
# Copy from build stage to this stage's local folder
COPY --from=build /app/dist .
# Keep container alive so the volume remains accessible
CMD ["tail", "-f", "/dev/null"]