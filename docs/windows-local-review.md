# Windows: revisión local de One Stop

## Integración híbrida local terminada

El flujo de revisión está activo en http://127.0.0.1:5186/__fixture/session: OpenAI real, sesión sintética y base PGlite aislada. Conserva el chat y el módulo de trabajadores. Los cuatro rubros son pintura, LVP, zócalos y drywall. El modelo recibe cinco identidades de producto, sin el catálogo completo. Las referencias se filtran por producto, unidad, propietario, mercado y fecha; una fuente vencida produce una advertencia. No se consulta internet en cada edición ni se inventan precios locales.

El vendedor aprueba el alcance, genera con reglas, edita cantidades, precios y recargo sin IA, y exporta. Materiales, desperdicio, preparación, mano de obra, equipo, gastos y recargo quedan explícitos. Lo desconocido permanece pendiente y fuera del subtotal conocido; guardar, finalizar una revisión documental y exportar un preliminar siguen disponibles. Finalización documental, verificación de precios y aceptación comercial son conceptos separados.

Verificación final: **194 pruebas en 46 archivos**, lint y build correctos. Permanece una advertencia de bundle principal mayor de 500 kB. Los cuatro motores se verificaron con respuestas controladas. Además de las tres pruebas reales anteriores, este cierre ejecutó una interpretación real de pintura: **953 tokens de entrada, 201 de salida, cero cacheados y una sola llamada**. Generar, editar y repetir la aceptación idempotente no añadieron llamadas.

La tarifa existente quedó identificada como env-rates-da65f50c: costo API estimado **USD0.003916**, sin afirmar facturación oficial verificada. Excluye ChatGPT, hosting, Netlify y Supabase. Sin tarifa aplicable, el costo queda desconocido; esa situación tiene regresión automatizada. No se cambiaron valores de tarifas ni credenciales. La plantilla docs/api-rate-card.example.json documenta cómo configurar una tarifa local no sensible y versionada.

Caso para revisar: http://127.0.0.1:5186/chat/37a2c210-cd4d-4f99-abe6-5eab738f0e2a. Estimado df8ea827-3993-4a9c-84ee-fc56f597855c, revisión 3. El motor calculó inicialmente 3 galones; la edición manual quedó en 4 galones a USD49. Costo conocido USD803.59; recargo vigente 30%; subtotal conocido USD1044.67 y margen sobre importes conocidos 23.1%. El equipo adicional sigue pendiente: no se afirma un precio completo. Los PDF EN/ES tienen tres páginas cada uno; las seis se renderizaron y revisaron. El recargo vigente se distingue de los supuestos originales del plan, que indicaban 25%.

QA visual en Chrome Kevin, EN/ES: paneles de consumo, plantilla y costos; cuatro selectores que solo preparan borradores; edición sin IA y persistencia tras recarga. Un costo sintético de USD120 quedó en archivo separado, ligado a la revisión 2 del presupuesto. Dos reintentos idénticos dieron 200/200 y conservaron un registro; otro propietario recibió 403. La comparación de costos es parcial, no la variación final de una obra. Esos datos no se envían a IA, no verifican precios y no entrenan automáticamente el sistema.

Servicios confirmados desde Windows host: 5173, 5182 y 5186 responden HTTP200; API8787 sin sesión responde 401. Servidor aislado PID34616. Checkout, rama y HEAD conservados, junto al cambio ajeno scripts/ai-browser.mjs. No hubo migraciones ni escrituras Supabase, claves nuevas, push, despliegues o cambios de Netlify. Biblioteca total: 54 referencias, 45 con precio, nueve sin precio y cero verificadas en Los Ángeles.

**Límite de activación:** 5173 conserva Supabase real y pintura; allí no se activaron los cuatro motores híbridos. Para producción, el registro de costos necesita una migración revisada con propietario, estimado, revisión presupuestada, request_id único por propietario y RLS. El archivo local no sirve como persistencia cloud compartida. También falta habilitar el proveedor en el runtime productivo y desplegar con autorización. El hito aislado no tiene bloqueos pendientes. El PDF real antiguo de resultado incierto no se reintentó. No se promete paridad con Handoff ni operación ilimitada o 24/7.

Los checkpoints siguientes se conservan como historial y pueden describir estados anteriores al cierre.

