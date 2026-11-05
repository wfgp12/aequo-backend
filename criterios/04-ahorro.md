# Criterios de aceptación — 4. Ahorro

Estado: Aprobado (2026-11-04)

## Paquete 4.1.1 — Modelar entidad Meta de ahorro (RF-21)

### Alcance

Entra **solo la entidad** (esquema Mongoose) de la meta de ahorro. El CRUD, los endpoints, el ajuste de una meta existente (CU-10, flujo 2a), el cálculo del monto disponible (RF-22) y el del ahorro acumulado (RF-23) son de los paquetes siguientes y **no** se cubren aquí. Los criterios describen lo que el modelo acepta, lo que rechaza con error de validación y las restricciones de unicidad que declara, de modo que se puedan probar sin endpoints (`validateSync()` sobre un modelo creado con el esquema y lectura de `schema.indexes()`, igual que `src/transacciones/transaccion.schema.spec.ts` y `src/usuarios/usuario.schema.spec.ts`; el repo no tiene una base en memoria con índices reales, así que la unicidad se verifica por el índice declarado).

### Fuentes

- RF-21 (Especificación de Requisitos): «definir una meta de ahorro mensual, ya sea como porcentaje de sus ingresos o como monto fijo».
- CU-10 y modelo lógico de `metasahorro` (Documento de Diseño Técnico v2.0): campos `usuarioId` (FK, index), `tipoMeta: TipoMeta`, `valorObjetivo: Number`, `periodo: Date` (index), `ahorroReal: Number`; enumeración `TipoMeta` = `PORCENTAJE`, `MONTO_FIJO`. CU-10 dice que el porcentaje es «del ingreso propio» y que si ya existe una meta del periodo se ajusta «en vez de duplicarla».
- `CLAUDE.md` sección 5: `metasahorro` es una instancia **mensual** (un documento por periodo con su `ahorroReal`); el acumulado se calcula, no se almacena; el campo del usuario se llama exactamente `usuarioId`; `TipoMeta` es una enumeración cerrada validada en el esquema; relaciones por referencia (ADR-001). El ingreso propio excluye `DINERO_RECIBIDO` (ADR-014), pero esa base la usa el cálculo del disponible (RF-22), no el esquema.

### Contrato de nombres (aprobado)

- Enumeración `TipoMeta` con exactamente los valores `PORCENTAJE` y `MONTO_FIJO`, en `src/ahorro/meta-ahorro.enums.ts`.
- Esquema `MetaAhorroSchema` y entidad `MetaAhorro`, en `src/ahorro/meta-ahorro.schema.ts`; colección `metasahorro`.

### Discrepancia detectada con el tablero de Notion

El tablero de Notion resume este paquete como «meta con monto objetivo y plazo». Eso **no** coincide con RF-21 ni con el diseño v2.0: la meta es **mensual** (el plazo es el propio mes, el `periodo`, no una fecha límite) y se define como **porcentaje del ingreso propio o monto fijo**, no como un único monto a alcanzar. El nombre `valorObjetivo` del modelo lógico probablemente originó la lectura de «monto objetivo». Estos criterios siguen RF-21 y el diseño; conviene corregir el texto del tablero.

### Decisiones aprobadas por el desarrollador (2026-11-04)

1. Rutas del esquema y de la enumeración: las del contrato de nombres.
2. El esquema lleva `createdAt` y `updatedAt` (`timestamps`).
3. `valorObjetivo` = 0 se rechaza para ambos tipos.
4. Porcentaje: número de 0 a 100 (20 = 20 %), mayor que 0 y hasta 100 inclusive.
5. Un monto fijo mayor que el ingreso propio del mes lo acepta el modelo; lo trata el cálculo del disponible (RF-22).
6. `periodo` se normaliza al primer día del mes a las 00:00 UTC; se aceptan periodos futuros y antiguos.
7. `ahorroReal` es opcional y vale 0 por defecto.
8. `ahorroReal` negativo se acepta.

---

## RF-21 — Meta de ahorro mensual (porcentaje o monto fijo)

### Forma del documento

#### CA-RF21-01 — Una meta de porcentaje válida se acepta

- **Dado** un `usuarioId` válido
- **Cuando** se crea una meta con `tipoMeta` `PORCENTAJE`, `valorObjetivo` 20, `periodo` `2026-11-01` (UTC) y sin `ahorroReal`
- **Entonces** la validación no reporta errores y el documento conserva esos valores

#### CA-RF21-02 — Una meta de monto fijo válida se acepta

- **Dado** un `usuarioId` válido
- **Cuando** se crea una meta con `tipoMeta` `MONTO_FIJO`, `valorObjetivo` 300000, `periodo` `2026-11-01` (UTC)
- **Entonces** la validación no reporta errores y el documento conserva esos valores

#### CA-RF21-03 — El documento guarda solo los campos del modelo

- **Dado** el esquema de la meta de ahorro
- **Cuando** se listan sus campos
- **Entonces** son exactamente `usuarioId`, `tipoMeta`, `valorObjetivo`, `periodo` y `ahorroReal` (más `_id`, `__v`, `createdAt` y `updatedAt`); **no** existe ningún campo de acumulado ni de plazo o fecha límite, porque el acumulado se calcula sumando el `ahorroReal` de cada periodo (CLAUDE.md sección 5) y la meta es mensual

#### CA-RF21-04 — La colección se llama `metasahorro` y registra fechas de creación y modificación

