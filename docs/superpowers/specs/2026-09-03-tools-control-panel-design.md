# Jarvis — Panel de Control de Herramientas + Macros — Design Spec

**Fecha:** 2026-09-03
**Estado:** Aprobado para pasar a plan de implementación
**Alcance:** Segundo incremento sobre el núcleo conversacional (spec
`2026-09-02-jarvis-conversational-core-design.md`). Cubre un panel visual que
lista todas las herramientas disponibles, permite dispararlas directamente
("macros") sin pasar por el chat, y muestra el historial reciente de
ejecuciones. La conexión directa a servidores MCP externos queda
explícitamente fuera de este spec — es una pieza independiente y más grande
(requiere decidir cómo se le asigna nivel de riesgo a una herramienta de
terceros) que se aborda en un spec propio más adelante.

## Motivación

El chat de Jarvis depende de que el usuario sepa pedirle las cosas en
lenguaje natural. Para que sea una herramienta accesible para alguien no
técnico ("para dummies"), hace falta una superficie visual donde se vea de
un vistazo qué puede hacer Jarvis y se puedan disparar esas acciones con un
formulario simple, sin necesidad de escribir nada.

## Decisiones de alcance

- El panel **no agrega herramientas nuevas** — muestra exactamente las que ya
  existen en `TOOLS` (`src/lib/tools/registry.ts`). Cualquier herramienta que
  se agregue en el futuro aparece automáticamente en el panel sin tocarlo,
  porque el formulario se genera desde el `inputSchema` de cada herramienta,
  no está hardcodeado por nombre.
- El invariante más importante del proyecto — **ninguna herramienta de
  riesgo 3 se ejecuta sin confirmación explícita** — se mantiene con una sola
  implementación server-side (`src/lib/orchestrator/pending-actions.ts`),
  reusada tanto por el chat como por el panel. El panel no reimplementa este
  mecanismo por separado.
- El panel vive en su propia ruta (`/panel`), protegida por el mismo
  `proxy.ts` que ya protege toda la app — no hace falta tocar la
  autenticación.
- Fuera de alcance: conexión a MCP externo, edición/borrado de herramientas
  desde el panel, programar macros recurrentes (eso es parte del roadmap de
  automatización, módulo 3).

## Arquitectura

```
/panel (Server Component)
  → trae TOOLS (registry) + últimas N filas de audit_log
  → renderiza <ToolCard> por cada herramienta
       → <DynamicForm> generado desde tool.inputSchema
       → al enviar: POST /api/tools/execute { toolName, input }
            - riesgo 1/2 → ejecuta, loguea, devuelve { type: 'message', text }
            - riesgo 3    → crea pending_action, devuelve
                            { type: 'confirmation_required', pendingId, summary }
                            → <ConfirmationBanner> (reusado del chat)
                            → al confirmar: POST /api/confirm { pendingId, confirmed }
                              (mismo endpoint que ya usa el chat)
  → <AuditLogList> con el historial
```

### Por qué reusar `pending-actions` y `/api/confirm` en vez de un mecanismo propio

Duplicar la lógica de "riesgo 3 requiere confirmación" en un segundo lugar
(uno para chat, uno para el panel) es exactamente el tipo de cosa que puede
divergir con el tiempo y crear un agujero de seguridad. En cambio, el panel
reusa el mismo pending-action store y el mismo endpoint `/api/confirm` que
ya usa el chat — hay una sola implementación de la garantía crítica del
sistema, ejercitada por dos superficies distintas.

**Cambio necesario en `pending-actions.ts`:** hoy `createPendingAction`
exige `conversationId`. Se hace opcional (`conversationId?: string`), porque
una acción disparada desde el panel no pertenece a ninguna conversación.

**Cambio necesario en `handleConfirmation`:** hoy, después de ejecutar la
herramienta confirmada, siempre le vuelve a preguntar al modelo de lenguaje
que redacte una respuesta de texto para el chat. Si el `pending_action` no
tiene `conversationId` (vino del panel), ese paso no tiene sentido — se
devuelve directamente el `result.message` de la herramienta, sin llamar al
modelo.

## Componentes de UI

Estilo HUD consistente con el resto de la app (paleta de `globals.css`,
tipografía monoespaciada, mismos acentos cian/ámbar).

