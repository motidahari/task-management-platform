FROM node:22-alpine AS build
ARG VITE_API_URL
ARG VITE_REALTIME_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_REALTIME_URL=$VITE_REALTIME_URL
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build -w frontend-application/task-app

FROM nginx:1.27-alpine AS runtime
COPY docker/frontend-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend-application/task-app/dist /usr/share/nginx/html
EXPOSE 80
