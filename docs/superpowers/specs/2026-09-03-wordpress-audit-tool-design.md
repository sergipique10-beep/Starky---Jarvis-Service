# Herramienta de Auditoría WordPress para Jarvis — Design Spec

**Fecha:** 2026-09-03
**Estado:** Aprobado para pasar a plan de implementación
**Alcance:** Nueva herramienta (tool) de riesgo nivel 1 en el catálogo de Jarvis, que
audita sitios WordPress y genera reportes PDF. No es un módulo nuevo del
roadmap de Jarvis — se integra directamente sobre el núcleo conversacional
(Módulo 1) ya implementado, reusando su sistema de tools, memoria y permisos.

## Contexto real

Este trabajo corresponde a la Fase 0 (Auditoría Inicial y Planificación) del
plan "Auditoría, Depuración y Adaptación de Webs Corporativas CMS WP" de la
Fundación Esplai (FPO Dual Transformación Digital, período 01/09/2026 –
18/03/2027). El plan cubre 3-4 sitios WordPress (W1-W4) y exige, en el
sprint S0.2, cuatro entregables:

1. Informe de rendimiento por sitio.
2. Informe de seguridad por sitio.
3. Inventario de plugins con recomendaciones.
4. Análisis de base de datos (tamaño, tablas huérfanas).

El entregable final E1 del plan especifica el formato: "Documento PDF/Markdown
por sitio". Esta herramienta automatiza los 4 puntos, generando un PDF por
sitio bajo demanda desde el chat de Jarvis.

**Fuera de alcance explícito de este spec**: las fases posteriores del plan
(Fase 1 en adelante) incluyen acciones reales de mantenimiento — actualizar
plugins/core, limpiar la base de datos, configurar WAF, etc. Esas son
acciones de riesgo nivel 2/3 (reversibles o irreversibles) y constituyen un
sub-proyecto aparte ("mantenimiento activo"), deliberadamente no cubierto
acá. Esta herramienta es puramente de lectura/diagnóstico.

## Decisiones de alcance

- **Integración**: una herramienta más en el catálogo de Jarvis
  (`auditar_sitio_wordpress` y `auditar_todos_los_sitios`), riesgo nivel 1
  (solo lectura, se ejecuta sin pedir confirmación).
- **Trigger**: bajo demanda, por chat o voz ("Jarvis, auditá W1").
- **Registro de sitios**: cada sitio (W1-W4) se guarda como un "proyecto" en
  la memoria de Jarvis ya existente (`projects`), reusando esa
  infraestructura en vez de crear una tabla nueva — el nombre del proyecto
  funciona como alias del sitio.
- **Fuentes de datos**: mixtas — externas (sin credenciales) e internas
  (con acceso SSH real), ver sección de arquitectura.
- **Salida**: PDF descargable por sitio, generado con Puppeteer
  (HTML/CSS → PDF) para poder darle un diseño prolijo y de marca.

## Arquitectura: dos fuentes de datos por sitio

**Fuente externa** (sin necesidad de credenciales ni acceso al sitio):

- **Google PageSpeed Insights API**: rendimiento y Core Web Vitals
  (reemplaza tanto a Lighthouse CLI como a GTmetrix con una sola
  integración).
- **WPScan** (modo de escaneo externo, igual que corrido manualmente):
  versión de WordPress, plugins/temas detectables públicamente,
  vulnerabilidades conocidas contra la base de datos de WPScan. WPScan
  también entrega, como subproducto de la detección de vulnerabilidades,
  la lista de plugins visibles — se reusa esa misma respuesta para el punto
  de inventario de plugins, sin integración adicional.

**Fuente interna vía SSH** (acceso real al servidor, de solo lectura):