- **`src/app/panel/page.tsx`** — Server Component. Trae `TOOLS` del registry
  y las últimas 20 filas de audit log en paralelo. No requiere
  `conversationId` (a diferencia de `/`, esta página no depende de una
  conversación).
- **`src/components/panel/ToolCard.tsx`** — una tarjeta por herramienta:
  nombre, descripción, badge de nivel de riesgo con color
  (`1` verde / `2` ámbar / `3` rojo), y el `<DynamicForm>`.
- **`src/components/panel/DynamicForm.tsx`** — genera inputs desde
  `tool.inputSchema` (JSON Schema simple, el mismo formato que ya usan las
  herramientas): `type: 'string'` → `<input type="text">`,
  `format: 'date-time'` → `<input type="datetime-local">`, `enum` → `<select>`.
  Campos listados en `required` se marcan obligatorios.
- Para la revisión de una acción de riesgo 3 disparada desde el panel, se
  reusa directamente el componente `ConfirmationBanner` ya existente
  (`src/components/chat/ConfirmationBanner.tsx`) — su interfaz
  (`summary`, `onConfirm`, `onCancel`) ya es genérica y no depende del chat,
  así que no hace falta un componente nuevo.
- **`src/components/panel/AuditLogList.tsx`** — lista de las últimas
  ejecuciones: herramienta, cuándo (relativo, ej. "hace 4 min"), nivel de
  riesgo, éxito/error.

## Backend

- **`POST /api/tools/execute`** — body `{ toolName: string, input: unknown }`.
  - Valida que `toolName` exista en el registry (404 si no).
  - Riesgo 1/2: ejecuta `tool.execute(input, { conversationId: undefined })`,
    loguea con `logToolExecution`, responde
    `{ type: 'message', text: result.message }`.
  - Riesgo 3: crea la pending action (sin `conversationId`) y responde
    `{ type: 'confirmation_required', pendingId, toolName, summary }` — nunca
    ejecuta.
- **`/api/confirm`** (ya existe) — sin cambios de contrato externo; por
  dentro, `handleConfirmation` rama según si `pending.conversationId` está
  presente.
- **`src/lib/tools/audit.ts`** — se agrega
  `getRecentAuditLog(limit: number): Promise<AuditLogRow[]>`.

## Manejo de errores

- Si `toolName` no existe en el registry: 404 con mensaje claro, el panel lo
  muestra como error en la tarjeta correspondiente.
- Si `tool.execute` falla (ya sea riesgo 1/2 directo o riesgo 3 confirmado):
  se loguea igual (con `success: false`) y el panel muestra el mensaje de
  error de la herramienta — mismo comportamiento que el chat, nunca se
  finge éxito.
- Si el usuario cierra el panel con una confirmación de riesgo 3 pendiente
  sin confirmar ni cancelar: la `pending_action` queda huérfana en memoria
  (mismo comportamiento que ya tiene el chat hoy — no hay expiración
  automática, está fuera de alcance de este spec igual que lo está para el
  chat).

## Testing

- **Unitario — `DynamicForm`:** genera el tipo de input correcto según cada
  variante de `inputSchema` (string, date-time, enum, requerido vs.
  opcional).
- **Integración — `/api/tools/execute`:**
  - Herramienta de riesgo 1/2: ejecuta inmediatamente, la respuesta incluye
    el resultado, `logToolExecution` se llama una vez.
  - Herramienta de riesgo 3: **el test crítico** — nunca se ejecuta en esta
    llamada, la respuesta es `confirmation_required`, `execute` no se
    invocó.
  - Confirmar una acción de riesgo 3 originada en el panel (sin
    `conversationId`): se ejecuta exactamente una vez, se loguea, y la
    respuesta es el resultado crudo de la herramienta (sin llamada al
    modelo de lenguaje).
- **Regresión:** el flujo de confirmación de riesgo 3 iniciado desde el
  *chat* (con `conversationId`) sigue funcionando exactamente igual que
  antes — mismo test de integración existente
  (`tests/integration/risk3-confirmation-flow.test.ts`), sin cambios.

## Fuera de alcance de este spec (explícito)

- Conexión a servidores MCP externos (spec propio, pendiente).
- Editar, deshabilitar o eliminar herramientas desde el panel.
- Programar macros para que se disparen solas (roadmap módulo 3,
  automatización de procesos).
- Expirar `pending_actions` automáticamente (deuda técnica preexistente,
  compartida con el chat).
