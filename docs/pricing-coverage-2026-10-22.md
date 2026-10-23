# Cobertura de cálculo y precios — Los Ángeles, California, US

Auditoría22oct2026 sobre el checkout local. No cambios Supabase remoto, credenciales,
push, merge, Netlify ni llamadas IA pagadas.

## Matriz comprobada

| Rubro | Cálculo disponible | Referencias económicas | Brechas importantes |
|---|---|---|---|
| Pintura interior | Paredes, aberturas, manos, envases, protección/preparación/reparación menor/limpieza y horas por fase |25 referencias de pintura/preparación:20 importes,5 pendientes |75USD/hr y productividad/consumibles siguen siendo supuestos editables, no tarifa local investigada. Imprimación completa fuera del alcance base. |
| LVP de encaje rectangular | Área, merma, cajas completas, horas y gastos |8 referencias con importe; default exacto Trail Oak20.1sf/caja |Tarifa de instalación, soporte/nivelación/humedad, escaleras, transiciones y retirada no confirmados. No todos los productos están habilitados automáticamente. |
| Zócalos interiores | Longitud neta, merma, piezas enteras, horas y gastos |6 referencias con importe; default8807 pieza8ft |Lista de cortes/ingletes, pintura, caulk, fijaciones y retirada no resueltos automáticamente. Un set80ft no es una pieza80ft. |
| Drywall simple | Paneles32sf, horas de colocación y gastos. Nuevo acabado estándar de juntas opcional con confirmación de alcance |10 referencias:6 importes,4 pendientes. Incluye compuesto y cinta Ace;2 importes nuevos con presentación de venta todavía incierta |Panel sin precio; fijaciones según soporte/patrón pendientes. Acabado requiere juntas medidas, productividad/tarifa, consumibles. Sin skimcoat/Level5, sistemas fuego/humedad ni estructura. |
| Cerámica/mortero |Referencias solamente; no motor completo habilitado |9 importes públicos |No declarar cobertura de colocación, grout, impermeabilización ni compatibilidad completa. |

Antes:54 referencias,45 con importe,9 sin precio. Después: **58 referencias,
49 con importe público,9 sin precio,0 precio/stock local verificado**. De los cuatro
importes nuevos, dos requieren confirmar el pack antes de calcular compra.

Hay dos conjuntos: catálogo base pintura/preparación25 y biblioteca de construcción
33. El archivo persistente `.local-review/price-library.json` contiene33, con29
importes y4 faltantes. No confundir58 con una única tabla remota ni49 con49 precios
automáticos válidos para cualquier trabajo. Ninguno está verificado por sucursal/ZIP.

## Fuentes añadidas, sin duplicados inflados

- USG380501 compuesto4.5USgal, AceSKU12922,26.99USD de página primaria abierta;
  se descartó el snippet25.99. Cobertura aproximada450sf derivada de10gal/1000sf,
  únicamente tratamiento de juntas, no skimcoat/Level5.
  https://www.acehardware.com/departments/paint-and-supplies/patch-and-repair/joint-compound/12922
  Ficha: https://www.usg.com/api/download-center/v1/assets/16ae03bb-08e8-56ab-8421-f909b67b85eb?country=us&download=true
- USG382175 cinta250lf, Ace12931,6.59USD por rollo. Se usan juntas medidas,
  nunca área ni perímetro del cuarto.
  https://www.acehardware.com/departments/paint-and-supplies/patch-and-repair/drywall-tape/12931
- Amerimax58102 esquina8ft, Ace50190,4.99USD por presentación: pack pendiente,
  sin default automático.
  https://www.acehardware.com/departments/building-supplies/lumber-and-trim/corner-beads/50190
- Ace2007312 esponja80/120grit, Ace1024487,5.99USD por presentación: pack y
  consumo por superficie pendientes, sin default automático.
  https://www.acehardware.com/departments/paint-and-supplies/painting-tools-and-supplies/sanding-sponges/1024487

El panel HD202530243 ya existía y sigue sin precio; no se duplicó. El precio9.29USD
de Grip-Rite114CDWS1 en FranklinTN37027 se excluyó del catálogo/defaultsLA. Westside
Chatsworth es una ubicación investigada, no prueba de precio o stock. No se contactó
al proveedor: https://westsidebmc.com/s/content/find-yard