- **Dado** el esquema de la meta de ahorro
- **Cuando** se leen sus opciones
- **Entonces** la colección es `metasahorro` y `timestamps` está activo

### Usuario dueño

#### CA-RF21-05 — `usuarioId` es una referencia a usuario (ObjectId), llamada exactamente así

- **Dado** el esquema de la meta de ahorro
- **Cuando** se inspecciona el campo `usuarioId`
- **Entonces** es de tipo `ObjectId` con referencia a `Usuario` (ADR-001: sin documentos embebidos) y se llama exactamente `usuarioId`, de modo que `AuthService.eliminarCuenta()` encuentre y borre sola esta colección (RF-04)

#### CA-RF21-06 — Sin `usuarioId` la meta se rechaza

- **Dado** una meta con todos los demás campos válidos
- **Cuando** no trae `usuarioId` (ausente o `null`)
- **Entonces** la validación falla con error en `usuarioId` (a diferencia de `Categoria`, aquí no hay metas del sistema: siempre pertenece a un usuario)

#### CA-RF21-07 — Un `usuarioId` que no es un id se rechaza

- **Dado** una meta con los demás campos válidos
- **Cuando** `usuarioId` es el texto `no-es-un-id`
- **Entonces** la validación falla con error solo en `usuarioId`

### Tipo de meta (enumeración cerrada)

#### CA-RF21-08 — Se aceptan los dos valores de `TipoMeta`

- **Dado** una meta con los demás campos válidos
- **Cuando** `tipoMeta` es `PORCENTAJE` y, en otra meta, `MONTO_FIJO` (con un `valorObjetivo` compatible con cada tipo)
- **Entonces** ambas pasan la validación, y la enumeración `TipoMeta` tiene exactamente esos dos valores

#### CA-RF21-09 — Un tipo fuera de la enumeración se rechaza

- **Dado** una meta con los demás campos válidos
- **Cuando** `tipoMeta` es `OBJETIVO`, o `porcentaje` en minúsculas, o un texto vacío
- **Entonces** la validación falla con error solo en `tipoMeta` (la enumeración es cerrada y distingue mayúsculas)

#### CA-RF21-10 — Sin tipo de meta se rechaza

- **Dado** una meta con los demás campos válidos
- **Cuando** no trae `tipoMeta`
- **Entonces** la validación falla con error en `tipoMeta`

### Valor de la meta

#### CA-RF21-11 — Sin valor objetivo se rechaza

- **Dado** una meta con los demás campos válidos
- **Cuando** no trae `valorObjetivo` (ausente o `null`)
- **Entonces** la validación falla con error en `valorObjetivo`

#### CA-RF21-12 — Un valor que no es número se rechaza

- **Dado** una meta con los demás campos válidos
- **Cuando** `valorObjetivo` es el texto `veinte`
- **Entonces** la validación falla con error en `valorObjetivo`

#### CA-RF21-13 — Un valor negativo se rechaza, sea cual sea el tipo

- **Dado** una meta con los demás campos válidos
- **Cuando** `valorObjetivo` es −1 con `tipoMeta` `PORCENTAJE`, y −50000 con `tipoMeta` `MONTO_FIJO`
- **Entonces** ambas fallan con error en `valorObjetivo`

#### CA-RF21-14 — Un valor en cero se rechaza, sea cual sea el tipo

- **Dado** una meta con los demás campos válidos
- **Cuando** `valorObjetivo` es 0 con `tipoMeta` `PORCENTAJE`, y 0 con `tipoMeta` `MONTO_FIJO`
- **Entonces** ambas fallan con error en `valorObjetivo` (una meta de 0 % o de $0 equivale a no tener meta; igual que `Transaccion.monto`, debe ser mayor que cero)

#### CA-RF21-15 — Un porcentaje dentro de (0, 100] se acepta; uno fuera del rango se rechaza

- **Dado** una meta `PORCENTAJE` con los demás campos válidos
- **Cuando** `valorObjetivo` es 0,5, 12,5, 20 o 100, y en otras metas 100,01 o 150
- **Entonces** los primeros pasan la validación y los segundos fallan con error en `valorObjetivo` (el porcentaje se guarda como número de 0 a 100: 20 significa 20 %, no 0,20; admite decimales; no se puede ahorrar más del 100 % del ingreso propio)

#### CA-RF21-16 — Un monto fijo positivo se acepta, sin tope superior en el modelo

- **Dado** una meta `MONTO_FIJO` con los demás campos válidos
- **Cuando** `valorObjetivo` es 1, 300000, 1500000,50 o 999999999
- **Entonces** todas pasan la validación (el valor es en pesos colombianos y admite decimales; el esquema no conoce los ingresos, así que no compara el monto con ellos: eso lo trata el cálculo del disponible, RF-22)

### Periodo mensual

#### CA-RF21-17 — Sin periodo se rechaza

- **Dado** una meta con los demás campos válidos
- **Cuando** no trae `periodo` (ausente o `null`)
- **Entonces** la validación falla con error en `periodo`

#### CA-RF21-18 — Un periodo que no es una fecha se rechaza

- **Dado** una meta con los demás campos válidos
- **Cuando** `periodo` es el texto `noviembre` o `2026-13-45`
- **Entonces** la validación falla con error solo en `periodo`

#### CA-RF21-19 — El primer día del mes a las 00:00 UTC se conserva tal cual

