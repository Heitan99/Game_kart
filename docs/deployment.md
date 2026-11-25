# Despliegue

## Variables de entorno

Copia `.env.example` a `.env` y ajusta:

| Variable | Descripción | Por defecto |
| --- | --- | --- |
| `PORT` | Puerto HTTP/WSS | `3000` |
| `HOST` | Interfaz de escucha | `0.0.0.0` |
| `ALLOWED_ORIGIN` | Orígenes CORS permitidos, separados por coma | `http://localhost:3000` |
| `NODE_ENV` | `development` o `production` | `development` |
| `RECONNECT_GRACE` | Segundos para reconectar (5–300) | `30` |
| `MAX_PLAYERS` | Humanos por sala (2–8) | `8` |
| `MIN_HUMANS` | Humanos mínimos para iniciar | `2` |
| `EMPTY_ROOM_TTL` | Vida de una sala vacía en segundos (10–3600) | `60` |
| `SERVER_TICK_HZ` | Cadencia del servidor; debe coincidir con `shared/GameConfig.js` | `60` |

## Producción

```bash
NODE_ENV=production PORT=3000 ALLOWED_ORIGIN=https://kartcampus.example.com npm start
```

Usa un gestor de procesos (`systemd`, `pm2`) para mantenerlo activo. Detrás de
un proxy inverso, `ALLOWED_ORIGIN` debe ser el dominio público exacto: Socket.IO
solo acepta los orígenes de esa lista.

## HTTPS y WebSockets

Socket.IO usa el mismo origen que la página; con HTTPS el transporte pasa a WSS.
Ejemplo con nginx:

```nginx
server {
  listen 443 ssl;
  server_name kartcampus.example.com;
  ssl_certificate     /etc/letsencrypt/live/kartcampus.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/kartcampus.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;
  }
}
```

## Estructura servida

El servidor expone desde la raíz del repo:

- `/` y `/src`, `/styles`: cliente (`client/`).
- `/shared`: módulos comunes.
- `/vendor`: Three.js local.
- `/socket.io`: transporte Socket.IO.
- `/health`: estado en JSON.

Todo se sirve desde el mismo proceso; no hay build estático separado. El
cliente usa rutas relativas para `vendor/` y resuelve `../../shared` a `/shared`,
así que no debe publicarse `client/` por separado.
