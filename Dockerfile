# Stage 1: Build
FROM node:20-alpine AS build

# Install OpenSSL so Prisma can correctly detect it when generating the client
RUN apk add --no-cache openssl

WORKDIR /app/backend

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm install

# Copy Prisma schema
COPY backend/prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY backend/src ./src
COPY backend/tsconfig.json ./

# Build the application
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine

# Install OpenSSL so the Prisma engine can load its shared libraries at runtime
RUN apk add --no-cache openssl

WORKDIR /app

# Copy built application from build stage
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/prisma ./prisma
COPY --from=build /app/backend/package*.json ./

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "dist/main.js"]