- **Dado** una meta con los demás campos válidos
- **Cuando** `periodo` es `2026-11-01T00:00:00Z`, y en otra meta `2026-02-01T00:00:00Z`
- **Entonces** ambas pasan la validación y `periodo` conserva exactamente esa fecha

#### CA-RF21-20 — Una fecha a mitad de mes se normaliza al primer día del mes a las 00:00 UTC

- **Dado** una meta con los demás campos válidos
- **Cuando** `periodo` es `2026-11-15T18:30:00Z`, o el último instante del mes `2026-11-30T23:59:59Z`, o el último instante del año `2026-12-31T23:59:59Z`
- **Entonces** el documento guarda `2026-11-01T00:00:00Z`, `2026-11-01T00:00:00Z` y `2026-12-01T00:00:00Z` respectivamente (el mes se calcula en UTC y el año no cambia), de modo que dos metas del mismo mes siempre chocan en el índice único de CA-RF21-22

#### CA-RF21-21 — Se aceptan periodos futuros y antiguos

- **Dado** una meta con los demás campos válidos
- **Cuando** `periodo` es `2035-06-01T00:00:00Z` o `2015-01-01T00:00:00Z`
- **Entonces** ambas pasan la validación (el modelo no limita el rango de fechas)

### Unicidad: una meta por usuario y periodo (CU-10, flujo 2a)

#### CA-RF21-22 — El esquema impide dos metas del mismo usuario en el mismo periodo

- **Dado** el esquema de la meta de ahorro
- **Cuando** se leen sus índices (`schema.indexes()`)
- **Entonces** existe un índice **único** sobre la combinación `usuarioId` + `periodo` (en ese orden), de modo que un segundo documento con el mismo usuario y el mismo periodo sería rechazado por la base con error de clave duplicada; el flujo de CU-10 2a («ajustarla en vez de duplicarla») lo resuelve el servicio de 4.1.2 sobre esa restricción

#### CA-RF21-23 — La unicidad es por usuario y por periodo, no global

- **Dado** el índice único de CA-RF21-22
- **Cuando** se inspeccionan los índices únicos del esquema
- **Entonces** el único índice único es el de `usuarioId` + `periodo`: no hay uno solo en `usuarioId` (un usuario puede tener una meta por cada mes) ni solo en `periodo` (usuarios distintos pueden tener meta el mismo mes), y no incluye `tipoMeta` (así un usuario no puede tener a la vez una meta de porcentaje y otra de monto fijo en el mismo mes)

### Ahorro real del periodo

#### CA-RF21-24 — `ahorroReal` es numérico y no acepta texto

- **Dado** una meta con los demás campos válidos
- **Cuando** `ahorroReal` es 150000 (aceptado) y, en otra meta, el texto `mucho` (rechazado)
- **Entonces** la primera pasa la validación y conserva el valor, y la segunda falla con error solo en `ahorroReal`

#### CA-RF21-25 — `ahorroReal` es opcional y vale 0 al crear la meta

- **Dado** una meta creada sin indicar `ahorroReal`
- **Cuando** se lee el documento
- **Entonces** `ahorroReal` vale 0 y la validación no reporta errores (la meta se define al inicio del mes, cuando todavía no hay ahorro real; el cálculo de RF-23 lo actualiza después)

#### CA-RF21-26 — `ahorroReal` negativo se acepta

- **Dado** una meta con los demás campos válidos
- **Cuando** `ahorroReal` es −25000
- **Entonces** pasa la validación y conserva el valor (RF-23 lo define como la diferencia entre lo presupuestado y lo gastado, que da negativo cuando se gasta más de lo presupuestado; el acumulado debe poder restarlo)

### Periodo inválido (agregado en refuerzo)

#### CA-RF21-27 — El error de un periodo inválido muestra el valor que se envió

> Agregado en refuerzo

- **Dado** una meta con los demás campos válidos
- **Cuando** `periodo` es el texto `noviembre` o `2026-13-45`
- **Entonces** el error de `periodo` (CA-RF21-18) menciona el texto tal como se envió, no una fecha inválida ya transformada, para que el mensaje de error que ve el cliente le diga qué valor fue el que no se pudo interpretar

---

## Paquete 4.1.2 — Implementar CRUD de metas (backend) (RF-21)

Estado: Aprobado (2026-11-05)

### Alcance

Entran los endpoints para **crear, listar, consultar, editar y eliminar** las metas de ahorro mensuales del usuario (criterio de la EDT: «el usuario puede crear, consultar, editar y eliminar sus metas»). **No** entran el monto disponible (RF-22), el ahorro acumulado ni las recomendaciones: la API de este paquete no calcula nada, solo guarda y devuelve la meta. `ahorroReal` se acepta por la API (D4); cuando RF-23 lo calcule habrá que revisar este contrato. La forma del documento (tipos, rangos, normalización del periodo, índice único) ya está cubierta por CA-RF21-01..27; aquí se verifica cómo la expone la API.

### Fuentes

- RF-21 y CU-10 (flujo principal: «define la meta del mes como porcentaje del ingreso propio o como monto fijo… guarda la meta asociada al periodo»; flujo 2a: «ya existe una meta para el periodo: el sistema permite ajustarla en vez de duplicarla»). Ni RF-21 ni CU-10 definen rutas, filtros, edición de campos concretos ni qué pasa al eliminar; lo que no estaba definido se resolvió con el desarrollador en las decisiones D1 a D9 de abajo.
- Convenciones del repo (`src/transacciones`, `src/categorias`, `src/reportes`): `usuarioId` siempre sale del JWT; un recurso inexistente o de otro usuario responde `404` con el mismo mensaje (nunca `403`); un id mal formado responde `400` (`IsMongoId`); `ValidationPipe` estricto (campo no declarado → `400`; `message` es un arreglo con un texto por problema que empieza por el nombre del campo); el cuerpo de error usa los esquemas de `src/common/dto/error-respuesta.dto.ts`; el `POST` que crea datos lleva `@Idempotente()`; el mes se escribe `YYYY-MM` (parámetro `mes` de reportes).
- `CLAUDE.md`: `metasahorro` es una instancia mensual; el campo del usuario se llama `usuarioId`.

