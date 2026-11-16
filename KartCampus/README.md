# KART CAMPUS — Carrera arcade 3D multijugador online

Evolución del juego original **KART CAMPUS** (un único `index.html` con Three.js)
a un proyecto **profesional, modular y multiplataforma** con **multijugador
online real** (Node.js + Socket.IO, servidor autoritativo).

- **Cliente**: JavaScript ES6 modular + Three.js (r128, servido localmente).
- **Servidor**: Node.js + Express + Socket.IO, simulación autoritativa a 60 Hz.
- **Compartido**: la **misma** física y reglas se ejecutan en cliente y servidor.
- **Plataformas**: el mismo build web para **PC, tablet y móvil** (controles táctiles).
- **Modos**: individual (1 humano + 2 IA) y online (2–8 humanos + IA opcional).

> El juego single-player original se conserva intacto en la raíz del proyecto
> (`index.html` + `three.min.js`) como referencia y respaldo.

---

## 1. Características

- **Circuito 3D** generado proceduralmente (pista, isletas, edificios, árboles,
  farolas, césped, cielo y niebla) con materiales e iluminación mejorados.
- **3 karts con carácter**: física arcade (aceleración, frenada, reversa, césped),
  colisiones entre karts y **turbo de 2 s con recarga de 8 s**.
- **Reglas de carrera**: 4 checkpoints + meta, **3 vueltas**, validación en orden,
  anti-teletransporte y clasificación en vivo.
- **Multijugador online autoritativo**: salas públicas/privadas, **códigos de
  invitación únicos**, lobby con listo/anfitrión, relleno de IA opcional, arranque
  y cuenta atrás **sincronizados**.
- **Networking**: entradas del cliente (30 Hz) + snapshots del servidor (15 Hz),
  **predicción del jugador local con reconciliación suave**, **interpolación de
  remotas**, IDs de secuencia, sincronización de reloj, **reconexión por token**,
  manejo de desconexión (la IA conduce temporalmente) y **migración de anfitrión**.
- **Cross-platform**: UI responsive, controles táctiles con Pointer Events
  (multitouch), aviso de orientación, *safe areas*, pantalla completa y bloqueo
  de zoom/scroll.
- **Optimización móvil**: pixel ratio limitado, calidad adaptativa, sombras y
  distancia de dibujado ajustables, partículas escaladas.
- **Audio procedural** con WebAudio (motor, turbo, colisiones, ambiente); sin
  ficheros externos.
- **Seguridad**: validación y saneado de todos los eventos, limitación de tasa,
  CORS restringido, sin confianza en resultados del cliente, variables de entorno.

---

## 2. Arquitectura

```
KartCampus/
├─ index.html                 # Juego original single-player (preservado)
├─ three.min.js               # Three.js original (preservado)
├─ package.json               # Raíz (workspaces: server)
├─ .env.example               # Variables de entorno de ejemplo
│
├─ shared/                    # Lógica compartida cliente ⇄ servidor
│  ├─ GameConfig.js           #   Configuración, estados y utilidades
│  ├─ TrackGeometry.js        #   Geometría del circuito (muestreo/proyección)
│  ├─ Physics.js              #   Física arcade y turbo
│  ├─ RaceRules.js            #   Checkpoints, vueltas, clasificación
│  └─ Protocol.js             #   Eventos, saneado y snapshots compactos
│
├─ server/                    # Servidor autoritativo
│  ├─ package.json
│  └─ src/
│     ├─ server.js            #   HTTP + Socket.IO + estáticos + /health
│     ├─ SocketManager.js     #   Eventos, validación, rate-limit, reconexión
│     ├─ RoomManager.js       #   Salas, códigos, lobby, anfitrión, IA
│     ├─ RaceManager.js       #   Bucle de simulación y difusión
│     ├─ GameSimulation.js    #   Simulación autoritativa (usa shared/)
│     └─ PlayerManager.js     #   Identidad, tokens y colores
│
├─ client/                    # Cliente web (se sirve desde el servidor)
│  ├─ index.html
│  ├─ styles/{main,menu,mobile}.css
│  └─ src/
│     ├─ main.js
│     ├─ core/                #   Config, estado, bucle y orquestador
│     ├─ graphics/            #   Escena, render, cámara, pista, entorno
│     ├─ vehicles/            #   Kart, IA, jugador, karts remotos
│     ├─ physics/             #   Envoltorios de movimiento y colisión
│     ├─ multiplayer/         #   Red, salas, predicción, interpolación
│     ├─ controls/            #   Teclado y táctil (Pointer Events)
│     ├─ audio/               #   WebAudio procedural
│     ├─ track/               #   Circuito, checkpoints, carrera local
│     └─ ui/                  #   HUD, menú, lobby y resultados
│
├─ vendor/three/three.min.js  # Three.js r128 servido localmente
├─ scripts/                   # check-syntax + pruebas de humo (Chrome headless)
└─ tests/                     # Unitarias e integración (node:test)
```

