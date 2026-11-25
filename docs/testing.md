# Pruebas

## Unitarias y de integración

```bash
npm test              # unit + integration
npm run test:unit
npm run test:integration
```

Usan `node:test`, sin framework externo. Los tests de integración levantan el
servidor en un puerto efímero y hablan con él por HTTP y Socket.IO.

## Sintaxis

```bash
npm run check
```

Ejecuta `node --check` sobre `client/src`, `server/src`, `shared`, `scripts` y
`tests`.

## Smoke tests

Requieren Chrome/Edge instalado y el servidor en `http://localhost:3000`
(`npm start` en otra terminal).

```bash
npm run smoke         # carga el cliente y detecta errores de consola
npm run smoke:solo    # arranca una carrera individual y conduce
npm run smoke:online  # crea una sala real y verifica el código
npm run smoke:race    # dos navegadores en la misma carrera
```

Si el navegador no está en una ruta estándar, define `CHROME_PATH`. Las capturas
`smoke*.png` se generan en la raíz y están ignoradas por Git.

Los scripts reciben una URL opcional:

```bash
node scripts/smoke.js http://localhost:3000/ salida.png
```

## Estado conocido

`tests/integration/server.test.js` busca `/vendor/three/three.min.js` en el HTML,
pero el cliente referencia `vendor/three/three.min.js` (relativo). El test falla
desde antes de la reorganización y no se tocó para no alterar el comportamiento.