## Arquitectura híbrida: checkpoint de implementación posterior

Checkpoint siguiente: paneles EN/ES de consumo, plantilla/referencias y costos reales integrados en AiChat conservando su interfaz. Registro manual de costos en archivo local separado, con propietario/estimado/revisión, monedaUSD, fecha y nota; operaciones idempotentes y comparación parcial, sin entrenar IA ni verificar precios. Endpoint únicamente en entornoaislado y propietario actual; sin migración remota. `docs/api-rate-card.example.json` es plantilla sin tarifas inventadas; archivoopcional `.local-review/api-rate-card.json`, ignorado, permite versión/modelo/fecha/fuente/tarifas. Tarifas ausentes o inválidas no bloquean presupuestos y dejan costoAPI desconocido.

Suite completa hasta este checkpoint:193pruebas/46archivos y lint/build correctos. Después se añadió medición de fallos/incompletos y un script idempotente de aceptación de pintura para UNA futura llamada sintética real; no se ejecutó todavía. Las métricas de fallos conservan uso medido cuando existe, o solicitud no medible cuando no existe; no se inventa costo cero. No se recargó5186todavía; paneles de calibración y proveedorcuatrorubros no declarados probados en navegador. Pendiente siguiente paso: recarga segura únicamente del entornoaislado, llamada mínima de pintura, QAvisualdepaneles/registro, suitefinal y comprobaciónhost. Sin nuevas llamadasIA, cambioscredenciales, Supabase, push o despliegue.

Checkout revalidado: feat/ai-estimator-approved-plan, HEAD8252150e6002fac7acb694f592d03f2198731eaa; cambiosprevios y scripts/ai-browser.mjs preservados. Servicios host5173/5182/5186HTTP200, API8787sinsesión401. Sin nuevas llamadasIA o escriturasSupabase.

Implementado en código local `shared/workRegistry.js`: contrato común para pintura/LVP/zócalos/drywall, prompt acotado a cinco identidades de producto, búsqueda local por producto/unidad/propietario/mercado/fecha, fuentes vencidas como advertencia sin falsa verificaciónLA. Planes aprobados generan con reglas y añaden preparación/equipo pendiente explícito cuando no tienen precio; no inventan importes.

`shared/apiUsage.js` añade tarifa por millón de tokens con versión y snapshot, entrada cacheada contada una sola vez, costos calculados solo con tarifas configuradas y etiquetados no verificados contra facturación. Dedupe por run/respuesta, llamadas de generación determinista cero, legado con conteo desconocido y fallos sin uso medido separados. `server/openai.js`, proveedoraislado y engine guardan métricas y resumen acumulado en la revisión del estimado. No se configuró una tarifa nueva ni se modificaron credenciales; costoUSD permanece desconocido si faltan tarifas. API no incluye ChatGPT, hosting, Netlify o Supabase.

Verificación del checkpoint:14pruebas focalizadas en4archivos aprobadas y lint correcto; incluyen cuatro motores, aprobación, referencias acotadas, ownerisolation, dedupe y edición sinIA. Suitecompleta/build/QAreal de esta nueva arquitectura aún pendientes. Servidor5186todavía no fue recargado con este proveedor nuevo; no afirmar cuatro motores activos en navegador. Pendiente siguiente hito: paneles de consumo/plantilla, configuración no sensible de tarifas, registroaislado de costosreales vs presupuestado, pruebaOpenAI sintética mínima y QAfinal. Sin bloqueo externo ni permiso pendiente.

## Cambio vigente: presupuestos preliminares e IA real aislada

### Cierre final comprobado

Pendientes de los checkpoints anteriores cerrados. Suite final después de cachés y presentación de cantidades pendientes: 188 pruebas en43archivos, lint y build aprobados. Advertencia no bloqueante: bundle principal mayor de500kB.

