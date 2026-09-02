# Jarvis — Núcleo Conversacional (Módulo 1) — Design Spec

**Fecha:** 2026-09-02
**Estado:** Aprobado para pasar a plan de implementación
**Alcance:** Primer módulo de la plataforma "Jarvis". Los demás módulos
(vigilancia/análisis de proyectos, automatización de procesos personales,
integraciones externas más profundas) quedan en el roadmap, fuera de este spec.

## Resumen

Jarvis es un asistente personal tipo "Iron Man" — proyecto de uso propio y de
portfolio. Dado que "un Jarvis completo" es una categoría de producto y no un
proyecto único, se decidió descomponerlo en módulos independientes. Este spec
cubre el **núcleo conversacional**: la base sobre la que se cuelgan las demás
capacidades — chat con voz, memoria de contexto personal, identidad visual, y
ejecución de acciones reales con un modelo de permisos por nivel de riesgo.

## Roadmap de módulos (referencia, no parte de este spec)

1. **Núcleo conversacional** (este spec).
2. Vigilancia/análisis de proyectos (reutiliza gran parte del diseño de la
   plataforma de auditoría de código ya spec'ada por separado).
3. Automatización de procesos personales (mail, calendario, reportes
   recurrentes).
4. Integraciones más profundas con herramientas externas (actuar sobre
   servicios, no solo informar).
5. Identidad visual avanzada — rostro de partículas fotorrealista (ver
   sección "Identidad visual" más abajo) y/o presencia física.

## Decisiones de alcance para el núcleo conversacional

- **Usuario**: single-user, sin multi-tenancy. Es una instancia personal.
- **Interacción**: chat + voz desde el arranque (no solo texto).
- **Acciones**: Jarvis puede ejecutar acciones reales (no solo conversar)
  desde el arranque, con un modelo de permisos por nivel de riesgo.
- **Memoria**: cubre las 4 dimensiones necesarias desde el día uno —
  contexto de proyectos, historial de conversaciones, preferencias
  personales, y datos externos conectados.

## Enfoque de arquitectura del núcleo de razonamiento: opción C (elegida)

Se evaluaron 3 enfoques:

- **A. Todo construido desde cero** (motor de razonamiento, tool-calling y
  memoria propios): control total, pero reinventa infraestructura ya resuelta
  — meses de trabajo en lo que menos importa mostrar.
- **B. Framework de terceros de orquestación/memoria** (ej. LangGraph,
  MemGPT/Letta) + Claude como motor de razonamiento: arranca más rápido, pero
  para portfolio pesa menos (la ingeniería visible es ajena) y agrega una
  dependencia externa.
- **C. Elegida — API de Claude (tool use) como motor de razonamiento, con
  memoria e integraciones propias**: no se reinventa el modelo de lenguaje ni
  el tool-calling (lo resuelve la API), pero sí se construyen y muestran en
  portfolio las partes genuinamente propias: arquitectura de memoria, diseño
  de herramientas/permisos, integración de voz e identidad visual.

## Arquitectura y stack

- **Frontend**: Next.js. Interfaz de chat con soporte de voz (mic de entrada,
  audio de salida) y el orbe 3D como indicador visual central (ver sección
  "Identidad visual").
- **Backend**: API en Node.js. Por cada mensaje: arma el contexto (memoria
  relevante + herramientas disponibles) y llama a la API de Claude con
  tool-calling habilitado. El backend es el orquestador — no hay capa de
  terceros intermedia para el razonamiento.
- **Motor de razonamiento**: Claude, vía API directa.
- **Base de datos**: Postgres (Supabase) — conversaciones, memoria
  estructurada (proyectos, preferencias), y log de auditoría de acciones
  ejecutadas.
- **Despliegue**: corre 24/7 en un servidor/VPS propio (no serverless
  puro), porque los módulos futuros (vigilancia programada) necesitan un
  proceso siempre disponible.

## Identidad visual

Se evaluaron 3 direcciones de estilo (HUD futurista, chat limpio, terminal) y
se definió el elemento central: un **orbe 3D animado** como avatar de Jarvis,
inspirado en el estilo "IA holográfica" (referencia visual: rostro de
partículas estilo Iron Man aportada por el usuario).

**Decisión**: en vez de construir el motor de partículas/shaders desde cero,
se adopta/adapta un componente ya existente y production-ready:

- **[ElevenLabs UI — Orb](https://ui.elevenlabs.io/docs/components/orb)**:
  componente de orbe 3D en Three.js con reactividad de audio y estados de
  agente ya resueltos (escuchando/hablando/pensando). Es la base elegida
  para el MVP — reduce lo que sería un proyecto de semanas de renderizado a
  una integración de días.
- Referencia de inspiración adicional:
  **[my-jarvis](https://github.com/harsh-raj00/my-jarvis)** (React + Three.js
  + FastAPI + Gemini), que implementa una interfaz holográfica similar con
  esfera de partículas, anillos orbitales y reactividad de audio — usar como
  referencia de diseño, no como dependencia.

**Estados visuales del orbe** (definidos y validados con mockups):

- **En espera**: pulso lento y tenue, presente pero no invasivo.
- **Escuchando**: pulso más rápido y notorio, reacciona a la voz del usuario
  en tiempo real.
- **Pensando**: anillos girando en direcciones opuestas, señal clara de
  procesamiento.
- **Hablando**: se transforma en un ecualizador simple mientras responde por
  voz.

**Fuera de alcance del MVP**: el rostro fotorrealista de partículas (como la
imagen de referencia original) queda como evolución futura del mismo
componente — se reemplaza sin tocar el resto de la interfaz, ya que el orbe
vive detrás de una interfaz visual aislada del resto del chat.

## Sistema de memoria

Cuatro tipos, cada uno con estrategia propia:

1. **Contexto de proyectos** — estructurado en Postgres:
   `{proyecto, estado, descripción, decisiones_clave, última_actualización}`.
   Se actualiza cuando el usuario lo menciona explícitamente o cuando una
   herramienta reporta un cambio.

2. **Historial de conversaciones** — se persiste todo, pero no se envía todo
   a cada llamada. Se mantiene un resumen progresivo: la conversación vieja
   se resume periódicamente y se descarta el detalle crudo, dejando solo lo
   relevante (mismo patrón que usa Claude Code para conversaciones largas).

3. **Preferencias personales** — tabla simple `{clave, valor}` (tono,
   nivel de detalle, horarios). Se inyecta completa en cada llamada por ser
   chica.

4. **Datos externos conectados** — memoria "viva": no se cachea una copia
   local que se desactualiza. Cuando hace falta info de calendario/mail,
   Jarvis llama a la herramienta correspondiente en el momento. Solo
   persisten localmente qué servicios están conectados y sus credenciales.

**Armado de contexto por mensaje**: selección relevante (proyectos
mencionados recientemente + resumen de conversación + preferencias
completas), no el volcado completo de toda la memoria — para no inflar
costo/latencia de cada llamada.

## Herramientas, acciones y modelo de permisos

Cada herramienta tiene un **nivel de riesgo** que determina si necesita
confirmación:

- **Nivel 1 — Solo lectura**: se ejecuta directo, sin preguntar. Ej.
  `consultar_estado_proyecto`, `leer_calendario`, `buscar_en_memoria`.
- **Nivel 2 — Acción reversible de bajo impacto**: se ejecuta y se avisa
  después, sin bloquear la conversación. Ej. `crear_recordatorio`,
  `guardar_nota_de_proyecto`. Queda logueada y es fácil de deshacer.
- **Nivel 3 — Acción irreversible o con impacto externo**: requiere
  confirmación explícita antes de ejecutar. Ej. `enviar_mail`,
  `ejecutar_comando`, `disparar_análisis_de_repo` (si consume
  créditos/dinero). Jarvis muestra la acción propuesta y solo la ejecuta
  tras un sí explícito.

**Whitelist de comandos**: `ejecutar_comando` nunca corre texto libre —
lista cerrada de comandos permitidos con parámetros validados, para evitar
que una mala interpretación del modelo (o un futuro prompt injection desde
contenido externo) ejecute algo destructivo.

**Log de auditoría**: toda acción (niveles 1, 2 y 3) queda registrada con
timestamp, herramienta, parámetros y resultado.

## Voz

- **Entrada (speech-to-text)**: Web Speech API del navegador en el MVP —
  sin infraestructura propia, funciona bien en Chrome.
- **Salida (text-to-speech)**: misma estrategia — Web Speech API primero;
  la síntesis está aislada detrás de una interfaz simple (`texto → audio`)
  para poder reemplazarla por un proveedor tipo ElevenLabs más adelante sin
  tocar el resto del sistema.
- **Limitación aceptada en el MVP**: dependencia del navegador (mejor
  soporte en Chrome), sin funcionamiento offline. Aceptable por ser uso
  personal, no un producto de terceros.
- **Regla de seguridad para voz + nivel 3**: cualquier acción nivel 3
  pedida por voz igual muestra la confirmación en pantalla (texto), nunca
  solo por audio, para evitar ejecutar algo irreversible por un error de
  reconocimiento de voz.

## Seguridad de datos

- Credenciales/tokens de servicios externos cifrados en reposo, nunca en
  texto plano ni en logs.
- El log de auditoría no debe contener secretos ni contenido sensible
  innecesario en texto plano.
- Autenticación fuerte propia para el acceso remoto al servidor 24/7 (no
  depender solo de "está en mi red privada"), porque una exposición
  accidental permitiría a un tercero hacer que Jarvis actúe en tu nombre.

## Manejo de errores

- Si una herramienta falla, Jarvis lo informa explícitamente — nunca
  finge que una acción se completó.
- Si el reconocimiento de voz transcribe mal, Jarvis muestra lo que
  entendió antes de actuar sobre eso.
- Si se corta la conexión a mitad de una acción nivel 3, se verifica el
  resultado real contra el servicio externo antes de loguearla como
  "hecha" — nunca queda en un estado ambiguo.

## Testing

- Unitario: el clasificador de nivel de riesgo de herramientas — el test
  más crítico del proyecto es que ninguna acción nivel 3 se ejecute sin
  pasar por confirmación.
- Integración: cada herramienta con el servicio externo mockeado,
  verificando validación de parámetros antes de ejecutar.
- End-to-end: hablarle/escribirle → Jarvis arma una acción nivel 3 → pide
  confirmación → se confirma → se ejecuta → queda logueada.

## Fuera de alcance de este spec (explícito)

- Módulos 2 a 4 del roadmap (vigilancia de proyectos, automatización de
  procesos, integraciones profundas).
- Rostro de partículas fotorrealista completo (evolución futura del orbe).
- Soporte multi-usuario/multi-tenant.
- Proveedor de voz de calidad superior (ElevenLabs u otro) — queda como
  mejora futura aislada detrás de la interfaz `texto → audio`.
- Funcionamiento offline o fuera de navegadores con buen soporte de Web
  Speech API.
