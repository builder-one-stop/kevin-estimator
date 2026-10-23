# Agenda y facturas internas: revisión local

Abrir http://127.0.0.1:5190/__fixture/session?as=kevin y pulsar Enter test workspace.
Identidades sintéticas alternativas: as=a, as=b, as=otherManager, as=other, as=worker.
Nunca son cuentas reales ni sesiones transferibles a Supabase productivo.

## Qué cambió

1. Se eliminó la factura de muestra y el progreso fijo. Búsqueda global, ayuda,
   novedades, presets, catálogo del menú e importación de contactos quedan desactivados
   o explicados cuando no tienen implementación. Las listas indican subtotal conocido
   y presupuesto preliminar cuando faltan precios/cantidades, sin mostrarlo como total final.
2. Configuración general incluye el editor comercial/IA existente. Usa la misma
   fuente `ai_settings` por cuenta, sin almacén paralelo. `/chat/settings` redirige a
   `/settings`. Idioma de documentos se elige por documento; no se afirma Inglés fijo.
3. Agenda interna persistente: lead/proyecto, responsable de la organización,
   fecha/hora Los Ángeles, título, notas, estado pendiente/completado y autoría.
   Kevin consulta su organización; el vendedor solo ve seguimientos dentro del lead
   actualmente asignado, sin menú de agenda global. Reasignaciones revocan el acceso anterior.
4. Facturas internas persistentes: copia del estimado fuente, versión y proyecto,
   partidas editables y cálculo determinista del servidor. Solo managers de la misma
   organización. Vendedores y trabajadores no acceden a menú ni operaciones financieras.

## Revisión simple

- Kevin: abrir Agenda, crear o editar seguimiento; luego revisar el mismo lead como A.
- Vendedor A: abrir QA lead A; ver notas y seguimientos. No tiene Agenda global ni Facturas.
- Kevin: abrir Facturas internas, elegir estimado y proyecto, crear borrador.
- Dejar precio/cantidad/impuesto vacíos: permanecen pendientes, fuera del subtotal
  conocido. Guardar sigue permitido. Completar importes explícitos para un total interno.
- Editar un registro en dos pestañas: el segundo guardado con versión antigua debe
  rechazarse y conservar el borrador, sin pisar el primer cambio. Actualizar la lista
  y abrir el registro permite revisar la versión actual.
- Un reintento exacto conserva request ID; no duplica seguimientos ni facturas.

Los horarios se almacenan como instantes UTC y se muestran en America/Los_Angeles,
incluyendo horario de verano. La entrada local inexistente o ambigua por cambio de
hora se explica y requiere otra hora; no se elige un desplazamiento silenciosamente.

## Límites explícitos

Facturas son documentos internos, **sin emisión legal, envío, cobro, numeración fiscal
ni procesador de pagos**. `internal_reviewed` significa revisión interna del documento,
no factura emitida ni aceptación del cliente. No se aplica ninguna tasa fiscal de
California. Impuesto vacío es pendiente; cero solo procede de entrada explícita del
usuario. Los supuestos del estimado fuente no se convierten en precios verificados.
La copia del origen permanece intacta cuando el estimado cambia posteriormente.

Agenda no sincroniza Google Calendar, no envía correo/SMS/push y no crea mensajes
externos. No se implementó importación de contactos. Se conservan cotizador, híbrido,
vendedores, trabajadores y sus permisos; no hay nuevas credenciales ni cuentas reales.

Persistencia: `.local-review/sales/database`, excluida de Git. SQL nuevo únicamente
en `docs/local-commercial-schema.sql`, probado en PGlite aislado. No se aplicó a
Supabase remoto. Las tablas tienen RLS y no tienen grants directos para usuarios;
un gateway privado valida sesión, organización, rol, lead, versión e idempotencia.

## Evidencia

- Suite final: **228 pruebas / 54 archivos**, lint limpio y build correcto.
  Persiste la advertencia previa de bundle principal mayor de 500 kB.
- `tests/ai/commercial.test.js`: SQL, roles, organización, concurrencia, duplicados,
  fuente inmutable, impuestos pendientes, cálculos y cambios de horario Los Ángeles.
- `tests/ai/commercialUi.test.jsx`: EN/ES, guardado incierto sin duplicar y edición
  de partidas/importes. `tests/ai/menuHonesty.test.jsx`: elimina mock y totales engañosos.
- `node scripts/commercial-acceptance.mjs`: aceptación HTTP idempotente, con reporte
  `.local-review/sales/commercial-acceptance.json`. Se repite después de reiniciar 5190/8800.
- Seguimiento QA: `945d4b63-04c4-4ee0-b5ac-1a77e235a055`.
- Factura QA: `a22f627f-6c6f-4c5b-88ca-76f8a2da8a4d`.

No hubo llamadas IA pagadas. El navegador Chrome y viewport móvil no se declararon
verificados: este turno no tiene herramientas de control del navegador. Hay pruebas
HTTP/componentes y estilos adaptables; no equivalen a inspección visual del dispositivo.

## Separación y producción

Los cuatro hitos comerciales completos se revisan en **5190/8800**. En 5173/Supabase
real y 5186 se comparten las correcciones generales de interfaz/configuración, pero
Agenda/Facturas no consultan tablas nuevas: explican que están en revisión aislada.
5186 conserva OpenAI real con base aislada; 5182 conserva proveedor controlado.

Antes de activar en producción: revisar y registrar migraciones de ventas/comercial,
validar en Supabase de pruebas y sus advisors, inscribir organización y cuentas de
forma autorizada, probar sesiones/RLS reales y decidir políticas de archivo/retención.
La referencia al estimado fuente se conserva: una factura interna impide borrar ese
origen sin una política posterior explícita de archivo. No aplicar SQL remoto desde
esta guía. No hubo push, merge, despliegue ni cambios Netlify.