Recorrido visual adicional, sin llamadas IA: conversación demo `/chat/1e7d7f5d-6058-4278-b5e6-e7d5d977d68e`, estimado `263a1413-881b-4632-b995-400407d4714d`. Se generó sin medidas, se aprobó alcance pese a una aclaración orientativa, y se editó: costo sintético80 con cantidad pendiente mantiene importe excluido; cantidad3 produce costo240 y venta300 con recargo25%; al quitar cantidad vuelve a preliminar sin total completo. Guardado, finalización revisión5 y persistencia tras recarga comprobados en Chrome Kevin. PDF español descargado9669bytes y render revisado: cantidad pendiente, precio unitario al cliente100conrecargo, importe pendiente, subtotal conocido0claramente incompleto y precio final por definir. El80es prueba manual, no precio local investigado. Las cantidades pendientes nunca se presentan como cantidades cero.

El vendedor puede aprobar alcance, generar, editar supuestos/costos, guardar, finalizar la revisión documental y DescargarPDF aunque haya datos pendientes. Las preguntas son orientativas; no alteran la aprobación de alcance. No inventar cifras para rellenar desconocidos. Finalización documental y aceptación comercial siguen separadas.

URL de revisión con IAreal y baseaislada: http://127.0.0.1:5186/__fixture/session. Abrir sesión sintética y escoger los tres casos existentes; no se necesitan nuevas llamadas para revisarlos. La demo5182usa proveedor controlado. Elfrontend5173sigue conectado a APIreal/Supabase y NO tiene activos los tres motores nuevos productivos. Verificación host final200/200/200/401 para5173/5182/5186/API8787sinsesión. Sin permisos pendientes para este hito; PDFreal antiguo incierto continúa separado y no se reintentó. Ninguna nueva escrituraSupabase, credencial, push o publicación.

Checkpoint de cierre posterior: 188 pruebas/43 archivos aprobados; lint/build correctos antes del ajuste final de cachés Vite y diagnóstico de exportación. Se comprobó en Chrome la finalización de drywall sin precios (revisión2) y descarga real `855a7734-en-r2.pdf`,11143bytes en Downloads. El fallo inicial ACCESS_DENIED era contexto de sesión sintético perdido al reabrir PGlite: reparado solo en la transacción del harness y cubierto por regresión persistente. El fallo posterior al importar jsPDF era HTTP504 por caché compartida entre servidores Vite: cada puerto tiene ahora su propia caché ignorada en node_modules, y la descarga del navegador pasó después de recargar.

Se renderizaron/revisaron las12páginas de los seisPDF preliminares EN/ES. Pendiente al checkpoint: recorrido visual completo de cantidad desconocida/editada y repetir verificación final tras los dos últimos cambios de diagnóstico/caché. Regresión automatizada de cantidad desconocida y precio ingresado antes de cantidad aprobada: permanece preliminar y excluida del subtotal hasta aportar cantidad explícita.

Servicios al checkpoint: frontendreal5173 PID33060, API8787 PID32664, demo5182/8792 PID31972, IArealaislada5186/8796 PID30964; HTTP200/401/200/200 desde host. Ninguna nueva llamada OpenAI ni escritura Supabase durante este cierre.

La instrucción posterior del usuario sustituye los bloqueos comerciales descritos en checkpoints históricos inferiores: precios o medidas faltantes no impiden aprobar el alcance, guardar, finalizar una revisión documental ni exportar PDF preliminar. La aprobación del alcance, seguridad, conflictos y validaciones matemáticas siguen vigentes. Las preguntas pendientes son orientativas; las partidas sin base razonable conservan precio/cantidad pendiente, quedan fuera del subtotal conocido y no se presentan como cero ni como total final. No se inventaron nuevas tarifas ni precios.

El PDF EN/ES muestra PRESUPUESTO PRELIMINAR / PRELIMINARY BUDGET, advertencia visible, partidas pendientes y subtotal incompleto. La versión finalizada sigue sin representar aceptación comercial o precio verificado. No se reintentó el PDF real anterior incierto.

Entorno adicional opt-in: `node scripts/isolated-real-trades.mjs`, http://127.0.0.1:5186/__fixture/session, API8796. OpenAI real con PGlite persistente separado en `.local-review/real-ai-isolated/database`; autenticación sintética local, sin cliente ni credenciales Supabase en el proveedor. Solo toma los campos OpenAI del archivo privado esperado. No cambia5173/8787 ni demo5182. Proveedor nuevo no importado por runtime productivo/Netlify. La UI distingue IA real aislada de simulación controlada.