- **WP-CLI** ejecutado remotamente para datos que no son visibles desde
  afuera: tamaño de la base de datos, tablas/transients huérfanos, versión
  exacta de PHP/WP, y el estado real (activo/inactivo) de cada plugin
  instalado — este último dato, cruzado con lo que WPScan ve activo
  externamente, permite señalar candidatos a "plugin inactivo/obsoleto"
  (requisito A4 del plan).
- **Whitelist de comandos WP-CLI de solo lectura**: mismo patrón que la
  herramienta `ejecutar_comando` del núcleo de Jarvis — una lista fija y
  cerrada de comandos permitidos (`wp plugin list --format=json`,
  `wp db size`, `wp core version`, una query de solo lectura para detectar
  tablas huérfanas). Nunca se ejecuta un comando fuera de esa lista, y
  ningún comando de la lista modifica el sitio. Esto es lo que mantiene la
  herramienta en riesgo nivel 1 a pesar de tener acceso real al servidor.

## Credenciales SSH: cifrado híbrido

Cada sitio tiene su propia credencial SSH (host, usuario, clave privada),
y ese número de sitios crece con el tiempo (hoy 4, mañana más clientes) —
una variable de entorno por sitio no escala ni permite que Jarvis registre
sitios nuevos dinámicamente. Se adopta un esquema híbrido:

- Una **clave maestra de cifrado**, única y fija, vive en una variable de
  entorno del servidor (nunca en la base de datos).
- Las credenciales SSH de cada sitio se guardan en la base de datos
  **cifradas con esa clave maestra** — nunca en texto plano, ni en la base
  de datos ni en logs.

Esto satisface el requisito ya establecido en el spec del núcleo de Jarvis
("credenciales externas cifradas en reposo, nunca en texto plano") y es la
primera herramienta del catálogo que efectivamente lo necesita.

## Contenido del reporte PDF (por sitio)

- **Encabezado**: nombre del sitio, URL, cliente/entidad, fecha de la
  auditoría.
- **Rendimiento**: scores de PageSpeed (mobile/desktop) y Core Web Vitals,
  con indicador de si cumple el objetivo del plan (Lighthouse ≥ 90 =
  "Bueno").
- **Seguridad**: versión de WordPress, vulnerabilidades encontradas por
  WPScan con severidad, componentes desactualizados.
- **Plugins**: lista completa con versión, cruzando detección externa
  (WPScan) e interna (WP-CLI) para señalar candidatos a eliminar.
- **Base de datos** (WP-CLI): tamaño total, hallazgos de tablas/transients
  huérfanos.

Cada hallazgo lleva una **etiqueta de severidad** (Crítica/Alta/Media,
mismo criterio de la tabla de actividades del plan real) para alimentar
directamente la matriz de priorización de S0.3, en vez de tener que
evaluar cada hallazgo a mano desde cero.

## Ejecución en lote