BLS May2023 se conserva solo como benchmark histórico de salario empleado, nunca
tarifa contratista ni valor automático. El mean37.07/h de construcción/extracción
May2025 tampoco sustituye tarifas por oficio. No se inventó multiplicador salarial.
https://www.bls.gov/oes/2023/may/oes_31080.htm
https://www.bls.gov/regions/west/news-release/occupationalemploymentandwages_losangeles.htm

## Mejora funcional terminada

- `CostEvidencePanel`: producto, envase/unidad de compra, importe vigente, fuente,
  fecha, merma, tarifa/productividad, recargo y confianza categórica por partida.
  No probabilidades inventadas ni aprobación Kevin. Impuestos/envío/retirada no
  informados no se presumen gratuitos o incluidos.
- `laborBasis`: costo de subcontrata o costo directo más carga separada. Una carga
  desconocida sigue pendiente. No sumar carga otra vez a costo de subcontrata.
  La aplicación de gastos y recargo sigue separada y no se compone consigo misma.
- `drywallFinishing`: alcance adicional confirmado por el vendedor, con copia del
  plan original y registro de adición. No se considera que la IA aprobara la ampliación.
  Cubetas/cinta se calculan; horas/precio/packs faltantes siguen pendientes.
  Permite guardar y exportar preliminar incluso si faltan precios de producto.
- `mixedWork`: compone documentos ya aprobados del mismo propietario y mercado,
  por zonas distintas, sin segunda capa de mano de obra/gastos/markup. Mantiene
  recargo por partida y aplica un redondeo final. Una fuente matemática inválida
  genera una partida pendiente conservando los otros alcances válidos. Duplicados
  de rubro/zona no se cobran otra vez. Pintura+drywall en la misma zona exige revisar
  acabado/imprimación/soporte, sin asumir que ya estén resueltos.

**Límite importante:** el proveedor de lenguaje natural sigue seleccionando un
solo rubro. Los pedidos mixtos no interpretables se conservan como preliminar pendiente.
La composición probada aquí parte de alcances aprobados; no se presenta como
automatización de chat mixto ya terminada.

## Evidencia de pruebas y revisión

`pricingCoverage.test.js`: cuatro motores existentes, fuentes, encases, carga laboral,
rechazo de doble carga, acabado EN/ES, aprobación de alcance, PDF preliminar,
idempotencia de gastos, precio desaparecido, composición, privacidad y matemática inválida.
`pricingCoverageUi.test.jsx`: confirmación explícita, prevención de duplicado, explicación
de error sin cambiar el borrador y evidencia ES. Suite completa del hito:238 pruebas
en56 archivos, lint limpio, build correcto; persiste advertencia de bundle>500kB.

`node scripts/import-drywall-research.mjs`:4 insertadas,0 duplicadas; copia previa
local preservada. `node scripts/pricing-coverage-acceptance.mjs` guarda/relee QA
solo en PGlite5182, sin IA pagada. Reporte ignorado por Git:
`.local-review/pricing-coverage-acceptance.json`.

- Entrar: http://127.0.0.1:5182/__fixture/session
- Drywall ampliado: http://127.0.0.1:5182/estimates/0ef03162-7dc9-4ece-9454-975f87f564b2
- Tres alcances aprobados: http://127.0.0.1:5182/estimates/445ddcd8-066b-42ae-b544-cf47a707cc95

El QA de drywall tiene11 paneles con precio pendiente,1 cubeta26.99 y1 rollo6.59.
Solo estos dos materiales suman33.58USD; eso **no es el precio del trabajo completo**.
Mano de obra, lijado, fijaciones y retirada permanecen pendientes; el subtotal excluye
lo desconocido. El registro es sintético y no se cargó en Supabase.

5182 es controlado;5186 tiene OpenAI real con base aislada y no se hicieron llamadas
nuevas;5190 conserva vendedores/comercial;5173 usa Supabase real, sin importaciones
de esta biblioteca ni activación remota de los tres motores nuevos. Los cambios
generales del editor son código local compartido, no publicación Netlify.

Chrome builderonestop44 continúa pendiente de selección/conexión; no hubo QA visual
nuevo ni se usó otro perfil. Las pruebas fueron HTTP, componentes y motor/PDF textual.

Próximas brechas: precio de panel con SKU/sucursal/ZIP y fecha; confirmar packs de
consumibles, patrón/soporte de fijaciones; recopilar costos contratista y productividades
observadas por alcance; verificar retirada por volumen/acceso. Mantener preliminares
editables mientras falten datos; no esperar aprobación Kevin para esos precios.