`node scripts/isolated-real-trades-acceptance.mjs` guarda un reporte idempotente y no repite llamadas ya verificadas. Tres llamadas reales gpt-6.1-sol, datos exclusivamente sintéticos: LVP22cajas, zócalos17piezas, drywall11paneles. Tokensentrada/salida:583/84,579/242,585/208. Selección estructurada valida producto exacto y citas de medidas presentes en mensajes; cálculo posterior determinista sin otra llamada. Biblioteca pública versionada separada de referencias privadas del propietario. Alcances fuera del motor se conservan como partida pendiente, sin calcularlos incorrectamente.

Casos persistentes aislados: LVP `/chat/75654098-01c1-46f9-a1de-1de0442034a1`, zócalos `/chat/aecee7a3-184a-4b6d-adf7-557542a29c0c`, drywall `/chat/f1c964eb-46dc-48ef-b942-f6438f833ae6`. Reporte y seis PDF EN/ES en `.local-review/real-ai-isolated`. Se renderizó y revisó visualmente drywall español página1 e inglés página2: avisos y cantidades legibles, pendientes sin importe cero y precio completo por definir.

## Cierre de biblioteca y chat: 22 de octubre de 2026

La biblioteca nueva contiene 29 observaciones distintas: 25 precios públicos indexados y 4 fichas sin precio. Sumadas a las 25 referencias anteriores son 54 referencias, 45 con precio y 9 sin precio; ninguna está verificada en sucursal/ZIP de Los Ángeles ni consultada en vivo. Las fechas de consulta no garantizan la antigüedad del índice. Impuestos, stock y entrega siguen desconocidos. Tarifa de contratista y productividad son supuestos explícitos, no datos investigados.

Importación local: `node scripts/import-local-library.mjs --starter <batch-id>`. Valida unidades, fuentes y estados; deduplica por producto estable, conserva versiones y rechaza actualizaciones antiguas. Guarda `.local-review/price-library.json`, nunca catálogo remoto. Consultas paginadas y selección de producto evitan enviar toda la biblioteca al chat. Para crecer mucho más se requiere almacenamiento indexado y carga autorizada por propietario; este archivo inicial no prueba capacidad para cien mil artículos.

Los motores nuevos y la biblioteca están habilitados exclusivamente en el proveedor controlado de 5182. La interfaz general del chat también está en 5173, pero los rubros nuevos todavía no están activados en el proveedor real. Cerámica/morteros son referencias consultables, sin motor automático de instalación completa. Productos con conflictos de cobertura/precio, uso incompatible o presentaciones ambiguas no se eligen automáticamente.

Recorridos persistentes comprobados en Chrome Kevin:

- LVP: `/chat/9027ed85-f1bb-4ec8-ad8e-8f1d5e4c4f82`; 400 sf, desperdicio supuesto 10%, caja 20.1 sf: 22 cajas, material USD1451.78. Tarifa manual sintética de USD75/h para comprobar edición, gastos y recarga; propuesta USD3218.61. No representa tarifa local verificada.
- Zócalos: `/chat/14f14a9b-c41c-4e46-b79a-c30fbf6a1b64`; 120 lf, 10%, piezas de 8 ft: 17 piezas, material USD359.89. Mano de obra pendiente; subtotal parcial y finalización/PDF bloqueados.
- Drywall: `/chat/7105998a-da35-45a8-8545-cae322131585`; estimado `20b42387-a518-46c1-b791-dfc52f2ce2b2`. 40 x 8 ft, 10%, panel 32 sf: 11 paneles. Material y tarifa pendientes, propuesta sin precio final; guardado y recarga comprobados. Alcance solo panel, excluye estructura, tornillos, cinta, acabado, resistencia al fuego y pintura.

La búsqueda Trail devuelve una referencia; paginación comprobada 1–6 y 7–12 de 29. Vista móvil 390 x 844: ancho de documento 390, sin desborde horizontal, compositor visible al pie; controles EN/ES comprobados. El idioma de interfaz y el de documento son independientes.

QA de red aislado: rechazo 503 antes de guardar y reintento sin duplicar; respuesta de confirmación demorada con burbuja optimista y un solo mensaje; cancelación durante ejecución conservando trabajo. Se corrigió la carrera entre versión de conversación y cancelación: esta identifica la ejecución concreta y no cancela una posterior. Las etapas mostradas vienen del servidor; no se simula streaming ni razonamiento interno.

