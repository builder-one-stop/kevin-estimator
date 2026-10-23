# One Stop: candidato de publicación — estado vigente 23 octubre 2026

Este apartado sustituye los estados históricos conservados más abajo.

- Migración remota registrada y aplicada: 20261023180600_one_stop_sales_commercial_hybrid_costs, proyecto vtpciccluvpaclbeqxih. Dos cuentas existentes verificadas e inscritas como gestores de One Stop; roles beta admin/operator preservados. Sin usuarios nuevos ni conversión de trabajadores. Conteos y hashes de datos existentes comprobados sin cambios tras la migración.
- Runtime productivo: membresía activa, supervisión organizacional, aislamiento de vendedor, cuatro trabajos híbridos y costos durables. Lectura real de roles, revisión y estimado QA aprobada; propietario del QA es admin. Las pruebas locales de vendedores no equivalen a cuentas vendedoras reales existentes.
- Netlify CLI 27.14.2 autorizada y autenticada en builderonestop44@gmail.com; sitio onestop-beta ce81887b-c941-40c3-8da4-13d6fc833290. Builds automáticos Stopped. Cuatro flags de capacidad true en production, persistencia comprobada, alcance predeterminado incluido en Personal. El intento anterior con scopes específicos recibió 403; no cambiar plan.
- 257 pruebas / 60 archivos aprobados; lint y build Netlify aprobados. ZIP finales incluyen Sharp/libvips Linux ELF x64 cuando corresponden. Sin claves privadas comprobadas ni fixtures en ZIP/dist. Carga real de binarios en Netlify pendiente de despliegue.
- QA en http://localhost:5173 con sesión legítima: banner sintético ausente; biblioteca 58 referencias, 49 con precio, 9 pendientes, 0 LA verificadas; finalización y contraste corregidos. Una consulta sintética en conversación QA existente respondió y persistió; estimado rev8 intacto. Scroll final puede dejar respuesta fuera de viewport.
- No se ha hecho commit, push ni deploy al redactar este estado. Publicación manual autorizada después de verificar artefacto; revisar online antes de declarar disponibilidad completa. No reejecutar migración ni crear registros de prueba reales adicionales.
- Configuración privada y datos locales ignorados y no rastreados. El build requiere configuración pública real explícita; nunca publicar el fixture de .env.local. scripts/ai-browser.mjs contiene cambios ajenos y queda fuera del commit.

## Registro histórico — NO describe el estado actual ni autoriza repetir operaciones

# One Stop: integración antes de publicación

Estado comprobado 23 de octubre de 2026. Este documento no autoriza ni acredita migraciones remotas.

## Actualización: adaptación productiva siguiente

La autorización puntual del usuario para el alcance Supabase ya llegó. **No se ha aplicado**: `supabase_execute_sql` fue denegado con «You do not have permission to perform this action», incluida una única repetición tras la nueva autorización. La consulta de migraciones también fue denegada. No se intentaron rutas alternativas para eludirlo. Identidades/correos actuales y esquema remoto siguen sin verificar.

Se implementaron localmente el repositorio con membresía activa, la supervisión por organización, protección de enlaces dinámicos para vendedor, el almacén durable de costos vía RPC y capacidades de frontend separadas de fixtures. El borrador transaccional completo está en `production-release-schema.sql`, con funciones de finalización explícitas, RLS, permisos de funciones y alta de nuevos leads sin asignación. No contiene cuentas ni datos sintéticos. La inscripción de las dos cuentas y el mapa de leads históricos deben añadirse dentro de la misma transacción **después de confirmar identidades y esquema**; no aplicar el borrador solo.

El padre recuperó la sesión Netlify correcta y confirmó Stopped builds, publicación manual CLI/API admitida y 1000 créditos de plan disponibles. No hay bloqueo de saldo acreditado. El trabajo pendiente es acceso SQL legítimo, integración/inscripción remota validada, registro formal de migración y QA real antes de la publicación manual.

## Revisión actual