### Contrato propuesto (lo consumirá el frontend en 4.1.3)

Todas las rutas requieren `Authorization: Bearer <accessToken>`. Base: `/ahorro/metas` (D1).

| Operación | Ruta | Cuerpo / query | Éxito |
|---|---|---|---|
| Crear | `POST /ahorro/metas` | `{ tipoMeta, valorObjetivo, periodo, ahorroReal? }` | `201` + meta |
| Listar | `GET /ahorro/metas?desde=YYYY-MM&hasta=YYYY-MM` | filtros opcionales | `200` + `{ items: [meta…] }` |
| Consultar | `GET /ahorro/metas/:id` | — | `200` + meta |
| Editar | `PATCH /ahorro/metas/:id` | `{ tipoMeta?, valorObjetivo?, periodo?, ahorroReal? }`, al menos uno; si va `tipoMeta`, va `valorObjetivo` (D6) | `200` + meta |
| Eliminar | `DELETE /ahorro/metas/:id` | — | `204` sin cuerpo (`409` si la meta tiene `ahorroReal` distinto de 0) |

La **meta** que devuelven todas las operaciones tiene exactamente estos campos (no trae `usuarioId`, `_id` ni `__v`):

```json
{
  "id": "66a0b3c4d5e6f70012ab34cd",
  "tipoMeta": "PORCENTAJE",
  "valorObjetivo": 20,
  "periodo": "2026-11",
  "ahorroReal": 0,
  "creadaEn": "2026-11-01T15:30:00.000Z",
  "actualizadaEn": "2026-11-01T15:30:00.000Z"
}
```

`periodo` se devuelve siempre como `YYYY-MM` (el día 1 UTC del documento); `valorObjetivo` y `ahorroReal` son números; `creadaEn` y `actualizadaEn` son ISO 8601 en UTC (de `createdAt` y `updatedAt`).

### Decisiones (D1 a D9 aprobadas por el desarrollador, 2026-11-05)

- **D1 — Ruta.** Aprobada: `/ahorro/metas` (`POST`, `GET`, `GET /:id`, `PATCH /:id`, `DELETE /:id`).
- **D2 — Formato de `periodo` en la API.** Aprobada: la entrada acepta `YYYY-MM` o una fecha de calendario real `YYYY-MM-DD` (cualquier día del mes, se normaliza al mes); la salida es siempre `YYYY-MM`.
- **D3 — Filtros del listado.** Aprobada: `desde` y `hasta` opcionales en `YYYY-MM`, ambos incluidos, combinables o por separado; sin paginación (hay a lo sumo una meta por mes).
- **D4 — `ahorroReal` por API.** Aprobada: `ahorroReal` **sí** se acepta por la API, opcional, al crear (`POST`) y al editar (`PATCH`). Es un número con las reglas del esquema (vale 0 si no se envía, negativos permitidos); un valor no numérico responde `400`. Se devuelve siempre en la respuesta. Nota: RF-23 dice que el ahorro real se calcula; cuando se implemente ese cálculo habrá que revisar este contrato (el desarrollador asume esta decisión).
- **D5 — Campos editables.** Aprobada: con `PATCH` se editan `tipoMeta`, `valorObjetivo`, `periodo` y `ahorroReal`. `periodo` acepta los mismos formatos que al crear (D2) y se normaliza al mes; si el nuevo mes ya tiene otra meta del mismo usuario responde `409` con el mensaje de duplicado de D9; mover una meta a su propio mes actual no es conflicto. Sigue D6 (si va `tipoMeta`, va `valorObjetivo`).
- **D6 — Cambiar el tipo en la edición.** Aprobada: al editar con `PATCH`, si el cuerpo trae `tipoMeta`, `valorObjetivo` es **obligatorio en el mismo cuerpo** (porcentaje y monto no son comparables, igual que `PATCH /transacciones/:id` exige `categoriaId` al cambiar el tipo); si falta, `400` con un texto que empieza por `valorObjetivo` y dice que debe enviarse junto con `tipoMeta`. Enviar solo `valorObjetivo` sigue siendo válido y se revalida contra el `tipoMeta` guardado (tope de 100 si es `PORCENTAJE`).
- **D7 — Meses pasados.** Aprobada: se pueden crear, editar y eliminar metas de cualquier mes, pasado o futuro (coherente con CA-RF21-21).
- **D8 — Eliminar una meta con ahorro registrado.** Aprobada: `DELETE` de una meta con `ahorroReal` distinto de 0 responde `409` y no la elimina; con `ahorroReal` 0 responde `204`.
- **D9 — Mensajes de error.** Aprobada: `404` con `Meta de ahorro no encontrada`; `409` por mes duplicado (al crear o al mover con `PATCH`) con `Ya existe una meta de ahorro para ese mes`; `409` al eliminar con ahorro con `No se puede eliminar una meta que ya tiene ahorro registrado` (`error` y `statusCode` según el formato estándar).