Resultado final: 183 pruebas en 40 archivos, lint y build correctos. Build conserva advertencia de bundle principal mayor de 500 kB. Pruebas de integración cubren tres rubros, edición manual, recálculo idempotente, propietario y PDF EN/ES; no se descargaron/renderizaron PDF nuevos en navegador y no se repitió la exportación real incierta descrita abajo.

API real recargada únicamente estando la conversación QA guardada sin ejecución visible; PID13052. Verificación host posterior: frontend5173 HTTP200, demo5182 HTTP200, API8787 sin sesión HTTP401. Los servicios deben mantenerse encendidos y la conexión disponible; esta prueba no garantiza operación ilimitada ni 24/7.

Checkout: `C:\Desarrollo\kevin-estimator`. No publicar ni activar builds de Netlify para esta revisión.

## Arranque y límites

- `npm run check:local`: informa presencia de configuración y exclusión de Git, sin imprimir claves ni contactar proveedores.
- `npm run dev:review`: http://127.0.0.1:5182/__fixture/session. Proveedor controlado, autenticación sintética y PGlite local; no OpenAI ni Supabase real.
- Los registros persisten en `.local-review/database`, excluido de Git. Las imágenes cargadas no sobreviven a reinicios.
- Ejemplo soportado: `Paint only the walls of a 12 x 10 x 8 ft bedroom`. Sin las tres dimensiones, pide como máximo dos aclaraciones y no genera. El simulador no equivale a comprensión general de lenguaje por IA.
- Revisar alcance, aprobarlo, generar y editar cantidades/precios. La aceptación comercial sigue separada del alcance y de la evidencia de precios.

## Cantidades, gastos y PDF

Los gastos automáticos son el porcentaje de materiales y mano de obra del mismo ambiente, incluidas adiciones manuales. Excluyen equipos, otros gastos y la propia partida. Se redondean a centavos y no se acumulan al recalcular. Cambiar directamente el precio, cantidad, unidad o tipo del gasto crea una excepción manual; se conserva hasta pulsar restablecer porcentaje. Las notas personalizadas se conservan.

Una cantidad de pintura editada aparece como ajuste manual en EN/ES; el PDF no afirma que el cálculo anterior sea la cantidad vigente. Los PDF usan la misma revisión guardada y el mismo total que la propuesta. Los precios al cliente incluyen margen: la línea de gasto del PDF no representa su costo interno sin margen.

## Precios y referencias

Mercado: Los Angeles, California, United States; USD y pies/pulgadas. Verificado requiere producto/presentación/proveedor/fuente/fecha, ubicación y ZIP coincidentes, evidencia local y vigencia explícita. La revisión de 30 días es una política interna, no una garantía del proveedor. Un precio público indexado sin sucursal/ZIP permanece provisional. No se exige aprobación de Kevin para trabajar con precios.

Las referencias pertenecen al propietario autenticado y guardan estimado/revisión/partida de origen. Reutilizarlas no es aprendizaje automático ni convierte un estimado Accepted en evidencia de mercado. La ficha técnica BEHR 2050 solamente respalda ese producto; no se aplica automáticamente al producto 275001 del ejemplo. Rendimiento, desperdicio, productividad y tarifas siguen siendo supuestos editables donde falta evidencia.

## Verificación reproducible

`npm test -- --maxWorkers=2`, `npm run lint`, `npm run build`.

`node scripts/local-acceptance.mjs` usa puertos 5184/8794 y una base aislada nueva bajo `.local-review/acceptance-*`; comprueba preguntas, alcance aprobado, cálculo, PATCH, conflicto de versión, finalización, PDF EN/ES, referencias propias y persistencia tras reinicio. No escribe datos remotos. Genera `report.json`, `saved.json` y dos PDF sintéticos.

## Accesos pendientes

El usuario guardó las claves existentes en `.env.server.local`. Comprobación posterior: variables cargadas, archivo excluido y no rastreado por Git, sin valores privados en el frontend. Supabase respondió HTTP 200 a HEAD sobre estimates con límite cero; OpenAI gpt-6.1-sol completó una llamada sintética mínima (14 tokens de entrada y 5 de salida). No se modificaron datos remotos. La identidad de cuenta/proyecto OpenAI no se pudo verificar mediante esta llamada.

