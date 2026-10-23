# Vendedores: revisión local aislada

Implementación sobre el pipeline existente `projects`. Antes existían administrador,
operador y trabajador; no había vendedor, asignación ni notas de seguimiento.

## Abrir en Windows

- Kevin: http://127.0.0.1:5190/__fixture/session?as=kevin
- Vendedor A: http://127.0.0.1:5190/__fixture/session?as=a
- Vendedor B: http://127.0.0.1:5190/__fixture/session?as=b
- Otra organización: http://127.0.0.1:5190/__fixture/session?as=other
- Trabajador: http://127.0.0.1:5190/__fixture/session?as=worker

Seleccionar identidad y pulsar `Enter test workspace`. Son identidades sintéticas,
no cuentas reales ni autenticación de correo. Cambiar identidad reemplaza la sesión
solo de este origen. Usar el Chrome autorizado de Kevin. El banner identifica el
entorno aislado. El proveedor IA es controlado: no hay llamadas OpenAI reales.

## Recorrido

1. Kevin ve tres leads de One Stop QA: vendedor A, vendedor B y Sin asignar.
   Abrir un lead para asignar/reasignar un vendedor de la misma organización.
2. Cambiar a A o B: solo aparece su pipeline asignado. Añadir una nota y recargar:
   se conserva el texto, autor y fecha. El historial incluye reasignaciones.
3. Abrir Estimados en el lead: crear un documento propio o ir al Cotizador online.
   Después de generar desde chat, volver al lead y vincular el estimado propio.
   No se usan claves foráneas de cliente/proyecto de otro propietario.
4. Kevin ve los documentos vinculados en modo de supervisión de solo lectura.
   Los vendedores editan y finalizan sus documentos/propuestas con el editor existente.

## Política de acceso y reasignación

- Vendedor: pipeline asignado, cotizador, estimados y propuestas propios.
  Sin trabajadores, horas, finanzas, contactos globales ni configuración.
- Asignación: solo un administrador/operador inscrito como manager de esa organización;
  no se deduce pertenencia por correo ni metadatos editables del usuario.
- Reasignar revoca inmediatamente el lead, sus datos actuales y notas al vendedor anterior.
  El nuevo vendedor ve el seguimiento, pero no los documentos del anterior.
- Los documentos anteriores siguen siendo propiedad de su autor. Su relación dinámica
  al lead es nula; conservan una copia estática del nombre/dirección guardada al vincular.
  No permiten volver a consultar el seguimiento actual. No se transfieren chats.
- Los documentos heredados con relación dinámica de cliente/proyecto no se vinculan
  a un lead nuevo: se requiere un documento independiente y se conserva intacto el original.
- Notas anexadas e inmutables, con autor/fecha del servidor; reenvíos del mismo ID
  no duplican la nota. Asignaciones usan una versión para detectar conflictos.
- SQL y API comprueban permisos independientemente del menú y de las rutas React.
  Las tablas nuevas tienen RLS y carecen de grants directos a anon/authenticated.
  Un gateway privado con comprobaciones explícitas expone operaciones acotadas.

## Evidencia reproducible

`npm test`: 214 pruebas / 51 archivos. Incluye separación entre organizaciones,
vendedores, rutas directas, API, RLS, sesiones revocadas, notas idempotentes,
documentos, finalización y conservación de permisos de administrador/trabajador.
Pruebas de componentes EN/ES verifican controles, navegación y recarga de notas.

`node scripts/sales-acceptance.mjs` prueba el servicio HTTP real en 8800 con datos
sintéticos persistentes. Es idempotente; el reporte queda en
`.local-review/sales/acceptance.json`, excluido de Git. La aceptación se repitió
tras reiniciar únicamente el servicio de vendedores y conservar su base.

IDs de revisión sintéticos:

- Conversación A: `cda5b13e-950c-4045-a147-3424a4e7b857`
- Estimado A: `7f04606d-b150-447e-82e5-7e7bb7e2c122`
- Documento B: `dfbee52e-3774-4e05-ba6c-5c2840743c42`

La revisión visual en Chrome y viewport móvil queda pendiente: el catálogo de
herramientas de este turno no expone control del navegador. No se sustituye por
afirmaciones basadas solo en HTTP o jsdom. El CSS incluye ajuste móvil, pero eso
no equivale a QA visual en dispositivo.

## Arranque y separación

`node scripts/sales-local-review.mjs` inicia 5190/8800 con PGlite persistente en
`.local-review/sales/database`. No usa credenciales privadas ni Supabase remoto.
No iniciar otra copia si esos puertos ya están activos.

Los entornos anteriores siguen separados: real 5173/8787, demo 5182/8792 y
OpenAI real con base aislada 5186/8796. No se cargó el estado de vendedores allí.
Netlify mantiene Stopped builds; no hubo push ni despliegue.

## Antes de producción

**No está activada la seguridad remota de vendedores.** `docs/local-sales-schema.sql`
es un borrador probado solo localmente, no una migración registrada/aplicada.
La interfaz nueva se activa únicamente con `VITE_LOCAL_SALES` en el harness aislado.

Una activación futura necesita revisión del SQL/RLS en Supabase de pruebas,
migración registrada mediante CLI, inscripción explícita de organización/manager/
vendedores y de los proyectos correctos, comprobación de sesiones reales, permisos
de servidor y supervisión dentro de organización. No se crean cuentas automáticamente.
El borrador conserva la unicidad histórica de administrador/operador y permite muchos
vendedores; no pretende resolver un rediseño general de múltiples administradores.
La creación de vendedores reales, permisos persistentes y cambios remotos requieren
su autorización específica. No aplicar el borrador a producción desde esta guía.
