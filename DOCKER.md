# Guia Docker - Ultrix Player

# Build
docker build -t ultrix-player .

# Executar (forma simples)
docker run -p 4200:4200 ultrix-player

# Executar (recomendado com docker-compose)
docker-compose up

# Acessar
http://localhost:4200


<!-- ************************************************************** -->

## 💡 Dicas para WSL + CMD

- Abra o Docker Desktop antes de usar os comandos
- Você pode usar os comandos tanto no CMD quanto no PowerShell
- Se a porta 4200 estiver em uso: `docker run -p 8080:4200 ultrix-player`

Está tudo pronto para containerizar e rodar sua aplicação! 🎉

<!-- *************************************************************************** -->

### Como Usar

#### 1. Build da imagem Docker
```bash
docker build -t ultrix-player .
```

#### 2. Executar container via docker-compose (Recomendado)
```bash
docker-compose up
```

Ou em background:
```bash
docker-compose up -d
```

#### 3. Executar container diretamente
```bash
docker run -p 4200:4200 --name ultrix-player ultrix-player
```

#### 4. Acessar a aplicação
```
http://localhost:4200
```

### Gerenciamento de Containers

#### Ver containers rodando
```bash
docker ps
```

#### Parar o container
```bash
docker stop ultrix-player
```

#### Remover o container
```bash
docker rm ultrix-player
```

#### Remover a imagem
```bash
docker rmi ultrix-player
```

#### Ver logs
```bash
docker logs ultrix-player
```

#### Ver logs em tempo real
```bash
docker logs -f ultrix-player
```

### Docker Compose

#### Parar serviços
```bash
docker-compose down
```

#### Rebuild e iniciar
```bash
docker-compose up --build
```

#### Remover volumes associados
```bash
docker-compose down -v
```

### Troubleshooting

#### Erro: "docker: command not found" no CMD
- Verifique se Docker Desktop está aberto
- Abra um novo terminal CMD

#### Erro: `error getting credentials` com `org.freedesktop.secrets`
Esse erro acontece quando o Docker no WSL tenta usar o helper `secretservice` sem um keyring ativo.

No WSL, remova o helper do arquivo `~/.docker/config.json`:

```bash
# 1) backup
cp ~/.docker/config.json ~/.docker/config.json.bak

# 2) abra e remova "credsStore" e "credHelpers"
nano ~/.docker/config.json
```

Deixe o arquivo assim (exemplo minimo):

```json
{
	"auths": {}
}
```

Depois rode:

```bash
docker pull node:20-alpine
docker build -t ultrix-player .
```

Se preferir, faça login novamente no Docker Hub:

```bash
docker login
```

#### Erro de build
```bash
# Limpar cache
docker system prune -a

# Tentar build novamente
docker build -t ultrix-player .
```

#### Porta 4200 já em uso
```bash
# Use outra porta
docker run -p 8080:4200 ultrix-player
```

### Estrutura dos arquivos

- **Dockerfile**: Configuração para produção (multi-stage build)
- **docker-compose.yml**: Orquestração de containers
- **.dockerignore**: Arquivos a serem ignorados durante build

### Performance

A imagem usa:
- Node Alpine (mais leve)
- Multi-stage build (reduz tamanho final)
- http-server com gzip (compressão de assets)
- Health check automático