### Crear (`POST /ahorro/metas`)

#### CA-RF21-28 — Crear una meta de porcentaje

- **Dado** un usuario con sesión y sin metas
- **Cuando** envía `POST /ahorro/metas` con `{ "tipoMeta": "PORCENTAJE", "valorObjetivo": 20, "periodo": "2026-11" }`
- **Entonces** responde `201` con la meta en la forma del contrato: `tipoMeta` `PORCENTAJE`, `valorObjetivo` 20, `periodo` `"2026-11"`, `ahorroReal` 0, un `id` y las fechas `creadaEn` y `actualizadaEn`, sin `usuarioId`; y existe en la base un único documento con `usuarioId` del usuario y `periodo` `2026-11-01T00:00:00Z`

#### CA-RF21-29 — Crear una meta de monto fijo

- **Dado** un usuario con sesión y sin metas
- **Cuando** envía `{ "tipoMeta": "MONTO_FIJO", "valorObjetivo": 1500000.5, "periodo": "2026-12" }`
- **Entonces** responde `201` con `valorObjetivo` 1500000,5 (sin redondear: RNF-11) y `periodo` `"2026-12"`

#### CA-RF21-30 — El periodo puede escribirse como fecha completa y se normaliza al mes

- **Dado** un usuario con sesión
- **Cuando** crea una meta con `periodo` `2026-11-15`, otra con `2026-12-31` y otra con `2028-02-29` (bisiesto)
- **Entonces** las tres responden `201` y devuelven `periodo` `"2026-11"`, `"2026-12"` y `"2028-02"`, y en la base quedan con el día 1 a las 00:00 UTC

> Decisión D2 aprobada.

#### CA-RF21-31 — Un periodo mal escrito se rechaza

- **Dado** un usuario con sesión
- **Cuando** envía `periodo` `noviembre`, `2026-13`, `2026-00`, `2026-1`, `202611`, `2026-02-30`, `2027-02-29` (2027 no es bisiesto) o una fecha con hora como `2026-11-15T10:00:00Z`
- **Entonces** responde `400` con `message` (arreglo) cuyo texto empieza por `periodo`, y no se guarda nada

#### CA-RF21-32 — Faltan campos obligatorios

- **Dado** un usuario con sesión
- **Cuando** envía el cuerpo sin `tipoMeta`, o sin `valorObjetivo`, o sin `periodo`, o `{}`, o con alguno en `null`
- **Entonces** responde `400` con un texto por cada campo faltante que empieza por el nombre del campo, y no se guarda nada

#### CA-RF21-33 — Tipo de meta fuera de la enumeración

- **Dado** un usuario con sesión
- **Cuando** envía `tipoMeta` `OBJETIVO`, `porcentaje` o un texto vacío
- **Entonces** responde `400` con un texto que empieza por `tipoMeta`, y no se guarda nada

#### CA-RF21-34 — Valor objetivo que no es un número positivo

- **Dado** un usuario con sesión
- **Cuando** envía `valorObjetivo` 0, −5, `"veinte"` o el texto numérico `"20"` (con `tipoMeta` `PORCENTAJE` y `MONTO_FIJO`)
- **Entonces** responde `400` con un texto que empieza por `valorObjetivo`, y no se guarda nada (el JSON debe enviar un número, no un texto)

#### CA-RF21-35 — Límites del porcentaje y monto fijo sin tope

- **Dado** un usuario con sesión
- **Cuando** crea metas `PORCENTAJE` con `valorObjetivo` 0,5 y 100 (en meses distintos), y otras con 100,01 y 150
- **Entonces** las dos primeras responden `201` y las otras dos `400` con un texto que empieza por `valorObjetivo` que dice que un porcentaje no pasa de 100; una meta `MONTO_FIJO` de 999999999 responde `201`

#### CA-RF21-36 — Campos no declarados se rechazan

- **Dado** un usuario con sesión
- **Cuando** el cuerpo incluye además `usuarioId`, `id`, `createdAt`, `actualizadaEn` o cualquier otro campo
- **Entonces** responde `400` con un texto por el campo sobrante y no se guarda nada (la meta siempre es del usuario del JWT)

#### CA-RF21-37 — Ya existe una meta para ese mes: 409

- **Dado** un usuario con una meta `PORCENTAJE` de 20 para `2026-11`
- **Cuando** envía otra meta para `2026-11` (del mismo tipo, de otro tipo, o con `periodo` `2026-11-20`)
- **Entonces** responde `409` con el mensaje de D9 y la meta original queda intacta (mismo `valorObjetivo`, mismo `tipoMeta`); la base sigue teniendo un solo documento de ese mes (CU-10 2a: el cliente la ajusta con `PATCH` en vez de duplicarla)

#### CA-RF21-38 — La unicidad es por usuario y por mes

- **Dado** el usuario A con meta para `2026-11`
- **Cuando** el usuario B crea una meta para `2026-11`, y A crea otra para `2026-12`
- **Entonces** ambas responden `201`

#### CA-RF21-39 — Dos peticiones simultáneas para el mismo mes: una gana, la otra 409

- **Dado** un usuario sin meta para `2026-11`
- **Cuando** envía a la vez dos `POST` con claves de idempotencia distintas para ese mes
- **Entonces** una responde `201` y la otra `409` (nunca `500`), y queda un solo documento

#### CA-RF21-40 — Una repetición con la misma clave de idempotencia no crea otra meta