- Checkout Windows `C:\Desarrollo\kevin-estimator`, rama `feat/ai-estimator-approved-plan`, HEAD `8252150e6002fac7acb694f592d03f2198731eaa`. Antes del hito: 137 rutas pendientes, incluidas modificaciones ajenas en `scripts/ai-browser.mjs`, que deben quedar fuera del commit de esta tarea.
- Lectura REST autenticada del proyecto `vtpciccluvpaclbeqxih`: dos cuentas beta, una `admin` y una `operator`. No se han creado usuarios, ni leído contraseñas, ni modificado roles.
- REST devuelve 404 para `sales_organizations`, `sales_memberships`, `sales_project_access`, `commercial_followups` y `commercial_invoices`. Esto prueba indisponibilidad en la API consultada; no sustituye inspección SQL del esquema, permisos y caché de PostgREST.
- Los SQL de vendedores/comercial están en `docs/local-sales-schema.sql` y `docs/local-commercial-schema.sql`, probados en PGlite. No están registrados ni aplicados como migraciones remotas. El registro histórico termina en el módulo de trabajadores/localización.
- `.env.local` apunta al fixture local. El launcher real obtiene configuración pública independiente. Un build sin configuración explícita de producción podía apuntar al fixture: el nuevo control lo rechaza. No modificar ese archivo a ciegas ni copiar claves privadas al frontend.
- Archivos privados esperados ignorados y no rastreados; búsqueda por igualdad en memoria de sus valores privados contra el artefacto anterior: ninguna coincidencia. Ningún dato `.local-review`/`.netlify` rastreado. Repetir comprobación tras el artefacto definitivo.
- GitHub conectado verificado como `builderonestop44-blip`, acceso al repositorio `builder-one-stop/kevin-estimator`. No implica autenticación CLI ni sesión de Chrome/Netlify.
- CLI Netlify/Supabase no disponibles; herramientas de navegador/Netlify no disponibles en este entorno. No se ha revalidado la configuración remota de builds ni crédito. Mantener el estado Stopped builds previamente establecido.

## Integración de código de este hito

- `HybridWorkProvider`: contrato común de los cuatro trabajos y cálculo determinista, sin importar el proveedor aislado ni habilitar identidades sintéticas. Las fotos, cambios en chat y planes previos conservan el procesamiento existente. No representa soporte determinista para trabajos fuera del contrato; éstos conservan partidas preliminares pendientes.
- Runtime permite seleccionar el proveedor con `ONE_STOP_HYBRID_ENABLED=true`. No se ha activado el flag remoto. La biblioteca pública versionada queda disponible por rutas autenticadas sin `testMode`; no accede a catálogos privados ajenos y no promete verificación LA.
- Frontend permite `VITE_SALES_ENABLED=true` como capacidad separada. El flag de revisión `VITE_LOCAL_SALES` se restringe al desarrollo. No activar vendedores antes de completar autorización y migraciones.
- El build valida destino público, tipo de clave pública y ausencia de variables privadas o flags de fixture. No cambia credenciales ni las muestra. La validación no sustituye una inspección del bundle ni pruebas de backend desplegado.

## Confirmación puntual requerida antes de acceso real

Destino único: Supabase `vtpciccluvpaclbeqxih`, One Stop. Preparar un plan SQL revisable con transacción, precondiciones y comprobaciones de aislamiento; nunca ejecutar las semillas locales.

