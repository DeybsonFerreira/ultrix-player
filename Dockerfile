# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar código-fonte
COPY . .

# Build da aplicação Angular
RUN npm run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Instalar um servidor HTTP simples para servir a app
RUN npm install -g http-server

# Copiar build da aplicação do estágio anterior
COPY --from=builder /app/dist/ultrix-player/browser ./dist

# Expor porta
EXPOSE 4200

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:4200/ || exit 1

# Comando para iniciar o servidor
CMD ["http-server", "dist", "-p", "4200", "--gzip", "-c-1"]