- **Dado** un usuario que envía `POST /ahorro/metas` con header `Idempotency-Key` y obtiene `201`
- **Cuando** repite la misma petición con la misma clave
- **Entonces** recibe la misma respuesta `201` (mismo `id`) con el header `Idempotent-Replayed: true` y no hay un segundo documento ni un `409`

#### CA-RF21-41 — La misma clave con una petición distinta se rechaza

- **Dado** una clave de idempotencia ya usada con `{ PORCENTAJE, 20, 2026-11 }`
- **Cuando** se envía con la misma clave `{ PORCENTAJE, 30, 2026-11 }`
- **Entonces** responde `422` y la meta no cambia

#### CA-RF21-66 — Crear con `ahorroReal` opcional

- **Dado** un usuario con sesión
- **Cuando** crea metas en meses distintos con `ahorroReal` 150000, −25000, 0 y sin el campo
- **Entonces** las cuatro responden `201` y devuelven `ahorroReal` 150000, −25000, 0 y 0 respectivamente (el valor guardado en la base es igual al devuelto)

> Decisión D4 aprobada.

#### CA-RF21-67 — Un `ahorroReal` que no es número se rechaza al crear

- **Dado** un usuario con sesión
- **Cuando** crea una meta (por lo demás válida) con `ahorroReal` `"mucho"`, el texto numérico `"150000"`, `null` o `true`
- **Entonces** responde `400` con un texto que empieza por `ahorroReal` y no se guarda nada

### Listar (`GET /ahorro/metas`)

#### CA-RF21-42 — Lista solo las metas del usuario, de la más reciente a la más antigua

- **Dado** el usuario A con metas de `2026-09`, `2026-11` y `2026-10` (creadas en ese orden) y el usuario B con una meta de `2026-11`
- **Cuando** A consulta `GET /ahorro/metas`
- **Entonces** responde `200` con `{ "items": [...] }` de exactamente tres metas en la forma del contrato, ordenadas por `periodo` descendente (`2026-11`, `2026-10`, `2026-09`), sin la de B; sin paginación ni cursor

> Decisión D3 aprobada (sin paginación).

#### CA-RF21-43 — Sin metas, la lista es vacía

- **Dado** un usuario sin metas
- **Cuando** consulta `GET /ahorro/metas`
- **Entonces** responde `200` con `{ "items": [] }` (no `404`)

#### CA-RF21-44 — Filtrar por rango de meses, extremos incluidos

- **Dado** un usuario con metas de `2026-08` a `2026-12`, una por mes
- **Cuando** consulta con `desde=2026-09&hasta=2026-11`, y luego solo `desde=2026-11`, y luego solo `hasta=2026-09`
- **Entonces** devuelve respectivamente los meses 11, 10, 09; 12, 11; y 09, 08 (descendente, extremos incluidos)

> Decisión D3 aprobada.

#### CA-RF21-45 — Filtros inválidos

- **Dado** un usuario con sesión
- **Cuando** envía `desde=2026-13`, `hasta=noviembre`, `desde=2026-11-01` (con día), `desde=2026-12&hasta=2026-11` (desde posterior a hasta) o un parámetro desconocido como `tipo=PORCENTAJE`
- **Entonces** responde `400` con `message` (arreglo)

> Decisión D3 aprobada.

### Consultar una meta (`GET /ahorro/metas/:id`)

#### CA-RF21-46 — Consultar una meta propia

- **Dado** una meta del usuario
- **Cuando** consulta `GET /ahorro/metas/<id>`
- **Entonces** responde `200` con exactamente la meta en la forma del contrato

#### CA-RF21-47 — Meta inexistente o de otro usuario: 404, no 403

- **Dado** un id válido que no existe, y otro id de una meta del usuario B
- **Cuando** el usuario A consulta cada uno
- **Entonces** ambos responden `404` con el mismo mensaje (D9), de modo que no se revela qué ids existen

#### CA-RF21-48 — Id mal formado: 400

- **Dado** un usuario con sesión
- **Cuando** consulta `GET /ahorro/metas/abc` (o edita o elimina con ese id)
- **Entonces** responde `400` con `message` (arreglo) que empieza por `id` (convención de `/transacciones/:id` y `/categorias/:id`)

### Editar (`PATCH /ahorro/metas/:id`)

#### CA-RF21-49 — Ajustar el valor de la meta del mes

- **Dado** una meta `PORCENTAJE` de 20 del usuario para `2026-11`
- **Cuando** envía `PATCH` con `{ "valorObjetivo": 25 }`
- **Entonces** responde `200` con la meta completa: `valorObjetivo` 25 y el resto igual (`id`, `tipoMeta`, `periodo`, `ahorroReal`, `creadaEn`); `actualizadaEn` no es anterior a la de antes; la base refleja el cambio y no hay un segundo documento (CU-10 2a)

#### CA-RF21-50 — Cambiar el tipo y el valor a la vez

- **Dado** una meta `PORCENTAJE` de 20
- **Cuando** envía `{ "tipoMeta": "MONTO_FIJO", "valorObjetivo": 300000 }`
- **Entonces** responde `200` con `MONTO_FIJO` y 300000; y al revés, de `MONTO_FIJO` 300000 a `{ "tipoMeta": "PORCENTAJE", "valorObjetivo": 15 }` responde `200`

#### CA-RF21-51 — Solo el valor se revalida contra el tipo guardado