Además de `auditar_sitio_wordpress(sitio)` para un sitio puntual,
`auditar_todos_los_sitios()` recorre todos los sitios registrados en la
memoria de Jarvis y genera un PDF por cada uno, devolviendo un resumen
("Auditoría completa: 4 sitios, 2 con vulnerabilidades críticas, informes
listos").

## Manejo de errores

- **API externa caída o con cuota agotada** (PageSpeed o WPScan): la
  sección correspondiente del reporte se marca explícitamente como "no
  disponible en este momento" — nunca se inventa un dato. El resto del
  reporte se genera igual.
- **Falla la conexión SSH**: la sección de base de datos queda marcada
  como "no disponible — no se pudo conectar al servidor"; el resto del
  reporte (rendimiento + seguridad + plugins) se entrega completo.
- **Comando WP-CLI fuera de la whitelist**: se rechaza sin ejecutar nada,
  mismo patrón que `ejecutar_comando` — nunca se corre texto libre por SSH.
- **Sitio no registrado en la memoria**: Jarvis avisa y pide la URL para
  registrarlo antes de auditar.
- **Auditoría en lote con fallos parciales**: un sitio que falla no
  bloquea a los demás — los PDFs que sí se pudieron generar se entregan, y
  el resumen final aclara cuál falló y por qué.

## Testing

- **Unitario — whitelist de comandos WP-CLI**: un comando fuera de la
  lista nunca llega a ejecutarse por SSH (mismo test crítico que
  `ejecutar_comando`).
- **Unitario — cifrado de credenciales**: guardar una credencial SSH,
  leerla de vuelta, confirmar que en la base de datos nunca queda en
  texto plano y que el ciclo cifrado/descifrado con la clave maestra
  funciona.
- **Unitario — agregación del reporte**: con respuestas mockeadas de
  PageSpeed/WPScan/WP-CLI, confirmar que el PDF arma las secciones
  correctas y que una fuente caída no rompe el reporte completo.
- **Integración — flujo completo de un sitio**: mockeando las 3 fuentes de
  datos, correr `auditar_sitio_wordpress` de punta a punta y confirmar que
  el PDF se genera con el contenido esperado.
- **Integración — lote con falla parcial**: 2 sitios ok + 1 con SSH caído,
  confirmar que los 2 PDFs buenos se generan y el resumen reporta el
  fallo del tercero sin frenar todo el lote.

## Hoja de ruta de sub-proyectos (referencia, no parte de este spec)

El plan real de la Fundación Esplai tiene mucho más automatizable que solo
auditoría — pero mezclarlo todo en un spec produce el mismo problema que
"un Jarvis completo": demasiadas piezas de riesgo y complejidad distinta a
la vez. Se descompone en sub-proyectos independientes, cada uno con su
propio ciclo spec → plan → implementación:

1. **Auditoría y reporting** (este spec) — riesgo nivel 1, solo lectura.
2. **Mantenimiento activo** — actualizar WordPress core/temas/plugins (L1),
   eliminar plugins inactivos (L2), limpiar y optimizar la base de datos
   (L3/L6), configurar backups automáticos (L5). Todas acciones de riesgo
   nivel 3: Jarvis las prepara pero siempre exige confirmación antes de
   tocar un sitio en producción — se apoya directamente en los hallazgos
   que produce la herramienta de auditoría de este spec.
3. **Optimización de rendimiento** — instalar/configurar caché,
   minificación de CSS/JS, CDN, compresión GZIP/Brotli (Fase 2 del plan).
   Riesgo nivel 3, mismo patrón de confirmación.
4. **Endurecimiento de seguridad** — cabeceras de seguridad (HSTS, CSP),
   WAF, permisos de archivos (Fase 3 del plan). Riesgo nivel 3.

Las Fases 4-6 del plan (desarrollo de Custom Post Types/hooks/shortcodes,
rediseño de identidad visual, base de datos compartida) son desarrollo de
software real, no automatización — Jarvis puede asistir como herramienta
de código en ese trabajo, pero no requieren una herramienta nueva en su
catálogo, por lo que no forman parte de esta hoja de ruta.

## Fuera de alcance de este spec (explícito)

- Cualquier acción que modifique un sitio (actualizar plugins/core,
  limpiar la base de datos, configurar WAF/cabeceras de seguridad) — eso
  es el sub-proyecto de "mantenimiento activo" (Fase 1+ del plan real),
  con herramientas de riesgo nivel 2/3 y confirmación obligatoria.
- Auditoría de código PHP/CSS personalizado (A5 del plan) — requiere
  acceso al repositorio de código del tema, no solo al servidor en vivo;
  queda para una herramienta aparte si se decide automatizar.
- Generación automática de la matriz de priorización de S0.3 — el reporte
  entrega los hallazgos con severidad ya etiquetada, pero la priorización
  final entre sitios/tareas sigue siendo una decisión humana.
- Rediseño, identidad visual, desarrollo custom (Fases 4-5 del plan) — no
  relacionado con auditoría, fuera de alcance de esta herramienta.