1. Autorizar el nuevo rol `seller`, tablas de organización/membresías/asignaciones/notas/enlaces de documentos y sus funciones/RLS. Vendedor sólo accede a leads asignados y documentos propios; reasignación revoca lead/notas previos y conserva únicamente snapshot estático propio. Trabajadores no reciben acceso comercial.
2. Autorizar inscripción de las cuentas existentes: admin `85774372-1860-4b0d-af62-a912982694cd` y operador `3c444217-9936-4f09-a85b-1f541b7359fc` en una organización One Stop, tras confirmar que corresponden a las identidades previstas. Preservar IDs/owners. Leads históricos se vinculan sólo con mapa explícito por propietario, inicialmente sin vendedor. Ninguna cuenta nueva ni conversión de trabajadores a vendedores.
3. Autorizar tablas/RLS/RPC de seguimientos y facturas internas, con acceso global limitado a gestores de esa organización y seguimiento del lead asignado para vendedor. Sin envío, cobro o emisión fiscal.
4. Autorizar almacenamiento durable de costos reales por propietario/estimado y funciones de acceso idempotentes. El JSON local no es almacenamiento productivo y no debe migrarse con datos sintéticos.

Estas acciones permanecen pendientes de confirmación específica. La aprobación de publicar no las reemplaza. Pueden autorizarse por grupos separados sobre el SQL final revisado.

## Trabajo de código y verificación que falta

1. Convertir borradores a migraciones registradas mediante herramienta soportada, validar contra copia aislada del esquema actual y datos representativos sin copiar datos privados. Sustituir el reemplazo textual de definición de función de finalización por definición explícita revisada.
2. Portar a `SupabaseRepository` las comprobaciones de membresía activa, prohibición de enlaces dinámicos ajenos para seller y revisión de administrador acotada a organización. Las comprobaciones de `SalesRepository` del fixture no protegen el backend real por sí solas.
3. Adaptar costos reales a repositorio durable, y habilitar sus capacidades sólo cuando el esquema esté comprobado. Nunca usar JSON de disco en funciones serverless para persistencia multiinstancia.
4. Preparar mapa de inscripción/propietarios sin ampliar lectura entre organizaciones. Verificar reglas sobre clientes/proyectos existentes y documentos vinculados antes de habilitar vendedores. No crear usuarios demo reales.
5. Probar funciones Netlify con build real: `ai`, `ai-run`, trabajadores y limpieza programada ya existente. `config.background=true` es válido según documentación Netlify actual; no renombrar la función por una suposición antigua. Revisar reintentos/idempotencia y evitar ejecutar limpieza durante diagnóstico.
6. Repetir suite, lint, build y análisis del artefacto final sin claves/identidades/flags sintéticos. Verificar configuración pública y privada de Netlify por nombre/presencia, no valores. Revisar funciones y límites/crédito disponibles sin cambiar plan.
7. Commit selectivo que excluya el cambio ajeno y datos locales; confirmar Stopped builds antes del push autorizado. Despliegue manual con funciones incluidas, conservación de la versión publicada anterior y rollback compatible. No basta publicar `dist` sin backend.
8. QA con cuenta legítima: login, trabajadores existentes, owner/org, cuatro motores, vendedor, notas, agenda, factura interna, persistencia y PDF preliminar; registros sintéticos nuevos sólo con aprobación puntual de su alcance. No repetir la descarga PDF real anterior de resultado incierto.

No se ha publicado, hecho commit/push ni aplicado cambios remotos. No considerar estas funcionalidades activadas en cuentas reales hasta cerrar los puntos anteriores.

## Evidencia de este hito

- Suite completa: 243 pruebas / 57 archivos, sin fallos; incluye cuatro motores con el proveedor común y cliente OpenAI controlado, cálculo/edición sin nueva llamada, y aislamiento de propietario.
- Lint sin errores. Build bloqueado con `.env.local` de fixture y correcto usando configuración pública real existente, sólo en el entorno temporal del proceso. Aviso de tamaño del bundle principal, aproximadamente 1 MB; no es prueba de disponibilidad del backend.
- No se realizaron llamadas OpenAI pagadas ni escrituras Supabase. Las pruebas de interpretación de este hito usaron cliente controlado; no presentarlas como QA remota con Kevin.
- No hay navegador disponible: pendiente QA visual real, sesión/identidad Netlify y configuración vigente de builds/crédito.
- Referencia verificada de Netlify: https://docs.netlify.com/build/functions/background-functions/ admite `config.background=true`; no se modificó el nombre de la función.