- **Dado** una meta `PORCENTAJE` de 20, y otra `MONTO_FIJO` de 300000
- **Cuando** se envía `{ "valorObjetivo": 150 }` a la primera, y `{ "valorObjetivo": 150 }` a la segunda
- **Entonces** la primera responde `400` (texto que empieza por `valorObjetivo`, un porcentaje no pasa de 100) y no cambia; la segunda responde `200` con 150 (un monto fijo no tiene tope); también se acepta `{ "valorObjetivo": 100 }` en la primera

#### CA-RF21-52 — Cambiar el tipo exige enviar también el valor

- **Dado** una meta `MONTO_FIJO` de 300000, y otra `PORCENTAJE` de 20
- **Cuando** se envía `{ "tipoMeta": "PORCENTAJE" }` a la primera, y `{ "tipoMeta": "MONTO_FIJO" }` a la segunda (sin `valorObjetivo`)
- **Entonces** ambas responden `400` con un texto que empieza por `valorObjetivo` y dice que debe enviarse junto con `tipoMeta`, y ninguna cambia (D6)

#### CA-RF21-65 — Al cambiar el tipo, el valor enviado se valida contra el tipo nuevo

- **Dado** una meta `MONTO_FIJO` de 300000
- **Cuando** se envía `{ "tipoMeta": "PORCENTAJE", "valorObjetivo": 300000 }`, y en otra meta `PORCENTAJE` de 20 se envía `{ "tipoMeta": "MONTO_FIJO", "valorObjetivo": 150 }`
- **Entonces** el primero responde `400` (texto que empieza por `valorObjetivo`, un porcentaje no pasa de 100) y la meta no cambia; el segundo responde `200` con `MONTO_FIJO` y 150

#### CA-RF21-53 — Valores inválidos en la edición

- **Dado** una meta del usuario
- **Cuando** envía `{ "valorObjetivo": 0 }`, `{ "valorObjetivo": -3 }`, `{ "valorObjetivo": "20" }`, `{ "tipoMeta": "OBJETIVO", "valorObjetivo": 20 }` o `{ "valorObjetivo": null }`
- **Entonces** responde `400` con un texto que empieza por el campo inválido y la meta no cambia

#### CA-RF21-54 — Cuerpo vacío

- **Dado** una meta del usuario
- **Cuando** envía `PATCH` con `{}`
- **Entonces** responde `400` y la meta no cambia (igual que en `PATCH /transacciones/:id`: al menos un campo)

#### CA-RF21-55 — Campos no editables se rechazan

- **Dado** una meta del usuario
- **Cuando** el cuerpo incluye `usuarioId`, `id`, `createdAt` o `actualizadaEn`, solos o junto a un campo válido
- **Entonces** responde `400` con un texto por el campo sobrante y la meta no cambia (ni siquiera el campo válido que viniera junto)

#### CA-RF21-56 — Repetir el mismo ajuste es inofensivo

- **Dado** una meta ya ajustada a `{ "valorObjetivo": 25 }`
- **Cuando** se envía otra vez el mismo `PATCH`
- **Entonces** responde `200` con la misma meta (`PATCH` tolera repetirse, por eso no lleva `Idempotency-Key`)

#### CA-RF21-57 — Editar la meta de otro usuario o inexistente: 404

- **Dado** una meta del usuario B y un id válido que no existe
- **Cuando** el usuario A les envía un `PATCH` con un cuerpo válido (por ejemplo, un cambio de `valorObjetivo` o de `periodo`)
- **Entonces** ambos responden `404` con el mismo mensaje y la meta de B no cambia

#### CA-RF21-68 — Editar el `ahorroReal`

- **Dado** una meta del usuario con `ahorroReal` 0
- **Cuando** envía `{ "ahorroReal": 150000 }`, luego `{ "ahorroReal": -25000 }` y luego `{ "ahorroReal": 0 }`
- **Entonces** cada petición responde `200` con ese `ahorroReal` y el resto de la meta igual; no exige `valorObjetivo` (solo `tipoMeta` lo exige, D6)

> Decisión D4 aprobada.

#### CA-RF21-69 — Un `ahorroReal` que no es número se rechaza al editar

- **Dado** una meta del usuario
- **Cuando** envía `{ "ahorroReal": "mucho" }`, `{ "ahorroReal": "150000" }` o `{ "ahorroReal": null }`
- **Entonces** responde `400` con un texto que empieza por `ahorroReal` y la meta no cambia

#### CA-RF21-70 — Mover la meta a un mes libre

- **Dado** una meta del usuario para `2026-11`, sin otra para `2027-01`
- **Cuando** envía `{ "periodo": "2027-01" }` (y, en otra meta, `{ "periodo": "2027-03-20" }`)
- **Entonces** responde `200` con `periodo` `"2027-01"` (y `"2027-03"` en la otra, normalizado al mes); el resto de la meta no cambia; no exige `valorObjetivo`; en la base sigue habiendo un solo documento (el mismo `id`) y el mes `2026-11` queda libre, de modo que el usuario puede crear otra meta para él (`201`)

> Decisiones D2 y D5 aprobadas.

#### CA-RF21-71 — Mover la meta a un mes que ya tiene otra: 409

- **Dado** un usuario con metas para `2026-11` y `2026-12`
- **Cuando** envía a la de `2026-11` `{ "periodo": "2026-12" }` (o `"2026-12-15"`), solo o junto a otros campos válidos como `{ "periodo": "2026-12", "valorObjetivo": 40 }`
- **Entonces** responde `409` con el mensaje de duplicado de D9 y ninguna de las dos metas cambia (ni siquiera el campo válido que viniera junto)

