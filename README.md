# KART CAMPUS

Carrera arcade 3D multijugador en el navegador. Cliente Three.js y servidor
autoritativo Node.js + Socket.IO, con la misma física y reglas en ambos lados.

- Modo individual: 1 humano + 2 IA.
- Modo online: salas públicas/privadas, código de invitación, reconexión y
  migración de anfitrión.

## Requisitos

- Node.js 18 o superior.
- Navegador con WebGL.
- Opcional para los smoke tests: Chrome o Edge (o `CHROME_PATH`).

## Instalación

```bash
cp .env.example .env     # Windows: copy .env.example .env
npm install
```

## Uso

```bash
npm start
```

Abre `http://localhost:3000`. El servidor sirve el cliente, los módulos
compartidos (`/shared`), Three.js (`/vendor`) y Socket.IO desde el mismo origen.

Para desarrollo con recarga del servidor:

```bash
npm run dev
```

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm start` | Servidor en producción |
| `npm run dev` | Servidor con `--watch` |
| `npm test` | Tests unitarios y de integración |
| `npm run test:unit` | Solo unitarios |
| `npm run test:integration` | Solo integración |
| `npm run check` | Comprueba la sintaxis de todos los módulos |
| `npm run smoke` | Carga el cliente en Chrome headless |
| `npm run smoke:solo` | Carrera individual automatizada |
| `npm run smoke:online` | Crea una sala real |
| `npm run smoke:race` | Dos navegadores en la misma carrera |

Detalles en [docs/testing.md](docs/testing.md).

## Estructura

```
.
├── client/           # Cliente web (HTML, CSS y módulos ES)
│   ├── src/          # core, graphics, vehicles, multiplayer, ui...
│   └── styles/
├── server/src/       # HTTP, Socket.IO y simulación autoritativa
├── shared/           # Física, reglas, protocolo y geometría comunes
├── scripts/          # check-syntax y smoke tests con CDP
├── tests/            # unit y integration (node:test)
├── docs/             # despliegue y pruebas
├── legacy/           # Versión 1 monolítica, solo referencia
└── vendor/three/     # Three.js r128 local
```

El cliente importa `../../shared/...`, que en el navegador resuelve a `/shared`.
No hay copia de `shared/` dentro de `client/`.

## Configuración

Copia `.env.example` a `.env`. Variables principales: `PORT`, `HOST`,
`ALLOWED_ORIGIN`, `MAX_PLAYERS`, `MIN_HUMANS`, `RECONNECT_GRACE`,
`EMPTY_ROOM_TTL` y `SERVER_TICK_HZ`. Tabla completa en
[docs/deployment.md](docs/deployment.md).

## Licencia

MIT. Ver [LICENSE](LICENSE).