**Autoridad del servidor**: el servidor es la única fuente de verdad de
posiciones, colisiones, checkpoints, vueltas, clasificación y resultados. El
cliente solo envía **entradas saneadas**; los resultados nunca se confían al
cliente.

---

## 3. Requisitos

- **Node.js ≥ 18** (probado con Node.js 24) y npm.
- Un navegador moderno con WebGL (Chrome, Edge, Firefox, Safari).

---

## 4. Instalación

```bash
cd KartCampus
npm install
```

Esto instala las dependencias del servidor (Express + Socket.IO) y, como
dependencia de desarrollo, `socket.io-client` (usado por las pruebas y el cliente
lo sirve el propio servidor en `/socket.io/socket.io.js`).

---

## 5. Ejecutar en local

```bash
npm start          # arranca el servidor en http://localhost:3000
# o, en desarrollo con recarga:
npm run dev
```

Abre `http://localhost:3000` en el navegador. Pulsa **JUGAR SOLO** para el modo
individual o **MULTIJUGADOR ONLINE** para crear/unirte a una sala.

Comprobación rápida del servidor:

```bash
curl http://localhost:3000/health
# {"ok":true,"name":"kart-campus", ...}
```

---

## 6. Cómo jugar

### Controles de teclado (PC)

| Tecla | Acción |
| --- | --- |
| `W` / `↑` | Acelerar |
| `S` / `↓` | Frenar / retroceder |
| `A` / `←` | Girar a la izquierda |
| `D` / `→` | Girar a la derecha |
| `Espacio` | **Turbo** (2 s, recarga 8 s) |
| `P` / `Esc` | Pausa / continuar |

### Controles táctiles (móvil/tablet)

Aparecen automáticamente en dispositivos táctiles: botones de **acelerar**,
**freno**, **turbo** y giro **◀ / ▶**, con soporte **multitouch** (acelerar y
girar a la vez). Gira el dispositivo en horizontal cuando se solicite.

### Flujo online

1. Escribe tu nombre y entra en **MULTIJUGADOR ONLINE**.
2. **Crear sala**: elige pública/privada y rivales IA de relleno. Obtendrás un
   **código** (p. ej. `NAR6E`) para compartir.
3. **Unirse**: introduce el código de 4–6 caracteres o pulsa una sala pública.
4. Los invitados pulsan **MARCAR LISTO**; el anfitrión pulsa **INICIAR CARRERA**
   (requiere ≥ 2 humanos y todos listos).
5. Cuenta atrás **3 · 2 · 1 · ¡YA!** sincronizada. Si un jugador se desconecta,
   su kart es conducido por IA hasta 30 s (reconexión con el token guardado) y,
   si el anfitrión se va, el control se transfiere al siguiente jugador.

---

## 7. Pruebas

```bash
npm test              # unitarias + integración (node:test)
npm run test:unit     # solo unitarias
npm run test:integration
npm run check         # comprobación de sintaxis de todos los módulos
```

Pruebas de humo con **Chrome headless** (cliente real; requiere el servidor
arrancado en `http://localhost:3000`):