#### CA-RF21-72 — Mover una meta a su propio mes no es conflicto

- **Dado** una meta del usuario para `2026-11`
- **Cuando** envía `{ "periodo": "2026-11" }` y luego `{ "periodo": "2026-11-25" }`
- **Entonces** ambas responden `200` con `periodo` `"2026-11"` y la meta intacta

#### CA-RF21-73 — El mes ocupado por otro usuario no estorba

- **Dado** el usuario A con meta para `2026-11` y el usuario B con meta para `2027-01`
- **Cuando** A envía `{ "periodo": "2027-01" }` a su meta
- **Entonces** responde `200` con `periodo` `"2027-01"` y la meta de B no cambia

#### CA-RF21-74 — Periodo inválido al editar

- **Dado** una meta del usuario
- **Cuando** envía `periodo` `noviembre`, `2026-13`, `2026-1`, `2027-02-29`, `2026-11-15T10:00:00Z` o `null`
- **Entonces** responde `400` con un texto que empieza por `periodo` y la meta no cambia

#### CA-RF21-75 — Dos movimientos simultáneos al mismo mes: uno gana, el otro 409

- **Dado** un usuario con metas para `2026-11` y `2026-12`, y sin meta para `2027-01`
- **Cuando** envía a la vez dos `PATCH`, uno a cada meta, con `{ "periodo": "2027-01" }`
- **Entonces** uno responde `200` y el otro `409` (nunca `500`), y queda una sola meta en `2027-01`; lo mismo si compite un `PATCH` de mover contra un `POST` de crear para ese mes (el índice único `{usuarioId, periodo}` es la barrera)

### Eliminar (`DELETE /ahorro/metas/:id`)

#### CA-RF21-58 — Eliminar una meta propia sin ahorro registrado

- **Dado** una meta del usuario con `ahorroReal` 0
- **Cuando** envía `DELETE /ahorro/metas/<id>`
- **Entonces** responde `204` sin cuerpo, el documento ya no existe en la base y deja de aparecer en la lista y en `GET /ahorro/metas/<id>` (`404`)

#### CA-RF21-59 — Eliminar de nuevo responde 404

- **Dado** una meta ya eliminada
- **Cuando** se repite el `DELETE`
- **Entonces** responde `404`

#### CA-RF21-60 — Tras eliminar se puede volver a definir la meta de ese mes

- **Dado** una meta eliminada del mes `2026-11`
- **Cuando** el usuario crea otra meta para `2026-11`
- **Entonces** responde `201` (el índice único ya no choca)

#### CA-RF21-61 — Eliminar la meta de otro usuario o inexistente: 404

- **Dado** una meta del usuario B (incluso con `ahorroReal` distinto de 0) y un id válido que no existe
- **Cuando** el usuario A envía `DELETE` a cada una
- **Entonces** ambas responden `404` con el mismo mensaje (nunca `409`, que revelaría que la meta existe) y la meta de B sigue existiendo

#### CA-RF21-62 — Las metas de meses pasados se pueden editar y eliminar

- **Dado** una meta del usuario con `ahorroReal` 0 para un mes anterior al actual (`2026-01`)
- **Cuando** envía `PATCH` con `{ "valorObjetivo": 30 }` y luego `DELETE`
- **Entonces** el `PATCH` responde `200` y el `DELETE` responde `204` (el mes pasado no restringe nada; sí lo hace el ahorro registrado, CA-RF21-76)

> Decisión D7 aprobada.

#### CA-RF21-76 — No se elimina una meta que ya tiene ahorro registrado

- **Dado** una meta del usuario con `ahorroReal` 150000, y otra con `ahorroReal` −25000
- **Cuando** envía `DELETE` a cada una
- **Entonces** ambas responden `409` con el mensaje de ahorro registrado de D9, siguen existiendo y `GET` las devuelve intactas; si el usuario edita una con `{ "ahorroReal": 0 }`, un nuevo `DELETE` responde `204`

> Decisión D8 aprobada.

### Sesión y datos del usuario

#### CA-RF21-63 — Sin sesión válida, ninguna operación se ejecuta

- **Dado** una meta existente
- **Cuando** se llama a cada una de las cinco rutas sin el header `Authorization`, con un token inválido, o con uno vencido
- **Entonces** todas responden `401` y no se crea, cambia ni elimina nada

#### CA-RF21-64 — Al eliminar la cuenta se borran sus metas

- **Dado** un usuario con metas (alguna con `ahorroReal` distinto de 0) y otro usuario con metas
- **Cuando** el primero elimina su cuenta (RF-04)
- **Entonces** no queda ninguna meta con su `usuarioId`, también las que tenían ahorro registrado (el `409` de D8 no aplica a la eliminación de la cuenta), y las del otro usuario siguen intactas

### Documentación Swagger

`src/common/swagger.spec.ts` descubre todos los controladores y fallará si alguna de las cinco rutas o de los DTO (de entrada y de salida) del paquete no tiene etiqueta, resumen, descripción detallada, respuestas de error (400, 401, 404, 409, 500 según apliquen) y `description` + `example` en cada propiedad; además, el `POST` que responde `201` debe documentar el header `Idempotency-Key`. No es una prueba de este paquete, pero su cumplimiento forma parte de darlo por terminado. Los criterios CA-RF21-28..76 fijan los códigos de error que deben documentarse.
