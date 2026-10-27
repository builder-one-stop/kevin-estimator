# Preparación independiente del chat móvil

Base: `732d08dfe0c476ec7c52d9427e67c957b5b6bec1`.
Rama: `feat/mobile-chat-20261027`.
Worktree: `C:\Users\ricar\Documents\Codex\2026-10-27\task\mobile-chat-worktree`.

Preparado para revisar e integrar **después** del release de vendedores. No se hizo push, deploy, SQL remoto, creación de cuentas ni cambios de permisos o claves. No se integró el worktree de precios (`91b0db7469c0eaa1bcae5ff2a92a58443881aa4e`). No se tocó Psicología/App Constructores. No hay video ni fuente de precios nueva.

## Inspección y alcance

No se encontraron `AGENTS.md` ni `.agents/skills` en el checkout original ni instrucciones AGENTS en sus ancestros `C:\Desarrollo` y `C:\`. Ya existían compositor fijo, polling/preview público, cancelación, historial accesible, borradores y outbox con recibos idempotentes, edición del estimado y recuperación. El prompt existente pide como máximo dos preguntas esenciales, avance con supuestos visibles/editables, precios provisionales sin verificación inventada y conservación de ediciones manuales. Se conservaron esas reglas y funcionalidades.

La configuración local del proveedor indica `OPENAI_MODEL=gpt-6.1-sol`, `OPENAI_REASONING_EFFORT=medium`, coincidiendo con el valor por defecto de `server/openai.js`. Solo se leyeron esos campos; no se copiaron secretos ni se hizo una llamada real. No se comprobó la configuración del despliegue remoto.

## Cambios

- Estado de conexión separado de errores de comandos: al fallar la lectura del servidor se informa que no se puede confirmar el estado, se detiene el indicador de actividad y se ofrece reconexión; el polling recupera automáticamente.
- Confirmación accesible de respuesta guardada, sin afirmar que todo el estimado o sus precios estén aprobados. Etapas públicas existentes del servidor, sin porcentajes, temporizadores ficticios ni razonamiento interno.
- Anillo de actividad decorativo acompañado de `role=status`; respeta movimiento reducido.
- Bloqueo síncrono durante todo el envío/reintento, incluida la lectura previa de recibos. Conserva el identificador original para recuperación sin duplicar mensajes.
- Altura del chat adaptada a `visualViewport` mientras está montado, con limpieza al navegar; controles móviles de 44 px y ajuste de toolbar. Se conserva la posición de lectura y se notifica también la transición de estado de ejecución.
- Corrección de contraste detectada en QA: compositor, texto, mensajes del usuario e indicador usan las variables del tema actual en vez de fondos oscuros heredados sobre texto oscuro.
- Prueba de navegador actualizada para el componente real (el selector anterior `.ai-activity` estaba obsoleto), errores/reintentos/cancelación y reconexión EN/ES.

## Verificación reproducible

Dependencias fijadas instaladas con `npm ci --ignore-scripts --offline --cache C:/Users/ricar/AppData/Local/npm-cache --no-audit --no-fund`. La instalación inicial sin esa caché falló por DNS restringido; no cambió el lockfile.

- `npm run lint`: pasa, sin advertencias.
- `npx vite build`: pasa. Advertencia existente de bundle superior a 500 kB.
- `npm test -- --maxWorkers=2 --reporter=default --reporter=json --outputFile=evidence/mobile-chat-20261027/unit-results.json`, con `VITE_SUPABASE_URL=http://127.0.0.1:8794/test-supabase` y `VITE_SUPABASE_ANON_KEY=fixture-public-key`, exclusivamente sintéticos: **63 archivos, 279 pruebas, todo pasa**. Resultado definitivo en el JSON adjunto. Incluye límites del prompt, texto público, idempotencia, cancelación, recuperación y conservación de cambios manuales.
- `npm run test:chat:browser`, con `LOCAL_REVIEW_PORT=5184`, `LOCAL_REVIEW_API_PORT=8794`, `CHAT_BROWSER_EVIDENCE_DIR=evidence/mobile-chat-20261027`: Chrome real headless, 1440×1000 y 390×844, base local aislada y proveedor controlado. Ocho grupos de comprobaciones, cero errores. Capturas inspeccionadas visualmente.
- `git diff --check`: pasa.

El sandbox inicial bloqueaba loopback de Chrome/HTTP y temporales de Vitest; esas pruebas se ejecutaron con acceso al entorno local. La suite sin variables públicas tenía cuatro errores de importación; se suministraron valores sintéticos únicamente al proceso de prueba.

## Límites y próximos pasos

`npm run build` se detiene correctamente en el control de configuración pública del release: el worktree no tiene configuración de producción. La configuración local del checkout original tampoco coincide con el destino público de release esperado. No se alteró ni se eludió ese control; `npx vite build` comprueba solo la compilación del código y no autoriza publicación.

WebKit/Safari omitido porque su ejecutable no está instalado. El teclado se comprobó reduciendo el viewport a 390×600 y enfocando el compositor; falta QA en teclado físico iOS/Android, zoom y safe areas reales. No se probó servicio remoto, latencia real, modelo real, autenticación por correo ni la migración remota pendiente. El harness emite advertencias por notificaciones de trabajadores no implementadas en su adaptador, ajenas al chat.

Contexto futuro conservado: Kevin tiene base en Lawndale y obras hacia la costa sur/Palos Verdes; ubicación de obra y sucursal de compra son conceptos distintos. No se hardcodeó ese contexto ni se lo trató como evidencia de precios.

El checkout de vendedores sigue en la base original y conserva únicamente su cambio ajeno en `scripts/ai-browser.mjs` (10 inserciones, 3 eliminaciones, como modificación local). Integrar este commit solo cuando se resuelva el release anterior y se revise la integración de precios por separado.