```bash
npm run smoke         # carga el cliente, detecta errores JS y guarda captura
npm run smoke:solo    # arranca una carrera individual contra IA y conduce
npm run smoke:online  # recorre la UI: crea una sala real y verifica el código
npm run smoke:race    # DOS navegadores juegan la misma carrera y se sincronizan
```

### Resultado actual

```
npm run check   →  60 archivos, 0 errores
npm test        →  65 pruebas, 65 correctas (42 unitarias + 23 de integración)
npm run smoke         →  cliente OK, 0 errores de consola
npm run smoke:solo    →  3 karts en pista, carrera individual en marcha, 0 errores
npm run smoke:online  →  sala creada (código real), 0 errores
npm run smoke:race    →  2 navegadores en la misma carrera, sincronizados
```

### Matriz de cobertura de los 20 escenarios exigidos

| # | Escenario | Cómo se cubre | Estado |
| --- | --- | --- | --- |
| 1 | Arranque del servidor | `tests/integration/server.test.js` (`/health`, estáticos, `welcome`) | ✅ Automatizado |
| 2 | Dos equipos juegan | `smoke-race.js`: **2 navegadores** en la misma carrera (mismo host físico) | ✅ Verificado en local |
| 3 | PC + Android | — | ⚠️ **No probado en dispositivo real** |
| 4 | PC + iPhone | — | ⚠️ **No probado en dispositivo real** |
| 5 | Crear/unir sala | `tests/integration/rooms.test.js` | ✅ Automatizado |
| 6 | Códigos incorrectos | `rooms.test.js` (`ROOM_NOT_FOUND`, `BAD_CODE`) | ✅ Automatizado |
| 7 | Inicio/movimiento/turbo sincronizados | `sync.test.js` + `e2e.test.js` + `smoke-race.js` | ✅ Automatizado |
| 8 | Colisiones | `tests/unit/physics.test.js` (`resolveCollisions`) + sim autoritativa | ✅ Automatizado |
| 9 | Checkpoints y vueltas | `raceRules.test.js` + `gameSimulation.test.js` | ✅ Automatizado |
| 10 | Clasificación compartida | `e2e.test.js` (resultados idénticos en ambos clientes) | ✅ Automatizado |
| 11 | Desconexión / reconexión | `sync.test.js` (token) + `gameSimulation.test.js` (IA toma el control) | ✅ Automatizado |
| 12 | El anfitrión abandona | `rooms.test.js` (`host:changed`) | ✅ Automatizado |
| 13 | Fin de carrera | `e2e.test.js` (vuelta completa validada) | ✅ Automatizado |
| 14 | Resultados | `e2e.test.js` (posiciones 1..N, tiempos, vueltas) | ✅ Automatizado |
| 15 | Reinicio | `rooms.test.js` + `e2e.test.js` (reinicio tras finalizar) | ✅ Automatizado |
| 16 | Toque simultáneo | `tests/unit/touchControls.test.js` (multitouch) | ✅ Automatizado |
| 17 | Rendimiento en móvil | perfil de calidad (`detectQuality`) unitario | ⚠️ **No perfilado en dispositivo real** |

> **Nota de honestidad**: los escenarios "PC + Android" y "PC + iPhone" **no** se
> ejecutaron en dispositivos físicos; solo se verificaron el flujo, la lógica de
> red, los controles táctiles (vía API, sin DOM) y la adaptación responsiva. La
> comparativa de rendimiento en un móvil real queda pendiente.

---

## 8. Despliegue

### Variables de entorno

Copia `.env.example` a `.env` y ajústalas:

| Variable | Descripción | Por defecto |
| --- | --- | --- |
| `PORT` | Puerto HTTP/WSS | `3000` |
| `HOST` | Interfaz de escucha | `0.0.0.0` |
| `ALLOWED_ORIGIN` | Origen(es) CORS permitidos, separados por coma | `http://localhost:3000` |
| `NODE_ENV` | `development` \| `production` | `development` |
| `RECONNECT_GRACE` | Segundos de gracia para reconectar (5–300) | `30` |
| `MAX_PLAYERS` | Máximo de humanos por sala (2–8) | `8` |
| `EMPTY_ROOM_TTL` | Segundos antes de eliminar salas vacías (10–3600) | `60` |
| `MIN_HUMANS` | Mínimo de humanos para iniciar | `2` |

