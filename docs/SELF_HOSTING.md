# Self-Hosting Sweetfolio

Sweetfolio is a static web application. The Docker image contains an nginx server that serves the pre-built SPA. There is no backend, database, or server-side processing required.

## Docker

### Quick Start

```bash
docker pull ghcr.io/serraniel/sweetfolio:latest
docker run -d -p 8080:80 ghcr.io/serraniel/sweetfolio:latest
```

The application will be available at `http://localhost:8080`.

### Docker Compose

```yaml
services:
  sweetfolio:
    image: ghcr.io/serraniel/sweetfolio:latest
    ports:
      - "8080:80"
    restart: unless-stopped
```

### Port Configuration

The container exposes port 80 internally. Map it to any host port:

```bash
docker run -d -p 3000:80 ghcr.io/serraniel/sweetfolio:latest
```

### Building from Source

```bash
git clone https://github.com/serraniel/sweetfolio.git
cd sweetfolio
docker build -t sweetfolio .
docker run -d -p 8080:80 sweetfolio
```

## Reverse Proxy

### nginx

```nginx
server {
    listen 443 ssl;
    server_name sweetfolio.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Docker Compose with Reverse Proxy

```yaml
services:
  sweetfolio:
    image: ghcr.io/serraniel/sweetfolio:latest
    restart: unless-stopped
    # No need to expose ports when using a reverse proxy on the same Docker network
    expose:
      - "80"

  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    volumes:
      - ./nginx-proxy.conf:/etc/nginx/conf.d/default.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - sweetfolio
    restart: unless-stopped
```

## Environment Variables

Sweetfolio is a fully client-side application. There are no server-side environment variables to configure. All settings (currency, theme, etc.) are managed in the browser via the settings page and stored in IndexedDB.

## Updating

Pull the latest image and restart:

```bash
docker pull ghcr.io/serraniel/sweetfolio:latest
docker compose up -d
```

Your data is stored in the browser's IndexedDB, not in the container. Updating the container does not affect your data.
