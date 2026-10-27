# Equipo y vendedores — revisión local 25 octubre 2026

## Resultado y separación de entornos

El rol vendedor, las asignaciones de leads, notas con autor/fecha y documentos propios ya existían. Esta etapa añade una entrada visible Equipo y vendedores para admin, listado con búsqueda/filtros, alta con nombre/correo/contraseña inicial y edición de nombre/estado. Trabajadores conserva su módulo y roles. No hay envío automático de email, recuperación de contraseña nueva, eliminación de usuarios ni conversión de identidades existentes.

Revisar en `http://127.0.0.1:5190/__fixture/session?as=kevin`, pulsando Enter test workspace. Es PGlite persistente con cuentas sintéticas y proveedor de IA controlado: no Supabase productivo, no llamadas IA pagadas. Equipo: `/team`. Otros actores disponibles en la pantalla de entrada: a, b, otherManager, other, worker. No introducir correos/contraseñas reales aquí. Los registros sobreviven al reinicio del harness.

Beta Netlify permanece sin cambios de esta etapa. No hay push, deploy ni migración remota. El frontend real local puede recargar cambios de código, pero el alta real no se considera activada; solo el entorno aislado tiene el SQL nuevo instalado.

## Comportamiento de seguridad

- `/api/workers/team/` reutiliza el wrapper servidor existente con un handler separado. Verifica token con Auth, sesión con método password y sesión/rol admin/membresía activa en SQL; operator, vendedor, trabajador y anónimo no gestionan equipo.
- Reserva idempotente antes de crear Auth. Se usa metadata de aplicación escrita solo por servidor para reconocer exactamente la identidad creada por esa reserva. Un correo existente/reservado no se adopta, convierte ni reasigna, incluso si pertenece a otro trabajador u organización.
- La contraseña viaja solo al proveedor Auth a través del servidor; no va a SQL, auditoría, almacenamiento del navegador o logs. El adaptador local no almacena contraseñas. No mostrarla después de guardar.
- La activación inscribe exclusivamente rol seller y membresía seller de la organización del admin. No permite rol ni organización elegibles por el cliente.
- Desactivar conserva leads/documentos; invalida membresía y borra sesiones/refresh tokens de ese vendedor. Reactivar no restaura sesiones previas. Versiones detectan edición concurrente; repetir exactamente una actualización confirmada no la duplica.
- Tablas nuevas con RLS y sin acceso directo de anon/authenticated; RPC invoker público ejecutable solo por service_role, implementación privada con comprobaciones explícitas. Las políticas existentes de propietarios/organizaciones siguen vigentes.

## Cambio remoto pendiente de autorización puntual

Destino exclusivo: Supabase One Stop `vtpciccluvpaclbeqxih`, conexión Kevin. El borrador revisable es `docs/team-provisioning-draft.sql`; no es una migración registrada ni aplicada remotamente.

Solicitar aprobación para crear `team_seats` (reservas de alta), `team_member_versions` (concurrencia), `team_audit` (actor, acción, fecha), esquema privado y funciones `team_private.command` / `public.team_command`, sus RLS/grants service-only. No modifica políticas de acceso a datos de otros módulos, cuentas existentes, propietarios o trabajadores. La capacidad permitirá a Kevin crear vendedores desde la app una vez publicada; esta revisión NO aprovisiona identidades externas reales. Registrar una migración formal después de inspeccionar esquema actual y obtener aprobación; no ejecutar este borrador por estar en docs.

## Diseño y QA

Sistema compartido claro con navegación azul oscuro, jerarquía tipográfica, botones accesibles, tarjetas/formularios, encabezados y estados sin datos inventados. Dashboard, pipeline, Equipo y chat revisados en escritorio y móvil; EN/ES. Búsqueda lateral lleva al filtro de pipeline. Cotizador/estimados siguen visibles; mercado LA, CA, US / USD / pies y reglas comerciales sin cambios. El chat conserva el proveedor y progreso reales existentes; en este harness todo está etiquetado como sintético. No se promete streaming donde no existe.

Pruebas: alta idempotente, duplicados, campos/roles extra rechazados, IDOR entre organizaciones, acceso directo SQL/API denegado, revocación, conflictos, formularios EN/ES y copia aislada del esquema productivo. Capturas antes/después y resultados detallados se conservan en el workspace de la tarea. Las pruebas visuales usan contexto Chrome efímero con red limitada a loopback, nunca perfiles personales ni sesión real.

## Límites

La alta real necesita aplicar el cambio SQL aprobado y publicar backend/frontend de forma coordinada; hasta entonces el servidor falla cerrado con TEAM_SETUP_REQUIRED, antes de llamar Auth admin. No se verificó proveedor Auth real creando una persona. No se reinicia ni altera producción para simularlo. Recuperación de contraseña de vendedor permanece en el procedimiento administrativo existente; no se añadió un reset inseguro ni un email externo.

## Recuperación y concurrencia verificadas

Auth y SQL no forman una transacción distribuida. Si Auth crea la identidad y la activación SQL falla, se conserva una reserva pendiente y una identidad Auth sin rol beta ni membresía; no puede entrar al CRM. Reintentar con el mismo admin y la misma reserva recupera exactamente esa identidad. No se borra Auth automáticamente. Una reserva abandonada necesita reconciliación administrativa explícita: no hay limpieza, adopción por otro correo ni conversión automática.

Las pruebas inyectan un rollback SQL real después de ejecutar la activación dentro de la transacción, y verifican ausencia de rol, membresía y auditoría de creación hasta recuperar. También simulan pérdida de respuesta después de un commit exitoso. El reintento no crea otra identidad, no duplica la auditoría y no reactiva una cuenta que se haya desactivado después.

Altas concurrentes con la misma reserva convergen en una identidad y una membresía. Dos reservas distintas para el mismo correo tienen un ganador; la otra devuelve conflicto sin adoptar la cuenta. Una desactivación y una edición simultáneas tienen un ganador por versión; el otro debe recargar. Repetir la desactivación confirmada no duplica auditoría ni restaura sesiones.

El proveedor Auth sintético ahora reproduce su restricción de unicidad de forma atómica. Son pruebas controladas con PGlite y dobles de Auth, no una prueba de carga de Supabase real. En Chrome se perdió deliberadamente la primera respuesta de un alta local ya confirmada: el formulario conservó su reserva, el reintento recuperó el mismo usuario, la contraseña se limpió y solo quedó un vendedor tras recargar.