API real separada: `npm run dev:api`, loopback 8787; sin sesión devuelve 401. La revisión 5182 conserva su proveedor y base aislados.

Frontend real separado: `npm run dev:real`, http://localhost:5173/chat, proxy a 8787. No carga archivos .env; define únicamente URL y clave pública del proyecto. La configuración pública existente se recuperó del recurso oficial https://onestop-beta.netlify.app/assets/index-D6UL9yWl.js, comprobando rol anon, proyecto y Auth settings HTTP 200. Se guardó en `.local-review/real-frontend-public.json`, excluido de Git. No se generó ninguna clave ni se cambiaron permisos. El .env.local del fixture permanece intacto.

El frontend real exige login normal; no acepta `/__fixture/session` (404). La API sin sesión responde 401; servir `.env.server.local` por Vite está bloqueado (403). Usar exactamente localhost:5173, que coincide con APP_ORIGIN configurado; no cambiar el origen privado para esta revisión. Nunca usar service role en el navegador. Usar únicamente Chrome builderonestop44; si no está conectado, queda pendiente la revisión visual y el inicio de sesión seguro. Crear registros sintéticos en Supabase requiere autorización para la cuenta concreta; las comprobaciones realizadas hasta ahora no escribieron datos remotos.

La sesión del navegador no configura las variables del servidor. Los valores enmascarados de Netlify no sirven para restaurarlas. No generar, rotar ni configurar nuevos accesos persistentes sin autorización específica. No ejecutar migraciones ni pruebas que escriban datos reales.

## QA real autorizado: 21 de octubre de 2026

Sesión legítima builderonestop44@gmail.com comprobada en Chrome Kevin. Se creó una sola conversación `737e6bfd-817f-40da-93a5-aa6d8f150b57` y un solo estimado `307bbdfd-aa01-45a4-8201-d8e99f3fb0c6`, marcados PRUEBA QA, sin cliente/proyecto asociado. Una pregunta de medidas, aprobación de alcance, generación real, guardado y recarga comprobados.

Plan: paredes 12 x 10 x 8 ft, 352 sf, dos manos, preparación menor; recargo aprobado 25% sobre costo. El cálculo inicial produjo 2.2126 gal y compra de 3 gal. Ajustes del QA: pintura USD49/gal en editor y 4gal desde chat, con revisión y aprobación de cambios. Gastos automáticos 5% de materiales/mano de obra USD765.32 = USD38.27. Costo USD803.59 + recargo USD200.90 = propuesta USD1004.49; margen sobre venta 20%. Los USD47.84 de gastos mostrados al cliente incluyen recargo; no son el costo interno USD38.27. La referencia original USD46.98 queda identificada en notas como sustituida por el precio manual provisional.

Se corrigieron dos fallos detectados en navegador: inicialización del estado del editor de pintura y sustitución silenciosa del recargo aprobado por el margen de plantilla. Generar ahora conserva el recargo aprobado; una plantilla incompatible ajusta su margen equivalente. Regresiones: 168 pruebas en 35 archivos, lint y build aprobados. El cambio ajeno scripts/ai-browser.mjs permanece intacto.

Presentación EN y ES, recarga, notas manuales, fuente provisional y panel de referencias propias (precio49, provisional, sin fecha, origen v5) comprobados en UI. Revisión8 finalizada en español; no equivale a aceptación comercial. No se cambió catálogo, roles, permisos o credenciales y no se tocaron otros registros.

La exportación real EN quedó con resultado incierto tras timeout de herramienta y una solicitud de aprobación sin resolución visible. No se encontró PDF QA en la carpeta de descargas comprobada. La política de navegador bloqueó chrome://downloads; no se intentó eludirla. Descarga y render de los PDF reales EN/ES siguen pendientes de aclarar el resultado/permiso anterior. Los PDF de acceptance-1792609703713 (USD1071.43) son evidencia aislada antigua y NO son el PDF de este QA real.

Comprobación posterior sobre host: mismos procesos12360(API8787),31368(frontend5173),4824(demo5182), respuestas401/200/200 respectivamente. La conexión rechazada desde el sandbox restringido no demostró una caída del host. No se reiniciaron ni duplicaron servicios durante esta recuperación.
