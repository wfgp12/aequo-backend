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
