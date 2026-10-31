# Self-hosting

Sweetfolio is a static site. The Docker image serves it with an unprivileged nginx on **port 8080**.

```bash
docker run -d --name sweetfolio -p 8080:8080 --read-only --tmpfs /tmp ghcr.io/serraniel/sweetfolio:latest
```

or with `docker compose up -d` using the bundled [docker-compose.yml](../docker-compose.yml).

## Image tags

| Tag                 | Meaning                                   |
| ------------------- | ----------------------------------------- |
| `latest`            | Latest release                            |
| `X.Y.Z`, `X.Y`, `X` | Specific release (major tags from 1.0 on) |
| `edge`              | Newest build of `main` (may be unstable)  |
| `edge-<sha>`        | A specific `main` commit                  |

Images are built for `linux/amd64` and `linux/arm64`.

> **Upgrading from ≤ 0.5.x:** the container now listens on port **8080** instead of 80 (it runs as non-root). Change your port mapping from `-p X:80` to `-p X:8080`.

## Runtime configuration

Mount a `config.json` to `/usr/share/nginx/html/config.json`:

```json
{
	"parqetClientId": "",
	"parqetScope": "portfolio:read"
}
```

- `parqetClientId` — enables Parqet Connect. Register an OAuth client with Parqet and add `https://<your-host>/callback` as redirect URI.

## Reverse proxy

Serve over HTTPS (clipboard, Web Share and the File System Access API require a secure context). The image sends security headers including a Content-Security-Policy that allows outbound `https:` connections, because price data, ECB rates, Parqet and an optional user-configured CORS proxy are called directly from the browser.

Health check endpoint: `/healthz`.

## Building yourself

```bash
docker build --build-arg APP_VERSION=1.2.3 -t sweetfolio .
# or without Docker
npm ci && npm run build   # static files in build/ — serve with any web server using index.html as SPA fallback
```