### Ejecución en producción

```bash
NODE_ENV=production PORT=3000 ALLOWED_ORIGIN=https://kartcampus.example.com npm start
```

Se recomienda un gestor de procesos (`pm2`, `systemd`) para mantenerlo activo.

### HTTPS / WSS y dominio

Socket.IO usa el **mismo origen** que la página; con HTTPS el transporte es
**WSS** automáticamente. Coloca un proxy inverso (nginx/Caddy) delante con
certificado TLS (Let's Encrypt) y **websockets habilitados**:

```nginx
server {
  listen 443 ssl;
  server_name kartcampus.example.com;
  ssl_certificate     /etc/letsencrypt/live/kartcampus.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/kartcampus.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;      # necesario para WebSocket
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Recuerda definir `ALLOWED_ORIGIN` con tu dominio exacto (`https://kartcampus.example.com`).

### Conexión desde el móvil

- **Misma red local**: arranca con `HOST=0.0.0.0` y abre
  `http://IP_LOCAL_DEL_PC:3000` en el móvil (averigua la IP con `ipconfig`).
- **Producción**: comparte la URL HTTPS pública; funcionará en cualquier red.
- **iOS/Android**: si vas a grabar la pantalla o usar almacenamiento, sirve
  siempre por **HTTPS** (algunas APIs lo requieren). La conexión del juego
  funciona igual por HTTP en LAN.

---

## 9. Seguridad

- Todos los eventos se **validan y sanean** en el servidor (`shared/Protocol.js`).
- **Rate limiting** por ventana deslizante: eventos (30/s), entradas (90/s).
- **Sin confianza en el cliente**: posiciones, checkpoints, vueltas y resultados
  los determina el servidor.
- **CORS restringido** por `ALLOWED_ORIGIN`; cabeceras `nosniff`, `SAMEORIGIN`,
  `no-referrer`; `maxHttpBufferSize` acotado.
- **Tokens de reconexión** aleatorios; secretos y configuración solo en el
  servidor (nunca en el cliente).

---

## 10. Rendimiento móvil

`client/src/core/Config.js#detectQuality()` elige un perfil según dispositivo:

- **Pixel ratio** limitado (máx. 2 en móvil).
- Sombras desactivadas y menor resolución de sombra en equipos modestos.
- **Distancia de dibujado** reducida y **partículas** escaladas.
- Cambio de calidad sin recargar (adaptativo según el dispositivo).

---

## 11. Solución de problemas

- **"No se pudo conectar al servidor"**: comprueba que el servidor está
  arrancado y que abres la página servida por él (`http://localhost:3000`), no el
  fichero `index.html` directamente (los módulos ES6 y Socket.IO requieren HTTP).
- **No aparecen salas**: verifica que creaste una **sala pública** o comparte el
  **código** para unirte directamente.
- **No inicia la carrera**: se necesitan **2 humanos** y que todos estén listos;
  si solo hay uno, añade rivales IA o espera a otro jugador.
- **El móvil no carga las texturas/JS**: sirve por HTTPS si el navegador bloquea
  contenido mixto, y asegúrate de no bloquear WebSockets en el proxy.

---

## 12. Limitaciones y notas honestas

- El multijugador se probó con **dos navegadores en el mismo equipo** y con
  clientes Socket.IO automatizados; **no** se probó entre dispositivos físicos
  distintos (PC + Android / PC + iPhone).
- El **rendimiento** en un móvil real no se midió con instrumentación; solo se
  aplicó un perfil de calidad adaptativo.
- Las capturas `smoke.png`, `smoke-online.png` son artefactos de las pruebas de
  humo y pueden regenerarse con `npm run smoke` / `npm run smoke:online`.
