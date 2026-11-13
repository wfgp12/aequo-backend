# Criterios de aceptación — 5. Tarjetas de crédito

Estado: Aprobado (2026-11-12)

## Paquete 5.1.1 — Modelar entidades TarjetaCredito y CargoRecurrente (RF-24, RF-29)

### Alcance

Entran **solo las dos entidades** (esquemas Mongoose): la tarjeta de crédito y el cargo recurrente asociado a una tarjeta. El CRUD y los endpoints, la actualización de la tasa (RF-25, paquete 5.1.2), las compras (`CompraCredito`, paquetes 5.2.x), el cálculo de la cuota y la proyección (RF-27, RF-28), el total del mes por tarjeta (RF-30) y el pago de la tarjeta son de paquetes siguientes y **no** se cubren aquí. Los criterios describen lo que el modelo acepta, lo que rechaza con error de validación y los índices que declara, de modo que se puedan probar sin endpoints (`validateSync()` sobre un modelo creado con el esquema y lectura de `schema.indexes()`, igual que `src/ahorro/meta-ahorro.schema.spec.ts`; el repo no tiene una base en memoria con índices reales, así que la unicidad se verifica por el índice declarado).

### Fuentes

- RF-24 (Especificación de Requisitos): «registrar sus tarjetas de crédito indicando nombre, tasa de interés efectiva anual y si las compras a una sola cuota se difieren sin intereses».
- RF-25: la tasa de una tarjeta se puede actualizar y la nueva tasa aplica solo a compras posteriores. Eso es del paquete 5.1.2; aquí solo implica que `tasaEA` de la tarjeta es la **tasa vigente** (cada compra copiará la suya en `tasaEAAplicada`).
- RF-29: «registrar cargos fijos mensuales asociados a una tarjeta, como suscripciones, y activarlos o desactivarlos».
- RF-30: el total del mes por tarjeta suma las cuotas vigentes y los cargos fijos **activos**; de ahí el campo `activo`.
- Modelo lógico v2.0 (Documento de Diseño Técnico): `tarjetas` = `usuarioId` (FK, index), `nombre: String`, `tasaEA: Number`, `cuotaUnicaSinInteres: Boolean`. `cargosrecurrentes` = `usuarioId` (FK, index), `tarjetaId` (FK), `descripcion: String`, `valor: Number`, `activo: Boolean`.
- ADR-014: montos en pesos colombianos; la tasa de la tarjeta puede cambiar con el tiempo; la tarjeta es una **entidad**, no texto libre, justamente para evitar el error de nombres escritos distinto; con tasa 0 la cuota es `V/n`, así que la tasa 0 es un caso válido.
- `CLAUDE.md`: relaciones por `ObjectId` (ADR-001); el campo del usuario se llama exactamente `usuarioId` (así lo encuentra `AuthService.eliminarCuenta()`, RF-04); las entidades son anémicas (solo datos, nada calculado); las enumeraciones cerradas se validan en el esquema; el ejemplo de la hoja del promotor usa E.A. 29,21 %.

### Contrato de nombres (aprobado)

- Entidad `TarjetaCredito` y esquema `TarjetaCreditoSchema`, en `src/tarjetas/tarjeta-credito.schema.ts`; colección `tarjetas`.
- Entidad `CargoRecurrente` y esquema `CargoRecurrenteSchema`, en `src/tarjetas/cargo-recurrente.schema.ts`; colección `cargosrecurrentes`.
- Ambos esquemas con `timestamps: true`. Los modelos se registran con el nombre de la clase (`TarjetaCredito`, `CargoRecurrente`); `tarjetaId` referencia a `TarjetaCredito`.

### Decisiones aprobadas por el desarrollador (2026-11-12)

El desarrollador aprobó la opción recomendada en las ocho decisiones; los criterios de abajo ya la reflejan.

1. **Forma de guardar `tasaEA` y su rango** (CA-RF24-10 a CA-RF24-13). Recomendado: **fracción decimal** (29,21 % se guarda como `0,2921`), entre 0 y 1 inclusive; 0 permitido. Por qué: la fórmula (`i = (1 + EA)^(1/12) − 1`) y la hoja del promotor usan la fracción, así el cálculo no divide entre 100; y el tope de 1 (100 % E.A., muy por encima de cualquier tasa real de tarjeta) rechaza el error clásico de enviar `29,21` donde se esperaba `0,2921`. Alternativa: porcentaje de 0 a 100 como la meta de ahorro (`20` = 20 %), con la conversión dentro del cálculo.
2. **`nombre` de la tarjeta** (CA-RF24-07 a CA-RF24-09, CA-RF24-16). Recomendado: obligatorio, con recorte de espacios, hasta 50 caracteres, y **único por usuario sin distinguir mayúsculas** («Visa» y «visa» son la misma tarjeta; ADR-014 existe para evitar nombres escritos distinto). Alternativa: permitir nombres repetidos.
3. **`cuotaUnicaSinInteres`** (CA-RF24-14, CA-RF24-15). Recomendado: opcional con valor por defecto `false` (lo normal es que una cuota única también cobre interés; así crear una tarjeta no exige un dato que casi siempre es «no»). Alternativa: obligatorio, para forzar la elección.
4. **`valor` y `descripcion` del cargo** (CA-RF29-08 a CA-RF29-13). Recomendado: `valor` mayor que 0, sin tope superior (un cargo en cero no cobra nada y no tiene sentido; para dejarlo de cobrar existe `activo`); `descripcion` obligatoria, con recorte de espacios, hasta 100 caracteres.
5. **`activo`** (CA-RF29-14). Recomendado: opcional, `true` por defecto (un cargo recién registrado cuenta desde el mes siguiente sin pasos extra).
6. **Índices** (CA-RF24-16, CA-RF29-16). Recomendado: en `tarjetas`, el índice único `(usuarioId, nombre)` con intercalación que no distingue mayúsculas, que además sirve para buscar por `usuarioId`; en `cargosrecurrentes`, un índice por `usuarioId` y otro por `tarjetaId` (listar los cargos de una tarjeta suma el total del mes, RF-30). Ninguna restricción de unicidad en los cargos (dos suscripciones iguales en la misma tarjeta son posibles).
7. **Verificar que `tarjetaId` exista y sea del usuario** (CA-RF29-07). Recomendado: **no** en el esquema, que solo exige un `ObjectId`; esa comprobación (404 si la tarjeta es de otro usuario) pertenece al servicio del paquete 5.1.2.
8. **Campos que el modelo lógico no trae** (CA-RF24-02, CA-RF29-02). Recomendado: no agregar cupo, fecha de corte ni día de cobro del cargo; ningún RF los pide. Si más adelante se necesitan, se piden como cambio aparte (y con migración, ADR-003).

---

## RF-24 — Registrar tarjetas de crédito

### Forma del documento

#### CA-RF24-01 — Una tarjeta válida se acepta

- **Dado** un `usuarioId` válido
- **Cuando** se crea una tarjeta con `nombre` «Visa Bancolombia», `tasaEA` 0,2921 y `cuotaUnicaSinInteres` `true`
- **Entonces** la validación no reporta errores y el documento conserva esos valores (la tasa exactamente `0,2921`, sin redondear)

#### CA-RF24-02 — El documento guarda solo los campos del modelo

- **Dado** el esquema de la tarjeta de crédito
- **Cuando** se listan sus campos
- **Entonces** son exactamente `usuarioId`, `nombre`, `tasaEA` y `cuotaUnicaSinInteres` (más `_id`, `__v`, `createdAt` y `updatedAt`); **no** existe ningún campo de cuota, interés, saldo, total del mes ni de compras, porque todo eso se calcula (RNF-11) y la entidad es anémica


#### CA-RF24-03 — La colección se llama `tarjetas` y registra fechas de creación y modificación

- **Dado** el esquema de la tarjeta de crédito
- **Cuando** se leen sus opciones
- **Entonces** la colección es `tarjetas` y `timestamps` está activo

### Usuario dueño

#### CA-RF24-04 — `usuarioId` es una referencia a usuario (ObjectId), llamada exactamente así

- **Dado** el esquema de la tarjeta de crédito
- **Cuando** se inspecciona el campo `usuarioId`
- **Entonces** es de tipo `ObjectId` con referencia a `Usuario` (ADR-001) y se llama exactamente `usuarioId`, de modo que `AuthService.eliminarCuenta()` encuentre y borre sola esta colección (RF-04)

#### CA-RF24-05 — Sin `usuarioId` la tarjeta se rechaza

- **Dado** una tarjeta con todos los demás campos válidos
- **Cuando** no trae `usuarioId` (ausente o `null`)
- **Entonces** la validación falla con error solo en `usuarioId` (no hay tarjetas del sistema: siempre pertenece a un usuario)

#### CA-RF24-06 — Un `usuarioId` que no es un id se rechaza

- **Dado** una tarjeta con los demás campos válidos
- **Cuando** `usuarioId` es el texto `no-es-un-id`
- **Entonces** la validación falla con error solo en `usuarioId`

### Nombre

#### CA-RF24-07 — Sin nombre se rechaza

- **Dado** una tarjeta con los demás campos válidos
- **Cuando** `nombre` está ausente, es `null`, es un texto vacío o solo tiene espacios (`"   "`)
- **Entonces** la validación falla con error solo en `nombre`


#### CA-RF24-08 — El nombre se guarda sin espacios sobrantes

- **Dado** una tarjeta con los demás campos válidos
- **Cuando** `nombre` es `"  Visa Bancolombia  "`
- **Entonces** la validación no reporta errores y el nombre guardado es `"Visa Bancolombia"`


#### CA-RF24-09 — Longitud máxima del nombre

- **Dado** una tarjeta con los demás campos válidos
- **Cuando** `nombre` tiene 50 caracteres, y en otra tarjeta tiene 51
- **Entonces** la de 50 pasa la validación y la de 51 falla con error solo en `nombre`


### Tasa efectiva anual

#### CA-RF24-10 — Sin tasa se rechaza

- **Dado** una tarjeta con los demás campos válidos
- **Cuando** no trae `tasaEA` (ausente o `null`)
- **Entonces** la validación falla con error solo en `tasaEA` (sin tasa no se puede calcular ninguna cuota; la tasa 0 no es «sin tasa», ver CA-RF24-12)

#### CA-RF24-11 — Una tasa que no es número se rechaza

- **Dado** una tarjeta con los demás campos válidos
- **Cuando** `tasaEA` es el texto `alta`
- **Entonces** la validación falla con error solo en `tasaEA`

#### CA-RF24-12 — La tasa 0 es válida

- **Dado** una tarjeta con los demás campos válidos
- **Cuando** `tasaEA` es 0
- **Entonces** la validación no reporta errores y la tasa guardada es 0 (con tasa 0 la cuota es `V/n`, ADR-014)


#### CA-RF24-13 — Rango de la tasa

- **Dado** una tarjeta con los demás campos válidos
- **Cuando** `tasaEA` es 0,0001, 0,2921 o 1, y en otras tarjetas es −0,01, 1,0001 o 29,21
- **Entonces** las tres primeras pasan la validación; las otras fallan con error solo en `tasaEA` (negativa, mayor que 100 % E.A., o un porcentaje enviado donde se esperaba una fracción)


### Cuota única sin interés

#### CA-RF24-14 — `cuotaUnicaSinInteres` vale `false` si no se indica

- **Dado** una tarjeta con `nombre` y `tasaEA` válidos y sin `cuotaUnicaSinInteres`
- **Cuando** se crea
- **Entonces** la validación no reporta errores y `cuotaUnicaSinInteres` es `false`


#### CA-RF24-15 — `cuotaUnicaSinInteres` acepta solo valores lógicos

- **Dado** una tarjeta con los demás campos válidos
- **Cuando** `cuotaUnicaSinInteres` es `true`, o `false`, y en otra tarjeta es el texto `quizás`
- **Entonces** `true` y `false` pasan la validación y se conservan; `quizás` falla con error solo en `cuotaUnicaSinInteres`

### Índices

#### CA-RF24-16 — Una tarjeta por usuario y nombre, sin distinguir mayúsculas

- **Dado** el esquema de la tarjeta de crédito
- **Cuando** se leen sus índices
- **Entonces** el único índice único es sobre `usuarioId` y `nombre`, en ese orden, con una intercalación que no distingue mayúsculas (`strength` 1 o 2); así un usuario no puede tener dos tarjetas «Visa» y «visa», pero dos usuarios sí pueden tener cada uno la suya


---

## RF-29 — Cargos fijos mensuales de una tarjeta

### Forma del documento

#### CA-RF29-01 — Un cargo válido se acepta

- **Dado** un `usuarioId` y un `tarjetaId` válidos
- **Cuando** se crea un cargo con `descripcion` «Netflix», `valor` 38900 y `activo` `true`
- **Entonces** la validación no reporta errores y el documento conserva esos valores

#### CA-RF29-02 — El documento guarda solo los campos del modelo

- **Dado** el esquema del cargo recurrente
- **Cuando** se listan sus campos
- **Entonces** son exactamente `usuarioId`, `tarjetaId`, `descripcion`, `valor` y `activo` (más `_id`, `__v`, `createdAt` y `updatedAt`); **no** existe ningún campo de día de cobro, de total acumulado ni de cuotas: el cargo es el mismo valor cada mes mientras esté activo


#### CA-RF29-03 — La colección se llama `cargosrecurrentes` y registra fechas de creación y modificación

- **Dado** el esquema del cargo recurrente
- **Cuando** se leen sus opciones
- **Entonces** la colección es `cargosrecurrentes` y `timestamps` está activo

### Usuario y tarjeta

#### CA-RF29-04 — `usuarioId` es una referencia a usuario (ObjectId), llamada exactamente así

- **Dado** el esquema del cargo recurrente
- **Cuando** se inspecciona el campo `usuarioId`
- **Entonces** es de tipo `ObjectId` con referencia a `Usuario` y se llama exactamente `usuarioId`, de modo que `AuthService.eliminarCuenta()` borre sola esta colección (RF-04)

#### CA-RF29-05 — Sin `usuarioId`, o con uno que no es un id, el cargo se rechaza

- **Dado** un cargo con los demás campos válidos
- **Cuando** `usuarioId` está ausente, es `null`, o es el texto `no-es-un-id`
- **Entonces** la validación falla con error solo en `usuarioId`

#### CA-RF29-06 — `tarjetaId` es una referencia a la tarjeta (ObjectId)

- **Dado** el esquema del cargo recurrente
- **Cuando** se inspecciona el campo `tarjetaId`
- **Entonces** es de tipo `ObjectId` con referencia a `TarjetaCredito` (ADR-001: el cargo no embebe la tarjeta)

#### CA-RF29-07 — Sin `tarjetaId`, o con uno que no es un id, el cargo se rechaza

- **Dado** un cargo con los demás campos válidos
- **Cuando** `tarjetaId` está ausente, es `null`, o es el texto `no-es-un-id`
- **Entonces** la validación falla con error solo en `tarjetaId` (un cargo siempre pertenece a una tarjeta; que esa tarjeta exista y sea del usuario lo verifica el servicio, no el esquema)


### Descripción

#### CA-RF29-08 — Sin descripción se rechaza

- **Dado** un cargo con los demás campos válidos
- **Cuando** `descripcion` está ausente, es `null`, es un texto vacío o solo tiene espacios
- **Entonces** la validación falla con error solo en `descripcion`


#### CA-RF29-09 — La descripción se guarda sin espacios sobrantes

- **Dado** un cargo con los demás campos válidos
- **Cuando** `descripcion` es `"  Netflix  "`
- **Entonces** la validación no reporta errores y la descripción guardada es `"Netflix"`


#### CA-RF29-10 — Longitud máxima de la descripción

- **Dado** un cargo con los demás campos válidos
- **Cuando** `descripcion` tiene 100 caracteres, y en otro cargo tiene 101
- **Entonces** el de 100 pasa la validación y el de 101 falla con error solo en `descripcion`


### Valor

#### CA-RF29-11 — Sin valor, o con un valor que no es número, se rechaza

- **Dado** un cargo con los demás campos válidos
- **Cuando** `valor` está ausente, es `null`, o es el texto `barato`
- **Entonces** la validación falla con error solo en `valor`

#### CA-RF29-12 — Un valor en cero o negativo se rechaza

- **Dado** un cargo con los demás campos válidos
- **Cuando** `valor` es 0 o −38900
- **Entonces** la validación falla con error solo en `valor` (para dejar de cobrar un cargo se desactiva, no se pone en cero)


#### CA-RF29-13 — Un valor positivo se acepta, sin tope superior

- **Dado** un cargo con los demás campos válidos
- **Cuando** `valor` es 1, 38900, 1500000,5 o 999999999
- **Entonces** todos pasan la validación y conservan su valor sin redondear


### Activar y desactivar

#### CA-RF29-14 — `activo` vale `true` si no se indica

- **Dado** un cargo con los demás campos válidos y sin `activo`
- **Cuando** se crea
- **Entonces** la validación no reporta errores y `activo` es `true`


#### CA-RF29-15 — `activo` acepta `true` y `false`, y rechaza lo que no sea lógico

- **Dado** un cargo con los demás campos válidos
- **Cuando** `activo` es `false`, o `true`, y en otro cargo es el texto `quizás`
- **Entonces** `false` y `true` pasan la validación y se conservan (así el cargo se puede desactivar y volver a activar, RF-29); `quizás` falla con error solo en `activo`

### Índices

#### CA-RF29-16 — Hay índices por usuario y por tarjeta

- **Dado** el esquema del cargo recurrente
- **Cuando** se leen sus índices
- **Entonces** existe un índice cuya primera clave es `usuarioId` (el modelo lógico lo pide) y otro cuya primera clave es `tarjetaId` (para sumar los cargos activos de una tarjeta en el total del mes, RF-30)


#### CA-RF29-17 — Dos cargos iguales en la misma tarjeta son legítimos

- **Dado** el esquema del cargo recurrente
- **Cuando** se leen sus índices
- **Entonces** ninguno es único: el modelo no impide dos cargos con la misma descripción y valor en la misma tarjeta

---

## Paquete 5.1.2 — Implementar CRUD de tarjetas y cargos fijos (backend) (RF-24, RF-25, RF-29, RF-33)

Estado: Aprobado (2026-11-12)

### Alcance

Entran los endpoints para **crear, listar, consultar, editar y eliminar tarjetas de crédito** y **cargos fijos mensuales** del usuario, sobre los esquemas ya aprobados en 5.1.1. La edición de la tarjeta incluye cambiar su tasa (RF-25) y la del cargo incluye activarlo o desactivarlo (RF-29). **No** entran: las compras con tarjeta (`CompraCredito`, 5.2.x), el cálculo de la cuota (RF-27), la proyección (RF-28), el total del mes por tarjeta (RF-30) ni el registro del pago de la tarjeta; la API de este paquete no calcula nada, solo guarda y devuelve. Que el pago de una tarjeta (una transacción `PAGO_TARJETA` con `tarjetaId`) valide que la tarjeta exista es del paquete del pago, no de este. La forma del documento (tipos, rangos, índice único) ya está cubierta por CA-RF24-01..16 y CA-RF29-01..17; aquí se verifica cómo la expone la API.

### Fuentes

- RF-24: registrar tarjetas con nombre, tasa E.A. y si la cuota única se difiere sin intereses. RF-25: la tasa se puede actualizar y aplica solo a compras registradas **después** del cambio. RF-29: cargos fijos de una tarjeta, activarlos o desactivarlos. RF-33: editar y eliminar tarjetas y cargos fijos. Ninguno define rutas, filtros, qué se puede editar ni qué pasa con los cargos o los pagos al eliminar una tarjeta: lo no definido está en las decisiones D1 a D10, aprobadas por el desarrollador el 2026-11-12.
- Criterio de la EDT para este paquete: «cambiar la tasa de una tarjeta no altera la cuota de las compras registradas antes del cambio». Las compras aún no existen: aquí solo se verifica que el cambio de tasa modifica **únicamente** esa tarjeta (CA-RF25-04); la prueba con compras reales llega en 5.2.x (cada compra copia la tasa en `tasaEAAplicada`, ADR-014).
- Convenciones del repo (las mismas de `/ahorro/metas`, 4.1.2): `usuarioId` siempre sale del JWT; recurso inexistente o de otro usuario → `404` con el mismo mensaje (nunca `403`); id mal formado → `400`; `ValidationPipe` estricto (campo no declarado → `400`; `message` es un arreglo con un texto por problema que empieza por el nombre del campo); el `POST` que crea datos lleva `@Idempotente()` y el header `Idempotency-Key`; el `PATCH` y el `DELETE` toleran repetirse; errores con los esquemas de `src/common/dto/error-respuesta.dto.ts`.

### Contrato de nombres (aprobado)

- Módulo `TarjetasModule` en `src/tarjetas/tarjetas.module.ts`. Debe registrar (o importar) los modelos `TarjetaCredito`, `CargoRecurrente`, `Transaccion` (para saber si una tarjeta tiene pagos) e `Idempotencia`, con el nombre de su clase como token (`getModelToken(<Clase>.name)`), para que las pruebas los reemplacen por colecciones en memoria.
- Servicio `TarjetasService` en `src/tarjetas/tarjetas.service.ts` (el de `CLAUDE.md`); los controladores y DTO los nombra el implementador. Las pruebas usan solo la API HTTP.

### Contrato HTTP (aprobado) (lo consumirá el frontend en 5.1.3)

Todas las rutas requieren `Authorization: Bearer <accessToken>`.

| Operación | Ruta | Cuerpo / query | Éxito |
|---|---|---|---|
| Crear tarjeta | `POST /tarjetas` | `{ nombre, tasaEA, cuotaUnicaSinInteres? }` | `201` + tarjeta |
| Listar tarjetas | `GET /tarjetas` | — | `200` + `{ items: [tarjeta…] }` |
| Consultar tarjeta | `GET /tarjetas/:id` | — | `200` + tarjeta |
| Editar tarjeta | `PATCH /tarjetas/:id` | `{ nombre?, tasaEA?, cuotaUnicaSinInteres? }`, al menos uno | `200` + tarjeta |
| Eliminar tarjeta | `DELETE /tarjetas/:id` | — | `204` sin cuerpo (`409` si tiene pagos registrados) |
| Crear cargo | `POST /tarjetas/:tarjetaId/cargos` | `{ descripcion, valor, activo? }` | `201` + cargo |
| Listar cargos | `GET /tarjetas/:tarjetaId/cargos?activo=true\|false` | filtro opcional | `200` + `{ items: [cargo…] }` |
| Consultar cargo | `GET /tarjetas/:tarjetaId/cargos/:id` | — | `200` + cargo |
| Editar cargo | `PATCH /tarjetas/:tarjetaId/cargos/:id` | `{ descripcion?, valor?, activo? }`, al menos uno | `200` + cargo |
| Eliminar cargo | `DELETE /tarjetas/:tarjetaId/cargos/:id` | — | `204` sin cuerpo |

La **tarjeta** que devuelven todas las operaciones tiene exactamente estos campos (no trae `usuarioId`, `_id` ni `__v`):

```json
{
  "id": "66a0b3c4d5e6f70012ab34cd",
  "nombre": "Visa Bancolombia",
  "tasaEA": 0.2921,
  "cuotaUnicaSinInteres": false,
  "creadaEn": "2026-11-01T15:30:00.000Z",
  "actualizadaEn": "2026-11-01T15:30:00.000Z"
}
```

El **cargo** tiene exactamente estos campos (no trae `usuarioId`, `_id` ni `__v`; `tarjetaId` es el id de la tarjeta, como texto):

```json
{
  "id": "66a0b3c4d5e6f70012ab34ce",
  "tarjetaId": "66a0b3c4d5e6f70012ab34cd",
  "descripcion": "Netflix",
  "valor": 38900,
  "activo": true,
  "creadaEn": "2026-11-01T15:30:00.000Z",
  "actualizadaEn": "2026-11-01T15:30:00.000Z"
}
```

`tasaEA` y `valor` son números sin redondear (RNF-11); `creadaEn` y `actualizadaEn` son ISO 8601 en UTC. Mensajes de error fijos: `404` de tarjeta `Tarjeta no encontrada`; `404` de cargo `Cargo fijo no encontrado`; `409` por nombre repetido `Ya existe una tarjeta con ese nombre`; `409` al eliminar con pagos `No se puede eliminar una tarjeta que ya tiene pagos registrados`.

### Decisiones aprobadas por el desarrollador (2026-11-12)

> Decisión D1 aprobada — **rutas.** Recomendado: `/tarjetas` y los cargos **anidados** bajo su tarjeta (`/tarjetas/:tarjetaId/cargos`). Por qué: un cargo no existe sin su tarjeta; la ruta ya dice a cuál pertenece (no hay `tarjetaId` en el cuerpo que se pueda falsificar ni editar) y el chequeo «la tarjeta es mía» queda en un solo lugar. Alternativa: `/cargos-recurrentes` con `tarjetaId` en el cuerpo (más plano, pero hay que decidir si `tarjetaId` se puede editar y repetir la comprobación de propiedad en cada operación).

> Decisión D2 aprobada — **qué se edita con `PATCH`.** Recomendado: en la tarjeta, `nombre`, `tasaEA` y `cuotaUnicaSinInteres`; en el cargo, `descripcion`, `valor` y `activo`. **No** se puede mover un cargo a otra tarjeta (`tarjetaId` no es editable): para eso se elimina y se crea otro (un cargo es solo un monto recurrente, sin historia que perder). Alternativa: permitir mover entre tarjetas del mismo usuario.

> Decisión D3 aprobada — **activar y desactivar.** Recomendado: es un `PATCH` de `activo` (`true`/`false`) en la misma ruta del cargo, sin ruta aparte: es idempotente por naturaleza y el contrato queda con menos rutas. Alternativa: `POST …/cargos/:id/activar` y `/desactivar` (más explícitas, pero son rutas nuevas que habría que hacer idempotentes).

> Decisión D4 aprobada — **eliminar una tarjeta.** Recomendado: (a) sus **cargos fijos se borran en cascada** (activos e inactivos; sin la tarjeta no significan nada y no tienen historia); (b) si existen transacciones del usuario con ese `tarjetaId` (pagos de tarjeta), responde `409` y **no borra nada** (ni los cargos): borrarla dejaría pagos que cuentan en el balance apuntando a una tarjeta inexistente, y ADR-014 exige que un `PAGO_TARJETA` tenga su tarjeta. Es la misma lógica de «no eliminar lo que ya tiene dinero registrado» de las metas (D8 de 4.1.2). Para borrarla, el usuario elimina antes esos pagos. Cuando existan las compras (5.2.x), ese paquete extiende la misma regla (una tarjeta con compras tampoco se elimina) y agrega su criterio; aquí solo se cubren los pagos. Alternativas: borrar también los pagos (destruye datos de caja), o dejar `tarjetaId` en `null` (rompe ADR-014).

> Decisión D5 aprobada — **nombre repetido.** Recomendado: `409` con `Ya existe una tarjeta con ese nombre`, tanto al crear como al renombrar con `PATCH`. La barrera real es el índice único de CA-RF24-16; el servicio traduce el error de clave duplicada (sin `500`, incluso con peticiones simultáneas).

> Decisión D6 aprobada — **listados.** Recomendado: `GET /tarjetas` ordenado por `nombre` ascendente sin distinguir mayúsculas; `GET …/cargos` ordenado por fecha de creación ascendente (el orden en que el usuario los fue agregando), con filtro opcional `activo=true|false`; **sin paginación** (un usuario tiene unas pocas tarjetas y unos pocos cargos); un parámetro de query desconocido o un `activo` que no sea `true`/`false` responde `400`. Alternativa: cargos ordenados por descripción.

> Decisión D7 aprobada — **404 uniforme.** Recomendado: tarjeta inexistente y tarjeta de otro usuario responden `404` con el mismo mensaje (también en las rutas de cargos); un cargo inexistente, de otro usuario o que existe pero **en otra tarjeta** que la de la ruta responden `404` con el mismo mensaje de cargo. Nunca `403`, y nunca `409` si el recurso es ajeno (revelaría que existe).

> Decisión D8 aprobada — **tope de tarjetas por usuario.** Recomendado: ninguno (ningún RF lo pide; el índice único ya evita duplicados por error).

> Decisión D9 aprobada — **cómo se compara el nombre en el `409`.** Recomendado: se recortan los espacios de los extremos y no se distinguen mayúsculas («Visa», « visa » y «VISA» son la misma tarjeta), igual que el índice de CA-RF24-16. Las **tildes** no se especifican: el índice (`strength` 2) las distingue y las pruebas no las cubren; si el desarrollador quiere que «Débito» y «Debito» choquen, como en las categorías, hay que cambiar a la vez el índice (`strength` 1) y este criterio, con su propia migración (ADR-003).

> Decisión D10 aprobada — **cambiar la tasa (RF-25).** Recomendado: no hay ruta aparte; la tasa se cambia con el mismo `PATCH /tarjetas/:id` (RF-33), con la misma validación que al crear (de 0 a 1, fracción). **Nota para 5.2.1 (resuelta):** el desarrollador decidió que la compra copiará también la bandera `cuotaUnicaSinInteres` al registrarse, igual que copia la tasa en `tasaEAAplicada`. Se aplicará al modelar `CompraCredito` en 5.2.1. En 5.1.2 la edición de esa bandera solo cambia la tarjeta (no hay compras que tocar).

---

### RF-24 — Registrar tarjetas de crédito (API)

#### Crear (`POST /tarjetas`)

#### CA-RF24-17 — Crear una tarjeta

- **Dado** un usuario con sesión y sin tarjetas
- **Cuando** envía `POST /tarjetas` con `{ "nombre": "Visa Bancolombia", "tasaEA": 0.2921, "cuotaUnicaSinInteres": true }`
- **Entonces** responde `201` con la tarjeta en la forma del contrato: esos tres valores (la tasa exactamente `0,2921`), un `id` y las fechas `creadaEn` y `actualizadaEn`, sin `usuarioId`; y existe en la base un único documento con el `usuarioId` del usuario

#### CA-RF24-18 — Valores por defecto y límites válidos

- **Dado** un usuario con sesión
- **Cuando** crea una tarjeta sin `cuotaUnicaSinInteres`, otra con `tasaEA` 0, otra con `tasaEA` 1 y otra con un nombre de 50 caracteres
- **Entonces** las cuatro responden `201`; la primera devuelve `cuotaUnicaSinInteres` `false`; las otras devuelven la tasa 0, la tasa 1 y el nombre completo

#### CA-RF24-19 — El nombre se guarda sin espacios sobrantes

- **Dado** un usuario con sesión
- **Cuando** envía `"nombre": "  Visa Bancolombia  "`
- **Entonces** responde `201` con `nombre` `"Visa Bancolombia"` y la base guarda el nombre recortado

#### CA-RF24-20 — Faltan campos obligatorios

- **Dado** un usuario con sesión
- **Cuando** envía el cuerpo sin `nombre`, o sin `tasaEA`, o `{}`, o con alguno de los dos en `null`
- **Entonces** responde `400` con un texto por cada campo faltante que empieza por el nombre del campo, y no se guarda nada (la tasa 0 no es «sin tasa»: CA-RF24-18)

#### CA-RF24-21 — Nombre inválido

- **Dado** un usuario con sesión
- **Cuando** envía `nombre` vacío, solo espacios (`"   "`), de 51 caracteres, el número `123` o `true`
- **Entonces** responde `400` con un texto que empieza por `nombre`, y no se guarda nada

#### CA-RF24-22 — Tasa fuera de rango o que no es un número

- **Dado** un usuario con sesión
- **Cuando** envía `tasaEA` −0,01, 1,0001, 29,21 (un porcentaje donde se espera una fracción), `"alta"` o el texto numérico `"0.2921"`
- **Entonces** responde `400` con un texto que empieza por `tasaEA`, y no se guarda nada (el JSON debe enviar un número)

#### CA-RF24-23 — `cuotaUnicaSinInteres` solo acepta valores lógicos

- **Dado** un usuario con sesión
- **Cuando** envía `cuotaUnicaSinInteres` `"true"`, `1`, `"quizás"` o `null`
- **Entonces** responde `400` con un texto que empieza por `cuotaUnicaSinInteres`, y no se guarda nada

#### CA-RF24-24 — Campos no declarados se rechazan

- **Dado** un usuario con sesión
- **Cuando** el cuerpo incluye además `usuarioId`, `id`, `createdAt`, `creadaEn` o cualquier otro campo
- **Entonces** responde `400` con un texto por el campo sobrante y no se guarda nada (la tarjeta siempre es del usuario del JWT)

#### CA-RF24-25 — Nombre repetido: 409

- **Dado** un usuario con una tarjeta «Visa» con tasa 0,2921
- **Cuando** envía otra tarjeta con nombre `Visa`, `visa`, `VISA` o `  Visa  `
- **Entonces** responde `409` con `Ya existe una tarjeta con ese nombre` (decisión D5) y la tarjeta original queda intacta (misma tasa); la base sigue teniendo un solo documento

#### CA-RF24-26 — La unicidad del nombre es por usuario

- **Dado** el usuario A con una tarjeta «Visa»
- **Cuando** el usuario B crea una tarjeta «Visa», y A crea una «Mastercard»
- **Entonces** ambas responden `201`

#### CA-RF24-27 — Dos peticiones simultáneas con el mismo nombre: una gana, la otra 409

- **Dado** un usuario sin tarjeta «Visa»
- **Cuando** envía a la vez dos `POST` con claves de idempotencia distintas y el nombre `Visa`
- **Entonces** una responde `201` y la otra `409` (nunca `500`), y queda un solo documento

#### CA-RF24-28 — Repetir la petición con la misma clave de idempotencia no crea otra tarjeta

- **Dado** un usuario que envía `POST /tarjetas` con header `Idempotency-Key` y obtiene `201`
- **Cuando** repite la misma petición con la misma clave
- **Entonces** recibe la misma respuesta `201` (mismo `id`) con el header `Idempotent-Replayed: true`, no hay un segundo documento y no hay `409`

#### CA-RF24-29 — La misma clave con una petición distinta se rechaza

- **Dado** una clave de idempotencia ya usada con `{ "nombre": "Visa", "tasaEA": 0.2921 }`
- **Cuando** se envía con la misma clave `{ "nombre": "Visa", "tasaEA": 0.3 }`
- **Entonces** responde `422` y la tarjeta no cambia

#### CA-RF24-30 — No hay tope de tarjetas por usuario

- **Dado** un usuario con 100 tarjetas de nombres distintos
- **Cuando** crea otra con un nombre nuevo
- **Entonces** responde `201` (decisión D8)

#### Listar (`GET /tarjetas`)

#### CA-RF24-31 — Lista solo las tarjetas del usuario, por nombre sin distinguir mayúsculas

- **Dado** el usuario A con las tarjetas «visa», «Amex» y «banco» (creadas en ese orden) y el usuario B con una tarjeta «Cencosud»
- **Cuando** A consulta `GET /tarjetas`
- **Entonces** responde `200` con `{ "items": [...] }` de exactamente tres tarjetas en la forma del contrato, en el orden «Amex», «banco», «visa», sin la de B; sin paginación (decisión D6)

#### CA-RF24-32 — Sin tarjetas, la lista es vacía

- **Dado** un usuario sin tarjetas
- **Cuando** consulta `GET /tarjetas`
- **Entonces** responde `200` con `{ "items": [] }` (no `404`)

#### CA-RF24-33 — Parámetros de query desconocidos se rechazan

- **Dado** un usuario con sesión
- **Cuando** consulta `GET /tarjetas?activo=true` o `GET /tarjetas?pagina=2`
- **Entonces** responde `400` con `message` (arreglo) que menciona el parámetro

#### Consultar (`GET /tarjetas/:id`)

#### CA-RF24-34 — Consultar una tarjeta propia

- **Dado** una tarjeta del usuario
- **Cuando** consulta `GET /tarjetas/<id>`
- **Entonces** responde `200` con exactamente la tarjeta en la forma del contrato

#### CA-RF24-35 — Tarjeta inexistente o de otro usuario: 404, no 403

- **Dado** un id válido que no existe, y otro id de una tarjeta del usuario B
- **Cuando** el usuario A consulta cada uno
- **Entonces** ambos responden `404` con `Tarjeta no encontrada` (el mismo mensaje), de modo que no se revela qué ids existen (decisión D7)

#### CA-RF24-36 — Id mal formado: 400

- **Dado** un usuario con sesión
- **Cuando** envía `GET`, `PATCH` o `DELETE` a `/tarjetas/abc`
- **Entonces** las tres responden `400` con `message` (arreglo) que empieza por `id`

#### Sesión y datos del usuario

#### CA-RF24-37 — Sin sesión válida, ninguna ruta de tarjetas se ejecuta

- **Dado** una tarjeta existente
- **Cuando** se llama a cada una de las cinco rutas de `/tarjetas` sin el header `Authorization`, con un token inválido, o con uno vencido
- **Entonces** todas responden `401` y no se crea, cambia ni elimina nada

#### CA-RF24-38 — Al eliminar la cuenta se borran sus tarjetas

- **Dado** un usuario con tarjetas y otro usuario con tarjetas
- **Cuando** el primero elimina su cuenta (RF-04)
- **Entonces** no queda ninguna tarjeta con su `usuarioId` y las del otro usuario siguen intactas

---

### RF-25 — Actualizar la tasa de una tarjeta

La tasa se cambia con `PATCH /tarjetas/:id` (decisión D10). La validación es la de CA-RF24-22.

#### CA-RF25-01 — Cambiar la tasa de la tarjeta

- **Dado** una tarjeta «Visa» con tasa 0,2921 y `cuotaUnicaSinInteres` `true`
- **Cuando** envía `PATCH` con `{ "tasaEA": 0.3150 }`
- **Entonces** responde `200` con la tarjeta completa: `tasaEA` 0,315 y el resto igual (`id`, `nombre`, `cuotaUnicaSinInteres`, `creadaEn`); `actualizadaEn` no es anterior a la de antes; la base refleja el cambio y no hay un segundo documento

#### CA-RF25-02 — La tasa se guarda sin redondear y acepta los extremos

- **Dado** una tarjeta del usuario
- **Cuando** envía `{ "tasaEA": 0.29213 }`, luego `{ "tasaEA": 0 }` y luego `{ "tasaEA": 1 }`
- **Entonces** cada petición responde `200` con esa tasa exacta (sin redondear: RNF-11)

#### CA-RF25-03 — Una tasa inválida no cambia la tarjeta

- **Dado** una tarjeta con tasa 0,2921
- **Cuando** envía `{ "tasaEA": -0.01 }`, `{ "tasaEA": 1.0001 }`, `{ "tasaEA": 29.21 }`, `{ "tasaEA": "0.2921" }`, `{ "tasaEA": "alta" }` o `{ "tasaEA": null }`
- **Entonces** cada una responde `400` con un texto que empieza por `tasaEA` y la tarjeta conserva la tasa 0,2921

#### CA-RF25-04 — Cambiar la tasa modifica solo esa tarjeta

- **Dado** una tarjeta «Visa» con dos cargos fijos y un pago de tarjeta (transacción `PAGO_TARJETA` con su `tarjetaId`), otra tarjeta «Mastercard» del mismo usuario con un cargo, y una tarjeta de otro usuario
- **Cuando** el usuario cambia la tasa de «Visa»
- **Entonces** los cargos de ambas tarjetas, el pago, «Mastercard» y la tarjeta del otro usuario quedan exactamente como estaban (mismos documentos, mismas fechas de modificación): el cambio de tasa no toca nada más (la verificación contra compras reales llega en 5.2.x)

#### CA-RF25-05 — Repetir el mismo cambio es inofensivo

- **Dado** una tarjeta cuya tasa ya se cambió a 0,315
- **Cuando** se envía otra vez `{ "tasaEA": 0.315 }`
- **Entonces** responde `200` con la misma tarjeta (`PATCH` tolera repetirse, por eso no lleva `Idempotency-Key`)

#### CA-RF25-06 — Cambiar la tasa de una tarjeta ajena o inexistente: 404

- **Dado** una tarjeta del usuario B y un id válido que no existe
- **Cuando** el usuario A les envía `{ "tasaEA": 0.3 }`
- **Entonces** ambos responden `404` con `Tarjeta no encontrada` y la tarjeta de B no cambia

---

### RF-29 — Cargos fijos mensuales de una tarjeta (API)

#### Crear (`POST /tarjetas/:tarjetaId/cargos`)

#### CA-RF29-18 — Crear un cargo fijo

- **Dado** una tarjeta del usuario
- **Cuando** envía `POST /tarjetas/<tarjetaId>/cargos` con `{ "descripcion": "Netflix", "valor": 38900 }`
- **Entonces** responde `201` con el cargo en la forma del contrato: `tarjetaId` el de la ruta, `descripcion` `Netflix`, `valor` 38900, `activo` `true`, un `id` y las fechas, sin `usuarioId`; y existe en la base un único documento con el `usuarioId` del usuario y esa `tarjetaId`

#### CA-RF29-19 — Valores por defecto y valores límite

- **Dado** una tarjeta del usuario
- **Cuando** crea cargos con `valor` 1, 1500000,5 y 999999999, uno con `activo` `false` y uno con descripción de 100 caracteres
- **Entonces** todos responden `201` y devuelven el valor sin redondear; el de `activo` `false` lo devuelve así; la descripción se devuelve completa

#### CA-RF29-20 — La descripción se guarda sin espacios sobrantes

- **Dado** una tarjeta del usuario
- **Cuando** envía `"descripcion": "  Netflix  "`
- **Entonces** responde `201` con `descripcion` `"Netflix"`

#### CA-RF29-21 — Faltan campos obligatorios

- **Dado** una tarjeta del usuario
- **Cuando** envía el cuerpo sin `descripcion`, o sin `valor`, o `{}`, o con alguno en `null`
- **Entonces** responde `400` con un texto por cada campo faltante que empieza por el nombre del campo, y no se guarda nada

#### CA-RF29-22 — Descripción inválida

- **Dado** una tarjeta del usuario
- **Cuando** envía `descripcion` vacía, solo espacios, de 101 caracteres o el número `123`
- **Entonces** responde `400` con un texto que empieza por `descripcion`, y no se guarda nada

#### CA-RF29-23 — Valor que no es un número positivo

- **Dado** una tarjeta del usuario
- **Cuando** envía `valor` 0, −38900, `"barato"` o el texto numérico `"38900"`
- **Entonces** responde `400` con un texto que empieza por `valor`, y no se guarda nada (para dejar de cobrar un cargo se desactiva, no se pone en cero)

#### CA-RF29-24 — `activo` solo acepta valores lógicos

- **Dado** una tarjeta del usuario
- **Cuando** envía `activo` `"quizás"`, `"true"`, `1` o `null`
- **Entonces** responde `400` con un texto que empieza por `activo`, y no se guarda nada

#### CA-RF29-25 — Campos no declarados se rechazan

- **Dado** una tarjeta del usuario
- **Cuando** el cuerpo incluye además `usuarioId`, `tarjetaId`, `id`, `createdAt` o `creadaEn`
- **Entonces** responde `400` con un texto por el campo sobrante y no se guarda nada (la tarjeta sale de la ruta y el dueño del JWT)

#### CA-RF29-26 — Tarjeta inexistente o de otro usuario: 404

- **Dado** un id válido de tarjeta que no existe, y otro de una tarjeta del usuario B
- **Cuando** el usuario A envía un `POST` con un cuerpo válido a `/tarjetas/<id>/cargos` de cada uno
- **Entonces** ambos responden `404` con `Tarjeta no encontrada` y no se crea ningún cargo

#### CA-RF29-27 — Dos cargos iguales en la misma tarjeta son legítimos

- **Dado** una tarjeta del usuario
- **Cuando** crea dos veces `{ "descripcion": "Netflix", "valor": 38900 }` con claves de idempotencia distintas
- **Entonces** ambas responden `201` con `id` distintos y la base tiene los dos cargos (no se deduplica por contenido)

#### CA-RF29-28 — Repetir la petición con la misma clave de idempotencia no crea otro cargo

- **Dado** un usuario que envía `POST /tarjetas/<tarjetaId>/cargos` con `Idempotency-Key` y obtiene `201`
- **Cuando** repite la misma petición con la misma clave
- **Entonces** recibe la misma respuesta `201` (mismo `id`) con `Idempotent-Replayed: true` y la base tiene un solo cargo

#### CA-RF29-29 — La misma clave con una petición distinta se rechaza

- **Dado** una clave ya usada con `{ "descripcion": "Netflix", "valor": 38900 }`
- **Cuando** se envía con la misma clave `{ "descripcion": "Netflix", "valor": 45000 }`
- **Entonces** responde `422` y el cargo no cambia

#### Listar y consultar

#### CA-RF29-30 — Lista solo los cargos de esa tarjeta, en el orden en que se crearon

- **Dado** el usuario A con la tarjeta «Visa» con tres cargos (creados en distintos momentos), la tarjeta «Mastercard» con un cargo, y el usuario B con otra tarjeta con un cargo
- **Cuando** A consulta `GET /tarjetas/<id de Visa>/cargos`
- **Entonces** responde `200` con `{ "items": [...] }` de exactamente los tres cargos de «Visa» en la forma del contrato, del más antiguo al más reciente, sin los de «Mastercard» ni los de B; sin paginación (decisión D6)

#### CA-RF29-31 — Filtrar por `activo`

- **Dado** una tarjeta con dos cargos activos y uno inactivo
- **Cuando** consulta `?activo=true`, luego `?activo=false` y luego sin filtro
- **Entonces** devuelve respectivamente los dos activos, el inactivo y los tres; y un `activo=quizás` o un parámetro desconocido (`?valor=1`) responde `400` con `message` (arreglo)

#### CA-RF29-32 — Sin cargos, la lista es vacía; una tarjeta ajena, 404

- **Dado** una tarjeta del usuario A sin cargos, y una tarjeta del usuario B con cargos
- **Cuando** A lista los cargos de cada una
- **Entonces** la propia responde `200` con `{ "items": [] }`; la de B responde `404` con `Tarjeta no encontrada` (no `200` vacía)

#### CA-RF29-33 — Consultar un cargo propio

- **Dado** un cargo de una tarjeta del usuario
- **Cuando** consulta `GET /tarjetas/<tarjetaId>/cargos/<id>`
- **Entonces** responde `200` con exactamente el cargo en la forma del contrato

#### CA-RF29-34 — Cargo inexistente, de otro usuario o de otra tarjeta: 404

- **Dado** un id válido de cargo que no existe, un cargo del usuario B, y un cargo propio que pertenece a «Mastercard»
- **Cuando** el usuario A consulta (`GET`) cada uno bajo la ruta de su propia tarjeta «Visa» (el tercero, que es de «Mastercard», también bajo la ruta de «Visa»)
- **Entonces** las tres responden `404` con `Cargo fijo no encontrado` (el mismo mensaje) y nada cambia (decisión D7); si la tarjeta de la ruta es ajena o no existe, el mensaje es `Tarjeta no encontrada`

#### CA-RF29-35 — Ids mal formados en las rutas de cargos: 400

- **Dado** un usuario con sesión
- **Cuando** usa `abc` como `tarjetaId` o como `id` en cualquiera de las cinco rutas de cargos
- **Entonces** responde `400` con `message` (arreglo) que empieza por `tarjetaId` o por `id` según el caso

#### Activar y desactivar

#### CA-RF29-36 — Desactivar y volver a activar un cargo

- **Dado** un cargo activo
- **Cuando** envía `PATCH` con `{ "activo": false }` y luego `{ "activo": true }`
- **Entonces** cada petición responde `200` con ese `activo` y el resto del cargo igual (`id`, `descripcion`, `valor`, `tarjetaId`); mientras está inactivo sigue existiendo y aparece en la lista sin filtro y en `?activo=false`; no exige enviar otros campos (decisión D3)

#### Sesión y datos del usuario

#### CA-RF29-37 — Sin sesión válida, ninguna ruta de cargos se ejecuta

- **Dado** un cargo existente
- **Cuando** se llama a cada una de las cinco rutas de cargos sin el header `Authorization`, con un token inválido, o con uno vencido
- **Entonces** todas responden `401` y no se crea, cambia ni elimina nada

#### CA-RF29-38 — Al eliminar la cuenta se borran sus cargos

- **Dado** un usuario con cargos (activos e inactivos) y otro usuario con cargos
- **Cuando** el primero elimina su cuenta (RF-04)
- **Entonces** no queda ningún cargo con su `usuarioId` y los del otro usuario siguen intactos

---

### RF-33 — Editar y eliminar tarjetas y cargos fijos

#### Editar tarjeta (`PATCH /tarjetas/:id`)

#### CA-RF33-01 — Renombrar la tarjeta

- **Dado** una tarjeta «Visa» del usuario
- **Cuando** envía `PATCH` con `{ "nombre": "  Visa Oro  " }`
- **Entonces** responde `200` con `nombre` `"Visa Oro"` y el resto igual; la base refleja el cambio

#### CA-RF33-02 — Editar varios campos a la vez

- **Dado** una tarjeta con `cuotaUnicaSinInteres` `false`
- **Cuando** envía `{ "nombre": "Visa Oro", "tasaEA": 0.31, "cuotaUnicaSinInteres": true }`
- **Entonces** responde `200` con los tres valores nuevos

#### CA-RF33-03 — Cuerpo vacío

- **Dado** una tarjeta del usuario
- **Cuando** envía `PATCH` con `{}`
- **Entonces** responde `400` y la tarjeta no cambia (al menos un campo)

#### CA-RF33-04 — Valores inválidos en la edición

- **Dado** una tarjeta del usuario
- **Cuando** envía `{ "nombre": "" }`, `{ "nombre": "   " }`, un nombre de 51 caracteres, `{ "nombre": null }`, `{ "cuotaUnicaSinInteres": "sí" }` o `{ "cuotaUnicaSinInteres": null }`
- **Entonces** cada una responde `400` con un texto que empieza por el campo inválido y la tarjeta no cambia

#### CA-RF33-05 — Campos no editables se rechazan

- **Dado** una tarjeta del usuario
- **Cuando** el cuerpo incluye `usuarioId`, `id`, `createdAt` o `creadaEn`, solos o junto a un campo válido
- **Entonces** responde `400` con un texto por el campo sobrante y la tarjeta no cambia (ni siquiera el campo válido que viniera junto)

#### CA-RF33-06 — Renombrar a un nombre que ya usa otra tarjeta: 409

- **Dado** un usuario con tarjetas «Visa» y «Mastercard»
- **Cuando** envía a «Mastercard» `{ "nombre": "visa" }` (también `"Visa "`), solo o junto a `{ "tasaEA": 0.4 }`
- **Entonces** responde `409` con `Ya existe una tarjeta con ese nombre` y ninguna de las dos cambia (ni siquiera la tasa que viniera junto)

#### CA-RF33-07 — Cambiar solo las mayúsculas del propio nombre no es conflicto

- **Dado** una tarjeta «Visa» del usuario
- **Cuando** envía `{ "nombre": "visa" }` y luego `{ "nombre": "Visa" }`
- **Entonces** ambas responden `200` con el nombre enviado

#### CA-RF33-08 — El nombre que usa otro usuario no estorba

- **Dado** el usuario A con «Mastercard» y el usuario B con «Visa»
- **Cuando** A renombra su tarjeta a «Visa»
- **Entonces** responde `200` y la tarjeta de B no cambia

#### CA-RF33-09 — Dos renombres simultáneos al mismo nombre: uno gana, el otro 409

- **Dado** un usuario con tarjetas «Visa» y «Mastercard» y sin «Amex»
- **Cuando** envía a la vez dos `PATCH`, uno a cada tarjeta, con `{ "nombre": "Amex" }`
- **Entonces** uno responde `200` y el otro `409` (nunca `500`), y queda una sola tarjeta «Amex»

#### CA-RF33-10 — Editar la tarjeta de otro usuario o inexistente: 404

- **Dado** una tarjeta del usuario B y un id válido que no existe
- **Cuando** el usuario A les envía un `PATCH` con un cuerpo válido (por ejemplo `{ "nombre": "Nueva" }`)
- **Entonces** ambos responden `404` con `Tarjeta no encontrada` y la tarjeta de B no cambia

#### CA-RF33-11 — Repetir la misma edición es inofensivo

- **Dado** una tarjeta ya renombrada a «Visa Oro»
- **Cuando** se envía otra vez el mismo `PATCH`
- **Entonces** responde `200` con la misma tarjeta

#### Editar cargo (`PATCH /tarjetas/:tarjetaId/cargos/:id`)

#### CA-RF33-12 — Editar la descripción y el valor de un cargo

- **Dado** un cargo «Netflix» de 38900
- **Cuando** envía `{ "descripcion": "  Netflix Premium  " }`, luego `{ "valor": 45900.5 }` y luego ambos a la vez
- **Entonces** cada petición responde `200` con el cargo completo: la descripción sin espacios sobrantes y el valor sin redondear, el resto igual (`id`, `tarjetaId`, `activo`, `creadaEn`)

#### CA-RF33-13 — Cuerpo vacío y valores inválidos al editar un cargo

- **Dado** un cargo del usuario
- **Cuando** envía `{}`, `{ "descripcion": "" }`, una descripción de 101 caracteres, `{ "valor": 0 }`, `{ "valor": -5 }`, `{ "valor": "38900" }`, `{ "valor": null }` o `{ "activo": "quizás" }`
- **Entonces** cada una responde `400` (con un texto que empieza por el campo inválido, salvo `{}`) y el cargo no cambia

#### CA-RF33-14 — Un cargo no se puede mover a otra tarjeta ni cambiar sus campos de sistema

- **Dado** un cargo de la tarjeta «Visa» y otra tarjeta «Mastercard» del mismo usuario
- **Cuando** envía `{ "tarjetaId": "<id de Mastercard>" }`, o `usuarioId`, `id`, `createdAt` o `creadaEn`, solos o junto a un campo válido
- **Entonces** responde `400` con un texto por el campo sobrante y el cargo no cambia (decisión D2)

#### CA-RF33-15 — Repetir la misma edición de un cargo es inofensivo

- **Dado** un cargo ya editado a `{ "valor": 45900 }`
- **Cuando** se envía otra vez el mismo `PATCH`
- **Entonces** responde `200` con el mismo cargo

#### Eliminar tarjeta (`DELETE /tarjetas/:id`)

#### CA-RF33-16 — Eliminar una tarjeta sin cargos ni pagos

- **Dado** una tarjeta del usuario sin cargos ni pagos
- **Cuando** envía `DELETE /tarjetas/<id>`
- **Entonces** responde `204` sin cuerpo, el documento ya no existe y deja de aparecer en la lista y en `GET /tarjetas/<id>` (`404`)

#### CA-RF33-17 — Eliminar de nuevo responde 404

- **Dado** una tarjeta ya eliminada
- **Cuando** se repite el `DELETE`
- **Entonces** responde `404` con `Tarjeta no encontrada`

#### CA-RF33-18 — Al eliminar una tarjeta se borran sus cargos fijos

- **Dado** una tarjeta «Visa» con tres cargos (dos activos y uno inactivo), otra tarjeta «Mastercard» del mismo usuario con un cargo, y una tarjeta de otro usuario con cargos
- **Cuando** el usuario elimina «Visa»
- **Entonces** responde `204`, no queda ningún cargo con la `tarjetaId` de «Visa» y los cargos de «Mastercard» y del otro usuario siguen intactos (decisión D4a)

#### CA-RF33-19 — No se elimina una tarjeta con pagos registrados

- **Dado** una tarjeta «Visa» con un cargo y una transacción `PAGO_TARJETA` del usuario con su `tarjetaId`
- **Cuando** envía `DELETE /tarjetas/<id>`
- **Entonces** responde `409` con `No se puede eliminar una tarjeta que ya tiene pagos registrados`; la tarjeta, su cargo y el pago siguen existiendo intactos (decisión D4b)

#### CA-RF33-20 — Los pagos de otra tarjeta no bloquean

- **Dado** una tarjeta «Visa» sin pagos y una tarjeta «Mastercard» del mismo usuario con un pago
- **Cuando** el usuario elimina «Visa»
- **Entonces** responde `204` y el pago de «Mastercard» y su tarjeta quedan intactos

#### CA-RF33-21 — Sin los pagos, la tarjeta se puede eliminar

- **Dado** una tarjeta que dio `409` por tener un pago
- **Cuando** el pago se elimina (queda sin transacciones con su `tarjetaId`) y se repite el `DELETE`
- **Entonces** responde `204`

#### CA-RF33-22 — Eliminar la tarjeta de otro usuario o inexistente: 404, nunca 409

- **Dado** una tarjeta del usuario B con un pago (que bloquearía su eliminación) y un id válido que no existe
- **Cuando** el usuario A envía `DELETE` a cada una
- **Entonces** ambas responden `404` con `Tarjeta no encontrada` (nunca `409`, que revelaría que existe) y la tarjeta de B y sus cargos siguen existiendo

#### CA-RF33-23 — Tras eliminar una tarjeta se puede reutilizar su nombre

- **Dado** una tarjeta «Visa» eliminada
- **Cuando** el usuario crea otra tarjeta «Visa»
- **Entonces** responde `201` (el índice único ya no choca)

#### Eliminar cargo (`DELETE /tarjetas/:tarjetaId/cargos/:id`)

#### CA-RF33-24 — Eliminar un cargo propio

- **Dado** una tarjeta con dos cargos
- **Cuando** envía `DELETE` a uno de ellos (activo o inactivo)
- **Entonces** responde `204` sin cuerpo, ese cargo ya no existe ni aparece en la lista (`GET` del cargo da `404`), y la tarjeta y el otro cargo siguen intactos

#### CA-RF33-25 — Eliminar un cargo de nuevo responde 404

- **Dado** un cargo ya eliminado
- **Cuando** se repite el `DELETE`
- **Entonces** responde `404` con `Cargo fijo no encontrado`

#### CA-RF33-26 — Editar o eliminar el cargo de otro usuario o de otra tarjeta: 404

- **Dado** un cargo del usuario B, y un cargo propio de «Mastercard» enviado bajo la ruta de «Visa»
- **Cuando** el usuario A les envía un `PATCH` válido y un `DELETE`
- **Entonces** todas las peticiones responden `404` con `Cargo fijo no encontrado` y ningún cargo cambia ni se elimina (ver también CA-RF29-34)

### Documentación Swagger

`src/common/swagger.spec.ts` descubre todos los controladores y fallará si alguna de las diez rutas o de los DTO (de entrada y de salida) del paquete no tiene etiqueta, resumen, descripción detallada, respuestas de error (400, 401, 404, 409, 422 y 500 según apliquen) y `description` + `example` en cada propiedad; además, cada `POST` que responde `201` debe documentar el header `Idempotency-Key`. No es una prueba de este paquete, pero su cumplimiento forma parte de darlo por terminado. Los criterios CA-RF24-17..38, CA-RF25-01..06, CA-RF29-18..38 y CA-RF33-01..26 fijan los códigos de error que deben documentarse.

---

## Paquete 5.2.1 — Modelar entidad CompraCredito (RF-26, RF-28)

Estado: Aprobado (2026-11-12)

### Alcance

Entra **solo la entidad** (esquema Mongoose) `CompraCredito`, colección `comprascredito`, y su registro en `TarjetasModule`. Una misma entidad guarda la compra a cuotas (RF-26) y el avance en efectivo (RF-28), que se distinguen por el campo `tipo`. **No** entran: el cálculo de la cuota y del mes del último pago (RF-27, paquete 5.2.2), el servicio y los endpoints para registrar, listar, editar y eliminar compras y avances, y la transacción de dinero recibido que acompaña al avance (5.2.3), la proyección, el total del mes y el saldo (RF-30, RF-31; 5.3.x) ni la regla de «una tarjeta con compras no se elimina» (la agrega 5.2.3 sobre D4 de 5.1.2). Que la tarjeta y la categoría existan y sean del usuario tampoco lo verifica el esquema: lo hará el servicio de 5.2.3 (decisión D13). Los criterios describen lo que el modelo acepta, lo que rechaza con error de validación y los índices que declara, de modo que se puedan probar sin endpoints (`validateSync()` sobre un modelo creado con el esquema y lectura de `schema.indexes()`, igual que `src/tarjetas/tarjeta-credito.schema.spec.ts`).

Que la compra **copie** la tasa y la bandera de la tarjeta al registrarse lo hace el servicio de 5.2.3; aquí el esquema solo exige que ambos valores estén presentes y sean válidos (CA-RF26-24 a CA-RF26-27). La prueba de que editar la tarjeta después no cambia las compras ya registradas llega con 5.2.3.

### Fuentes

- RF-26 (Especificación de Requisitos): «registrar una compra con tarjeta de crédito indicando tarjeta, descripción, categoría, valor, número de cuotas y mes del primer pago».
- RF-28: «registrar un avance en efectivo de una tarjeta, reflejado como dinero recibido y como compra diferida a cuotas». La parte «dinero recibido» es una transacción (5.2.3); la parte «compra diferida a cuotas» es esta entidad con `tipo` AVANCE.
- RF-25 y D10 de 5.1.2: la tasa de la tarjeta es la vigente; cada compra copia la suya, y el desarrollador decidió que **también copia `cuotaUnicaSinInteres`**.
- Modelo lógico v2.0 (Documento de Diseño Técnico, diagrama de la sección 2.2): `comprascredito` = `usuarioId` (FK, index), `tarjetaId` (FK, index), `categoriaId` (FK), `tipo: TipoCompra`, `descripcion: String`, `valor: Number`, `cuotas: Number`, `fecha: Date` (index), `primerPago: Date`, `tasaEAAplicada: Number`. Enumeración `TipoCompra` = `COMPRA`, `AVANCE` (diagrama de clases). El modelo lógico **no** trae `cuotaUnicaSinInteres` en esta colección: se agrega por la decisión de arriba (D11).
- Documento de Diseño Técnico, sección 2.2: «La tasa de una compra con tarjeta se copia en `tasaEAAplicada` al registrarla, para que un cambio posterior de la tasa de la tarjeta no altere las cuotas ya pactadas»; los montos están en pesos colombianos y los cálculos usan precisión completa (RNF-11); las enumeraciones se validan en el esquema contra su conjunto cerrado. CU-14 (compra: tarjeta, cuotas, mes del primer pago, copia de la tasa vigente) y CU-15 (avance: valor, cuotas y mes del primer pago; el backend crea «la compra de tipo avance» y un ingreso clasificado como dinero recibido).
- ADR-001: relaciones por `ObjectId`, nunca embebidas. ADR-014: una compra con tarjeta no es una transacción; cuenta por su categoría en el **mes de la compra** (de ahí `fecha`); la cuota usa `tasaEAAplicada`; con tasa 0 la cuota es `V/n`.
- `CLAUDE.md`: el campo del usuario se llama exactamente `usuarioId` (así lo encuentra `AuthService.eliminarCuenta()`, RF-04); las entidades son anémicas; las enumeraciones cerradas se validan en el esquema; ejemplo de la hoja del promotor: $1.254.700 a 12 cuotas con E.A. 29,21 % → cuota de $119.802,13 (solo contexto: el cálculo es de 5.2.2 y no se prueba aquí).

### Contrato de nombres (aprobado)

- Entidad `CompraCredito` y esquema `CompraCreditoSchema`, en `src/tarjetas/compra-credito.schema.ts`; colección `comprascredito`; `timestamps: true`; el modelo se registra con el nombre de la clase (`CompraCredito`) en `TarjetasModule`.
- Enumeración `TipoCompra` (`COMPRA`, `AVANCE`) en `src/tarjetas/compra-credito.enums.ts`, siguiendo `meta-ahorro.enums.ts` y `transaccion.enums.ts`. Las pruebas usan los textos `'COMPRA'` y `'AVANCE'`, no importan la enumeración, así no dependen de su archivo.
- Campos, con los nombres del modelo lógico: `usuarioId`, `tarjetaId`, `categoriaId`, `tipo`, `descripcion`, `valor`, `cuotas`, `fecha`, `primerPago`, `tasaEAAplicada` y `cuotaUnicaSinInteres` (decisión D1) y, desde 5.2.3, `transaccionId` (opcional; solo los avances lo llevan; ver D12 de 5.2.3, aprobada el 2026-11-13).
- `tarjetaId` referencia a `TarjetaCredito`; `categoriaId` referencia a `Categoria`; `usuarioId` referencia a `Usuario`.

### Decisiones aprobadas por el desarrollador (2026-11-12)

El desarrollador aprobó la opción recomendada en las 14 decisiones; los criterios de abajo ya la reflejan. Ninguna de estas reglas está definida en un RF ni en un ADR; cada una cita su respaldo o dice que no lo hay.

1. **Nombres de los campos** (todos los criterios). Recomendado: los del modelo lógico: `cuotas` (no `numeroCuotas`), `fecha` (de la compra), `primerPago` (mes del primer pago) y `tipo`. Fuente: modelo lógico y diagrama de clases. Alternativa: nombres más largos (`numeroCuotas`, `mesPrimerPago`), que obligarían a corregir el Documento de Diseño Técnico.
2. **Archivos, clase y enumeración** (contrato de nombres). Recomendado: los del contrato de arriba, junto al resto de entidades del módulo. Fuente: convención del repo (5.1.1); los nombres de archivo no están en ningún documento.
3. **`tipo`** (CA-RF26-01, CA-RF28-01 a CA-RF28-04). Recomendado: enumeración cerrada `COMPRA` / `AVANCE` (diagrama de clases), opcional con valor por defecto `COMPRA` (lo más frecuente, CU-14; el servicio de avances fija `AVANCE`). `null` se rechaza. Alternativa: obligatorio, sin valor por defecto, para forzar a quien cree el documento a elegirlo.
4. **`categoriaId` también en el avance** (CA-RF26-08, CA-RF26-09, CA-RF28-05). Recomendado: obligatoria siempre, avance incluido. Fuente: el modelo lógico muestra `categoriaId` como FK sin el «opcional» que sí lleva `tarjetaId` en `transacciones`. Ojo: RF-28 y CU-15 no piden categoría para el avance (solo valor, cuotas y mes del primer pago), así que 5.2.3 tendrá que decidir cómo se llena (por ejemplo, con la categoría de respaldo «Otros»). Alternativas: obligatoria solo en `COMPRA` y `null` permitido en `AVANCE` (esquema con una regla cruzada) u opcional siempre.
5. **`descripcion`** (CA-RF26-10 a CA-RF26-12). Recomendado: obligatoria (RF-26 la lista), con recorte de espacios, hasta 200 caracteres, el mismo tope que la descripción de las transacciones (el egreso con tarjeta se captura en el mismo formulario). Sin fuente para el tope; alternativa: 100, como el cargo fijo.
6. **`valor`** (CA-RF26-13 a CA-RF26-15). Recomendado: mayor que 0, sin tope superior y con decimales (igual que `monto` de las transacciones y `valor` del cargo). Sin fuente explícita para el rango.
7. **`cuotas`** (CA-RF26-16 a CA-RF26-18). Recomendado: entero entre 1 y 60 inclusive. Fuente: RF-26 y el modelo lógico solo dicen «número de cuotas»; **no hay fuente para el tope**: 60 es el máximo habitual de las tarjetas colombianas y evita proyecciones absurdas (RF-31 proyecta hasta la última cuota). Alternativas: otro tope (por ejemplo 36 o 120) o ninguno (solo entero ≥ 1).
8. **`fecha`** (CA-RF26-19, CA-RF26-20). Recomendado: obligatoria, sin valor por defecto, guarda el instante tal cual llega, y acepta fechas pasadas, presentes y futuras (como RF-09 para los movimientos). Fuente: el modelo lógico la marca con índice y ADR-014 cuenta la compra en el mes de la compra; RF-26 no la lista como dato del usuario, así que 5.2.3 puede ponerle «hoy» por defecto. Alternativa: el esquema le da «ahora» por defecto.
9. **`primerPago`** (CA-RF26-21 a CA-RF26-23). Recomendado: obligatorio y normalizado al **día 1 a las 00:00 UTC de su mes**, como el `periodo` de las metas de ahorro; RF-26 y CU-14 hablan del «mes del primer pago», no de un día. Así el mes del último pago (5.2.2) es una suma de meses sin problemas de fin de mes (31 de enero + 1 mes). El esquema **no** compara `primerPago` con `fecha` (puede ser el mismo mes, el siguiente o, si el usuario transcribe una compra ya en curso, uno anterior). Alternativas: guardar el día tal cual, o exigir que no sea anterior al mes de la compra.
10. **`tasaEAAplicada`** (CA-RF26-24, CA-RF26-25). Recomendado: obligatoria, fracción entre 0 y 1 inclusive, 0 permitido; exactamente la misma regla que `tasaEA` de la tarjeta (CA-RF24-10 a CA-RF24-13). Fuente: Diseño Técnico 2.2 (se copia al registrar) y la decisión de guardarla como fracción (29,21 % = 0,2921).
11. **`cuotaUnicaSinInteres` copiada** (CA-RF26-26, CA-RF26-27). Recomendado: obligatoria y **sin** valor por defecto. Por qué: si el servicio de 5.2.3 olvidara copiarla, un valor por defecto `false` produciría en silencio una cuota con interés donde correspondía sin interés; sin valor por defecto el olvido falla al guardar. Fuente: decisión del desarrollador (nota de D10 en 5.1.2). El Documento de Diseño Técnico (modelo lógico) debe actualizarse con este campo. Alternativa: opcional con `false` por defecto, como en la tarjeta.
12. **Índices** (CA-RF26-28, CA-RF26-29). Recomendado: un índice compuesto `{ usuarioId: 1, fecha: -1 }` (gasto por categoría del mes, igual que `transacciones`) y uno por `tarjetaId` (proyección y total del mes de una tarjeta, RF-30 y RF-31). Fuente: el modelo lógico marca `usuarioId`, `tarjetaId` y `fecha` con índice; agruparlos así es decisión de rendimiento, sin fuente. Ninguna restricción de unicidad (dos compras iguales son legítimas). Alternativa: tres índices simples, tal como los dibuja el modelo lógico.
13. **Existencia y dueño de `tarjetaId` y `categoriaId`** (CA-RF26-07, CA-RF26-09). Recomendado: el esquema solo exige un `ObjectId`; que la tarjeta y la categoría existan y sean del usuario (404 en caso contrario, como CA-RF27-04 de la plantilla) lo comprueba el servicio de 5.2.3. Igual que D7 de 5.1.1.
14. **Campos que el modelo lógico no trae** (CA-RF26-02). Recomendado: no agregar cuota, interés, saldo, mes del último pago (todo eso se calcula, RNF-11), estado de pagada, ni un `transaccionId` que enlace el avance con su transacción de dinero recibido; ningún RF lo pide. Si 5.2.3 necesita ese enlace para editar o eliminar un avance, se pide como cambio aparte (ADR-003). **Modificada el 2026-11-13 (5.2.3, D12 opción A):** el desarrollador aprobó agregar `transaccionId` (ver CA-RF28-25 y CA-RF26-02).

---

## RF-26 — Registrar compras con tarjeta de crédito

### Forma del documento

#### CA-RF26-01 — Una compra válida se acepta y conserva sus valores

- **Dado** un `usuarioId`, un `tarjetaId` y un `categoriaId` válidos
- **Cuando** se crea una compra con `descripcion` «Televisor», `valor` 1254700, `cuotas` 12, `fecha` 2026-11-10T15:00:00.000Z, `primerPago` 2026-12-01T00:00:00.000Z, `tasaEAAplicada` 0,2921 y `cuotaUnicaSinInteres` `false`, sin indicar `tipo`
- **Entonces** la validación no reporta errores y el documento conserva esos valores (la tasa exactamente `0,2921`, el valor sin redondear) y `tipo` es `COMPRA` (caso de referencia de la hoja del promotor: cuota $119.802,13, que calcula 5.2.2)

#### CA-RF26-02 — El documento guarda solo los campos del modelo: nada calculado

- **Dado** el esquema de la compra con tarjeta
- **Cuando** se listan sus campos
- **Entonces** son exactamente `usuarioId`, `tarjetaId`, `categoriaId`, `tipo`, `descripcion`, `valor`, `cuotas`, `fecha`, `primerPago`, `tasaEAAplicada`, `cuotaUnicaSinInteres` y `transaccionId` (más `_id`, `__v`, `createdAt` y `updatedAt`); **no** existe ningún campo de cuota, interés, saldo, mes del último pago ni estado de pagada, porque todo eso se calcula (RNF-11) y la entidad es anémica

> Modificado el 2026-11-13 (5.2.3, D12 opción A): se agregó `transaccionId` a la lista; antes el criterio prohibía cualquier campo de transacción asociada. Su prueba (`compra-credito.schema.spec.ts`) cambia en el mismo sentido.

#### CA-RF26-03 — La colección se llama `comprascredito` y registra fechas de creación y modificación

- **Dado** el esquema de la compra con tarjeta
- **Cuando** se leen sus opciones
- **Entonces** la colección es `comprascredito` y `timestamps` está activo

### Usuario, tarjeta y categoría

#### CA-RF26-04 — `usuarioId` es una referencia a usuario (ObjectId), llamada exactamente así

- **Dado** el esquema de la compra con tarjeta
- **Cuando** se inspecciona el campo `usuarioId`
- **Entonces** es de tipo `ObjectId` con referencia a `Usuario` (ADR-001) y se llama exactamente `usuarioId`, de modo que `AuthService.eliminarCuenta()` encuentre y borre sola esta colección (RF-04)

#### CA-RF26-05 — Sin `usuarioId`, o con uno que no es un id, la compra se rechaza

- **Dado** una compra con todos los demás campos válidos
- **Cuando** `usuarioId` está ausente, es `null`, o es el texto `no-es-un-id`
- **Entonces** la validación falla con error solo en `usuarioId` (no hay compras del sistema: siempre pertenece a un usuario)

#### CA-RF26-06 — `tarjetaId` es una referencia a la tarjeta (ObjectId)

- **Dado** el esquema de la compra con tarjeta
- **Cuando** se inspecciona el campo `tarjetaId`
- **Entonces** es de tipo `ObjectId` con referencia a `TarjetaCredito` (ADR-001: la compra no embebe la tarjeta)

#### CA-RF26-07 — Sin `tarjetaId`, o con uno que no es un id, la compra se rechaza

- **Dado** una compra con los demás campos válidos
- **Cuando** `tarjetaId` está ausente, es `null`, o es el texto `no-es-un-id`
- **Entonces** la validación falla con error solo en `tarjetaId` (una compra siempre pertenece a una tarjeta; que esa tarjeta exista y sea del usuario lo verifica el servicio, no el esquema)

#### CA-RF26-08 — `categoriaId` es una referencia a la categoría (ObjectId)

- **Dado** el esquema de la compra con tarjeta
- **Cuando** se inspecciona el campo `categoriaId`
- **Entonces** es de tipo `ObjectId` con referencia a `Categoria` (ADR-001)

#### CA-RF26-09 — Sin `categoriaId`, o con uno que no es un id, la compra se rechaza

- **Dado** una compra con los demás campos válidos
- **Cuando** `categoriaId` está ausente, es `null`, o es el texto `no-es-un-id`
- **Entonces** la validación falla con error solo en `categoriaId` (la compra cuenta por su categoría en el mes de la compra, ADR-014; que la categoría exista y sea visible para el usuario lo verifica el servicio)

> Pendiente de decisión: D4 propone que la categoría sea obligatoria también en el avance, aunque RF-28 y CU-15 no la piden.

### Descripción

#### CA-RF26-10 — Sin descripción se rechaza

- **Dado** una compra con los demás campos válidos
- **Cuando** `descripcion` está ausente, es `null`, es un texto vacío o solo tiene espacios (`"   "`)
- **Entonces** la validación falla con error solo en `descripcion`

#### CA-RF26-11 — La descripción se guarda sin espacios sobrantes

- **Dado** una compra con los demás campos válidos
- **Cuando** `descripcion` es `"  Televisor  "`
- **Entonces** la validación no reporta errores y la descripción guardada es `"Televisor"`

#### CA-RF26-12 — Longitud máxima de la descripción

- **Dado** una compra con los demás campos válidos
- **Cuando** `descripcion` tiene 200 caracteres, y en otra compra tiene 201
- **Entonces** la de 200 pasa la validación y la de 201 falla con error solo en `descripcion`

> Pendiente de decisión: el tope de 200 caracteres no está en ningún RF (D5).

### Valor

#### CA-RF26-13 — Sin valor, o con un valor que no es número, se rechaza

- **Dado** una compra con los demás campos válidos
- **Cuando** `valor` está ausente, es `null`, o es el texto `caro`
- **Entonces** la validación falla con error solo en `valor`

#### CA-RF26-14 — Un valor en cero o negativo se rechaza

- **Dado** una compra con los demás campos válidos
- **Cuando** `valor` es 0 o −1254700
- **Entonces** la validación falla con error solo en `valor` (una compra sin valor no genera cuotas)

#### CA-RF26-15 — Un valor positivo se acepta, sin tope superior y sin redondear

- **Dado** una compra con los demás campos válidos
- **Cuando** `valor` es 1, 1254700, 1500000,5 o 999999999
- **Entonces** todos pasan la validación y conservan su valor sin redondear (RNF-11)

### Número de cuotas

#### CA-RF26-16 — Sin número de cuotas, o con uno que no es número, se rechaza

- **Dado** una compra con los demás campos válidos
- **Cuando** `cuotas` está ausente, es `null`, o es el texto `doce`
- **Entonces** la validación falla con error solo en `cuotas`

#### CA-RF26-17 — Un número entero de cuotas dentro del rango se acepta

- **Dado** una compra con los demás campos válidos
- **Cuando** `cuotas` es 1, 12 o 60
- **Entonces** las tres pasan la validación y conservan su valor (una sola cuota es válida: es el caso de la tarjeta con `cuotaUnicaSinInteres`)

#### CA-RF26-18 — Cuotas en cero, negativas, no enteras o por encima del máximo se rechazan

- **Dado** una compra con los demás campos válidos
- **Cuando** `cuotas` es 0, −1, 12,5 o 61
- **Entonces** cada una falla con error solo en `cuotas`

> Pendiente de decisión: el máximo de 60 cuotas no está en ningún RF ni ADR (D7).

### Fechas

#### CA-RF26-19 — Sin fecha de compra, o con una que no es fecha, se rechaza

- **Dado** una compra con los demás campos válidos
- **Cuando** `fecha` está ausente, es `null`, o es el texto `ayer`
- **Entonces** la validación falla con error solo en `fecha`

#### CA-RF26-20 — La fecha de compra se guarda tal cual y admite pasado, presente y futuro

- **Dado** una compra con los demás campos válidos
- **Cuando** `fecha` es 2026-11-10T15:00:00.000Z, 2020-01-31T23:59:59.000Z (pasada y de fin de mes) o 2030-06-15T00:00:00.000Z (futura)
- **Entonces** las tres pasan la validación y conservan exactamente ese instante, sin llevarla al día 1 ni a medianoche (la compra cuenta en el mes de esa fecha, ADR-014)

#### CA-RF26-21 — Sin mes del primer pago, o con uno que no es fecha, se rechaza

- **Dado** una compra con los demás campos válidos
- **Cuando** `primerPago` está ausente, es `null`, o es el texto `pronto`
- **Entonces** la validación falla con error solo en `primerPago`

#### CA-RF26-22 — El mes del primer pago se guarda como el día 1 de su mes a las 00:00 UTC

- **Dado** una compra con los demás campos válidos
- **Cuando** `primerPago` es 2026-12-15T10:30:00.000Z, 2026-01-31T23:59:59.000Z, 2026-02-28T12:00:00.000Z, 2026-12-01T00:00:00.000Z o el texto `2026-03-20`
- **Entonces** todas pasan la validación y se guardan como 2026-12-01, 2026-01-01, 2026-02-01, 2026-12-01 y 2026-03-01, cada una a las 00:00:00.000 UTC (el mes del último pago de 5.2.2 se obtiene sumando meses a un día 1, sin problemas de fin de mes)

#### CA-RF26-23 — El esquema no compara el mes del primer pago con la fecha de compra

- **Dado** una compra con `fecha` 2026-11-10T15:00:00.000Z
- **Cuando** `primerPago` es noviembre de 2026 (el mismo mes), diciembre de 2026 (el siguiente) o octubre de 2026 (anterior)
- **Entonces** las tres pasan la validación (decisión D9: si el servicio quiere restringirlo, lo decide 5.2.3)

> Pendiente de decisión: ningún RF define si el primer pago puede ser anterior al mes de la compra (D9).

### Tasa y bandera copiadas de la tarjeta

#### CA-RF26-24 — Sin tasa aplicada, o con una que no es número, se rechaza

- **Dado** una compra con los demás campos válidos
- **Cuando** `tasaEAAplicada` está ausente, es `null`, o es el texto `alta`
- **Entonces** la validación falla con error solo en `tasaEAAplicada` (sin la tasa copiada no se puede calcular la cuota; la tasa 0 no es «sin tasa»)

#### CA-RF26-25 — Rango de la tasa aplicada: de 0 a 1, ambos incluidos

- **Dado** una compra con los demás campos válidos
- **Cuando** `tasaEAAplicada` es 0, 0,0001, 0,2921 o 1, y en otras compras es −0,01, 1,0001 o 29,21
- **Entonces** las cuatro primeras pasan la validación y conservan su valor sin redondear (con tasa 0 la cuota es `V/n`, ADR-014); las otras fallan con error solo en `tasaEAAplicada` (negativa, mayor que 100 % E.A., o un porcentaje enviado donde se esperaba una fracción)

#### CA-RF26-26 — Sin la bandera `cuotaUnicaSinInteres` copiada, o con una que no es lógica, se rechaza

- **Dado** una compra con los demás campos válidos
- **Cuando** `cuotaUnicaSinInteres` está ausente, es `null`, o es el texto `quizás`
- **Entonces** la validación falla con error solo en `cuotaUnicaSinInteres` (no hay valor por defecto: si el servicio no copia la bandera de la tarjeta, la compra no se guarda en lugar de calcularse mal)

#### CA-RF26-27 — La bandera acepta `true` y `false` y los conserva

- **Dado** una compra con los demás campos válidos
- **Cuando** `cuotaUnicaSinInteres` es `true`, o `false`
- **Entonces** ambas pasan la validación y conservan su valor (`false` no se confunde con «ausente»)

### Índices

#### CA-RF26-28 — Hay índices por usuario con fecha y por tarjeta

- **Dado** el esquema de la compra con tarjeta
- **Cuando** se leen sus índices
- **Entonces** existe un índice cuya primera clave es `usuarioId` e incluye `fecha` (el gasto por categoría de un mes consulta las compras del usuario por fecha, ADR-014) y otro cuya primera clave es `tarjetaId` (el total del mes y la proyección de una tarjeta suman sus compras, RF-30 y RF-31)

#### CA-RF26-29 — Dos compras iguales son legítimas

- **Dado** el esquema de la compra con tarjeta
- **Cuando** se leen sus índices
- **Entonces** ninguno es único: el modelo no impide dos compras con la misma descripción, valor y fecha en la misma tarjeta (no se deduplica por contenido)

### Módulo y eliminación de la cuenta

#### CA-RF26-30 — `TarjetasModule` registra el modelo `CompraCredito`

- **Dado** `TarjetasModule` compilado en una prueba (con los modelos reemplazados por colecciones en memoria)
- **Cuando** se pide el proveedor `getModelToken('CompraCredito')`
- **Entonces** existe (el nombre del modelo es el de la clase, como el de `TarjetaCredito` y `CargoRecurrente`), de modo que el servicio de 5.2.3 pueda inyectarlo y `AuthService.eliminarCuenta()` lo descubra entre los modelos registrados

#### CA-RF26-31 — Al eliminar la cuenta se borran sus compras

- **Dado** un usuario con compras (una `COMPRA` y un `AVANCE`) y otro usuario con compras
- **Cuando** el primero elimina su cuenta (RF-04, `DELETE /usuarios/me`)
- **Entonces** no queda ninguna compra con su `usuarioId` y las del otro usuario siguen intactas

---

## RF-28 — Registrar avances en efectivo de una tarjeta

El avance se guarda en la misma colección que la compra, con `tipo` `AVANCE`; todo lo que exige una compra lo exige un avance (CA-RF26-01 a CA-RF26-27). Su transacción de dinero recibido (clasificación `DINERO_RECIBIDO`, con `tarjetaId`) la crea el servicio de 5.2.3 y no se cubre aquí.

#### CA-RF28-01 — Un avance válido se acepta y conserva su tipo

- **Dado** un `usuarioId`, un `tarjetaId` y un `categoriaId` válidos
- **Cuando** se crea una compra con `tipo` `AVANCE`, `descripcion` «Avance en efectivo», `valor` 500000, `cuotas` 6, `fecha` 2026-11-10T15:00:00.000Z, `primerPago` 2026-12-01T00:00:00.000Z, `tasaEAAplicada` 0,2921 y `cuotaUnicaSinInteres` `false`
- **Entonces** la validación no reporta errores y el documento conserva `tipo` `AVANCE` y los demás valores

#### CA-RF28-02 — El tipo vale `COMPRA` si no se indica

- **Dado** una compra con los demás campos válidos y sin `tipo`
- **Cuando** se crea
- **Entonces** la validación no reporta errores y `tipo` es `COMPRA`

#### CA-RF28-03 — El tipo solo acepta `COMPRA` y `AVANCE`

- **Dado** una compra con los demás campos válidos
- **Cuando** `tipo` es `PRESTAMO`, `avance` (en minúsculas), un texto vacío, `null` o el número 1
- **Entonces** cada una falla con error solo en `tipo` (enumeración cerrada validada en el esquema, como `TipoMeta` y `ClasificacionFlujo`)

#### CA-RF28-04 — La enumeración tiene exactamente dos valores

- **Dado** el esquema de la compra con tarjeta
- **Cuando** se leen los valores permitidos del campo `tipo`
- **Entonces** son exactamente `COMPRA` y `AVANCE`

#### CA-RF28-05 — Un avance exige los mismos datos que una compra

- **Dado** una compra con `tipo` `AVANCE` y los demás campos válidos
- **Cuando** le falta `categoriaId`, o `cuotas`, o `primerPago`, o `tasaEAAplicada`, o `cuotaUnicaSinInteres` (cada caso por separado)
- **Entonces** cada una falla con error solo en el campo que falta (el avance es una compra diferida a cuotas y se proyecta igual que ella, RF-28)

> Pendiente de decisión: que el avance lleve categoría obligatoria no lo dicen RF-28 ni CU-15 (D4).

---

## Índice de criterios del paquete 5.2.1

- **RF-26:** CA-RF26-01 a CA-RF26-31. Forma del documento: 01 a 03; usuario, tarjeta y categoría: 04 a 09; descripción: 10 a 12; valor: 13 a 15; cuotas: 16 a 18; fechas: 19 a 23; tasa y bandera copiadas: 24 a 27; índices: 28 y 29; módulo y eliminación de la cuenta: 30 y 31.
- **RF-28:** CA-RF28-01 a CA-RF28-05.
- **Total:** 36 criterios.

### Criterios con «Pendiente de decisión»

CA-RF26-09 y CA-RF28-05 (D4), CA-RF26-12 (D5), CA-RF26-18 (D7) y CA-RF26-23 (D9). Las 14 decisiones quedaron aprobadas el 2026-11-12.

---

## Paquete 5.2.2 — Calcular cuota de una compra a cuotas con tasa efectiva anual, TDD (RF-27)

Estado: Aprobado (2026-11-12)

### Alcance

Entra **solo el cálculo**, sin endpoints, sin base de datos y sin servicio de Nest: (1) la conversión de la tasa efectiva anual a tasa mensual equivalente, (2) la cuota mensual fija de una compra (compra a cuotas o avance, RF-26 y RF-28) y (3) el mes del último pago (RF-27: «el valor estimado de cada cuota … y el mes del último pago»). Es el cálculo que reutilizarán el registro de compras (5.2.3, para mostrar la cuota antes de guardar, CU-14 paso 3) y la proyección y el pago de la tarjeta (5.3.1 y 5.3.2). **No** entran: el CRUD de compras y avances ni la vista previa por HTTP (5.2.3), el total del mes, el saldo y la proyección por mes (RF-30 y RF-31, 5.3.1), el pago de la tarjeta (5.3.2), el interés total ni un cronograma de cuotas (decisión D7) ni la comprobación de que la tarjeta o la categoría existan (la hace el servicio de 5.2.3). Del ejemplo de la plantilla, CA-RF27-03 (el cambio de tasa no recalcula compras anteriores) solo se cubre aquí en lo que corresponde a una función pura (CA-RF27-19: usa la tasa de la compra y no otra); la prueba con compras guardadas y tarjetas editadas llega en 5.2.3, y CA-RF27-04 (404 por tarjeta ajena) es de 5.2.3.

### Fuentes

- RF-27 (Especificación de Requisitos): «visualizar el valor estimado de cada cuota de una compra con tarjeta, calculado con la tasa mensual equivalente de la tarjeta, y el mes del último pago». «De la tarjeta» se entiende como la tasa **copiada en la compra** (`tasaEAAplicada`), no la actual de la tarjeta: lo fijan el Documento de Diseño Técnico (sección 2.2 y 4.3: «la tasa vigente se copia en la compra») y ADR-014; RF-25 lo confirma (la nueva tasa aplica solo a compras posteriores).
- ADR-014: «La tasa mensual se calcula como (1 + EA)^(1/12) − 1 y la cuota como V · i / (1 − (1 + i)^(−n)), o V / n cuando la tasa es cero». Los cálculos usan precisión completa y se redondean al peso solo al mostrar. `CLAUDE.md` (sección 5, «Cuota de una compra»): añade que la cuota es `V / n` también cuando es **una sola cuota** en una tarjeta con `cuotaUnicaSinInteres`, y que la cuota **no se guarda**: se calcula (RNF-11).
- Documento de Diseño Técnico, CU-14: paso 3 «el sistema calcula la cuota con la tasa mensual equivalente y muestra la cuota y el mes del último pago»; alternativo 2a «una sola cuota en una tarjeta marcada sin intereses: la cuota es igual al valor de la compra». El diagrama de servicios lista `TarjetasService.calcularCuota(compra)`.
- RNF-11 (Especificación de Requisitos): los cálculos se hacen en el backend con precisión completa y se redondea al peso únicamente al presentar.
- Diccionario de la EDT, 5.2.2: «Escribir primero las pruebas con los casos de referencia de la hoja de cálculo del promotor y luego implementar la conversión de tasa E.A. a mensual y el cálculo de la cuota fija, incluida la cuota única sin intereses»; aceptación: «coinciden al peso con los casos de referencia (por ejemplo, $1.254.700 a 12 cuotas con E.A. 29,21 % da una cuota de $119.802)».
- Esquema `CompraCredito` (5.2.1, ya en `develop`): `valor` mayor que 0; `cuotas` entero de 1 a 60 (D7, sin fuente para el tope); `tasaEAAplicada` fracción de 0 a 1 (0,2921 = 29,21 %); `cuotaUnicaSinInteres` lógica, obligatoria y sin valor por defecto; `primerPago` siempre el día 1 a las 00:00 UTC de su mes. El mes del último pago se obtiene sumando meses a ese día 1, sin problemas de fin de mes (CA-RF26-22).
- Convención del repo para funciones puras de calendario (`src/reportes/periodo.ts`, `src/reportes/rango-meses.ts`, `src/common/primer-dia-del-mes.ts`): meses y fechas en UTC, aritmética por índice de mes, sin dependencia de la base.

### Valores de referencia y cómo se obtuvieron

- **De la hoja del promotor:** $1.254.700 a 12 cuotas con E.A. 29,21 % → cuota de $119.802,13 (a 2 decimales; el Diccionario de la EDT lo cita como $119.802 «al peso»). Es el **único** valor que viene de la hoja: los documentos no incluyen la hoja de Numbers ni otros casos.
- **Calculados por el tester** con la fórmula de ADR-014 en doble precisión (Node) y, para 13 de los casos ($1.254.700 a 12, 24, 36 y 60 cuotas; $500.000 a 3 y 6; $100.000 a 2; $1 a 12; $0,01 a 3; $999.999.999 a 60 y a 12 con tasa 1; $1.000.000 a 12 con tasas 0,2 y 1; el resto, como $1.254.700 a 6 cuotas, solo con la fórmula), **comprobados con un segundo método independiente**: una búsqueda binaria de la cuota que deja en cero el saldo después de `n` pagos (`saldo = saldo · (1 + i) − cuota`); ambos coinciden con diferencia relativa menor que 1e-14. El caso de 12 cuotas del promotor coincide además con el cálculo directo `119.802,1331718775`. El caso de 1 % mensual coincide con la tabla de amortización estándar de un préstamo de $1.000.000 a 12 meses al 1 % mensual (cuota $88.848,79). La tasa mensual de 12 % E.A. (0,9489 %) y la de 100 % E.A. (5,9463 % = 2^(1/12) − 1) son valores conocidos de conversión de tasas.
- Tabla de cuotas con E.A. 29,21 % (i = 0,02158539913422497): $1.254.700 a 6, 12, 24, 36 y 60 cuotas → 225.196,278855, 119.802,133172, 67.534,721989, 50.487,483510 y 37.493,902150; $500.000 a 3 y 6 cuotas → 173.913,014933 y 89.741,085062.
- **Tolerancia al verificar** (decisión D8): el valor de la hoja con 2 decimales (`toBeCloseTo(119802.13, 2)`, diferencia menor que 0,005); los calculados por el tester con 6 decimales cuando la cuota es menor que 1.000.000 y con 4 cuando es mayor (el error de la doble precisión crece con la magnitud). Nunca se compara contra un valor redondeado al peso: la función **no redondea**.

### Contrato de nombres (aprobado)

- Archivo `src/tarjetas/cuota-credito.ts`, con **funciones puras** exportadas, sin dependencias de Nest, de Mongoose ni de la base (pueden importar tipos). Las pruebas importan de ese archivo, que el implementador crea.
- `calcularTasaMensual(tasaEA: number): number` — tasa mensual equivalente, `(1 + EA)^(1/12) − 1`.
- `calcularCuota(compra: { valor: number; cuotas: number; tasaEAAplicada: number; cuotaUnicaSinInteres: boolean }): number` — cuota mensual sin redondear. Recibe un objeto con esos cuatro campos (los nombres de `CompraCredito`); cualquier otra propiedad del objeto se ignora.
- `calcularMesUltimoPago(primerPago: Date, cuotas: number): Date` — el día 1 a las 00:00:00.000 UTC del mes de la última cuota.
- Los errores son `RangeError` con un mensaje que empieza por el nombre del campo (D4). Las pruebas verifican la clase y que el mensaje contenga el nombre del campo, no el texto completo.

### Decisiones aprobadas por el desarrollador (2026-11-12)

El desarrollador aprobó la opción recomendada en las nueve decisiones; los criterios de abajo ya la reflejan. Ninguna de estas reglas está definida en un RF ni en un ADR, salvo donde se cita; cada una dice su respaldo y su alternativa.

1. **Dónde vive el cálculo** (contrato de nombres; todos los criterios). Recomendado: **funciones puras en un archivo propio** (`src/tarjetas/cuota-credito.ts`), sin inyección de dependencias; fáciles de probar sin Nest ni base y reutilizables por 5.2.3, 5.3.1 y 5.3.2. Fuente: ninguna fija el lugar. El diagrama de servicios del Documento de Diseño Técnico lista `TarjetasService.calcularCuota(compra)` y el Diccionario de la EDT habla de un «servicio de cálculo de cuotas»: la recomendación **no contradice** el diseño, pero lo interpreta así: cuando `TarjetasService` necesite exponer `calcularCuota(compra)` (5.2.3 o 5.3.1), lo hará delegando en estas funciones; ese método no se prueba aquí. Alternativa: un método de `TarjetasService` (obliga a construir el servicio con sus modelos en cada prueba unitaria y arrastra dependencias que el cálculo no necesita).
2. **Nombres y firma** (contrato de nombres). Recomendado: las tres funciones de arriba, en español, con el mismo estilo que `resolverPeriodo` y `mesesEntre`; `calcularMesUltimoPago` aparte de `calcularCuota` (tienen entradas distintas y 5.3.1 las usa por separado). Alternativas: argumentos posicionales `(valor, cuotas, tasaEA, cuotaUnicaSinInteres)` (cuatro parámetros del mismo aspecto con un lógico al final, fácil de equivocar) o una sola función que devuelva `{ cuota, mesUltimoPago }`.
3. **Forma de la entrada** (CA-RF27-19, CA-RF27-20). Recomendado: un **objeto con los campos de la compra** (`valor`, `cuotas`, `tasaEAAplicada`, `cuotaUnicaSinInteres`), no un documento de Mongoose ni la clase `CompraCredito`: así sirve para una compra ya guardada y para la vista previa de CU-14 (la compra aún no existe y se arma con la tasa y la bandera que la tarjeta tiene hoy, que son las que se copiarán al guardar). Alternativa: recibir solo números.
4. **Entradas inválidas** (CA-RF27-04, CA-RF27-21 a CA-RF27-25, CA-RF27-32, CA-RF27-33). Recomendado: **lanzar `RangeError`** con el nombre del campo al inicio del mensaje, sin devolver `NaN` ni un valor por defecto, y sin depender de `HttpException` (la función no sabe de HTTP; 5.2.3 ya responde `400` con el DTO antes de llamarla). Se revalidan las mismas reglas que el esquema de 5.2.1 (valor finito y mayor que 0, sin tope; cuotas entero de 1 a 60; tasa de 0 a 1) y además se exige que `cuotaUnicaSinInteres` sea un lógico: si faltara, el cálculo sería en silencio con interés, el mismo riesgo por el que el esquema no le da valor por defecto (D11 de 5.2.1). Se rechaza también el texto numérico (`"12"`): la función recibe números. Por qué validar de nuevo: es una función pública que reutilizan otros paquetes y un `NaN` dentro de un monto de dinero se propaga sin avisar. Alternativas: lanzar `BadRequestException` (responde `400` sin traducir, pero acopla el cálculo a HTTP), devolver `NaN`, o no validar y confiar en el esquema.
5. **Una sola cuota con tasa mayor que 0 y sin la bandera** (CA-RF27-10). Recomendado: se aplica la fórmula tal cual, que para `n = 1` da `V · (1 + i)`: un mes de interés (ejemplo: $80.000, E.A. 29,21 % → $81.726,83). Fuente: ADR-014 define la excepción solo para «tasa cero» y `CLAUDE.md` y CU-14 solo para tarjetas con `cuotaUnicaSinInteres`; RF-24 existe justamente para distinguir las tarjetas que difieren la cuota única sin intereses de las que no. Alternativa: tratar siempre `n = 1` como `V / n` (haría innecesaria la bandera, contra RF-24 y CU-14).
6. **Mes del último pago** (CA-RF27-26 a CA-RF27-31). Recomendado: devolver un `Date` (el mismo tipo que `primerPago`) en el **día 1 a las 00:00:00.000 UTC** del mes `primerPago + (cuotas − 1)` meses, con aritmética por mes en UTC, sin importar el día ni la hora de `primerPago` (la función tolera una fecha sin normalizar y usa su mes en UTC), con cruce de año correcto, sin modificar la fecha recibida; una cuota → el mismo mes. Fuente: CU-14 («mes del último pago») y la normalización a día 1 UTC de CA-RF26-22; la fórmula `primerPago + (cuotas − 1)` es la del encargo, sin fuente propia en los documentos. Alternativas: devolver un texto `YYYY-MM` como los reportes, o exigir que `primerPago` ya venga normalizado.
7. **Qué se devuelve** (todos los de cuota). Recomendado: solo la cuota, un número. El interés total (`cuota · n − valor`), el interés por mes y el cronograma no se calculan aquí: RF-27 pide la cuota y el mes del último pago, y la proyección por mes es de 5.3.1. Nota: el ejemplo de la plantilla (CA-RF27-02) dice «el interés es $0»; eso se deduce de la cuota (`80.000 · 1 − 80.000`) y se prueba como propiedad en CA-RF27-09 sin agregar funciones. Alternativa: devolver también el interés total.
8. **Precisión y tolerancia** (todos los de cuota). Recomendado: la función no redondea (RNF-11); las pruebas usan las tolerancias de «Valores de referencia» y comprueban expresamente que el resultado conserva decimales más allá del segundo (CA-RF27-06). El Diccionario de la EDT dice «coinciden al peso» ($119.802), pero `CLAUDE.md` y la hoja dan $119.802,13: se verifica el valor más exacto, que incluye al otro. Alternativa: redondear la cuota al peso o a 2 decimales dentro del cálculo (contra RNF-11, y la proyección acumularía el error).
9. **Tasas positivas casi cero** (CA-RF27-15). Recomendado: sin umbral especial; la fórmula directa debe dar un resultado finito muy cercano a `V / n` y, si el cálculo de la tasa mensual en doble precisión resulta exactamente 0, se aplica `V / n`. No hay fuente; es solo la consecuencia de que la fórmula divide por `i` en el límite.

---

## RF-27 — Calcular la cuota y el mes del último pago de una compra a cuotas

### Tasa mensual equivalente

#### CA-RF27-01 — La tasa mensual equivalente de 29,21 % E.A.

- **Dado** una tasa efectiva anual de 0,2921 (29,21 %)
- **Cuando** se calcula la tasa mensual equivalente
- **Entonces** es `(1 + 0,2921)^(1/12) − 1` = 0,02158539913422497 (verificable con `toBeCloseTo(0.02158539913422497, 12)`), sin multiplicarla por 100 ni dividir la tasa anual entre 12 (la tasa mensual **no** es 0,2921 / 12 = 0,02434)

#### CA-RF27-02 — Otras conversiones conocidas

- **Dado** las tasas efectivas anuales 0, 0,12, 1 y `1,01^12 − 1` (la que equivale a 1 % mensual)
- **Cuando** se calcula la tasa mensual de cada una
- **Entonces** son 0 (exactamente 0), 0,009488792934583046, 0,05946309435929531 (= 2^(1/12) − 1) y 0,01 (con 12 decimales)

#### CA-RF27-03 — Capitalizar la tasa mensual 12 veces devuelve la anual

- **Dado** las tasas efectivas anuales 0,0001, 0,05, 0,2921, 0,5 y 1
- **Cuando** se calcula la tasa mensual `i` de cada una
- **Entonces** `(1 + i)^12 − 1` es igual a la tasa anual de partida con una diferencia menor que 1e-12, y `i` es siempre mayor que 0 y menor que la tasa anual

#### CA-RF27-04 — Una tasa anual inválida se rechaza

- **Dado** una tasa efectiva anual de −0,01, 1,0001, 29,21 (un porcentaje donde se espera una fracción), `NaN`, `Infinity`, el texto `"0.2921"`, `null` o `undefined`
- **Cuando** se calcula la tasa mensual
- **Entonces** lanza `RangeError` con un mensaje que contiene `tasaEA` (decisión D4); la tasa 0 y la tasa 1 sí se aceptan

### Cuota mensual: caso de referencia y precisión completa

#### CA-RF27-05 — Caso de referencia de la hoja del promotor

- **Dado** una compra de $1.254.700 a 12 cuotas con tasa aplicada de 0,2921 y sin cuota única sin interés (`cuotaUnicaSinInteres` `false`)
- **Cuando** se calcula la cuota
- **Entonces** es $119.802,13 (`toBeCloseTo(119802.13, 2)`; el valor completo es 119.802,1331718775, que se verifica con `toBeCloseTo(119802.1331718775, 6)`), con la tasa mensual `(1 + 0,2921)^(1/12) − 1` y la fórmula `V · i / (1 − (1 + i)^(−n))`

#### CA-RF27-06 — La cuota se devuelve con precisión completa, sin redondear

- **Dado** el caso de referencia ($1.254.700, 12 cuotas, 0,2921) y el de $500.000 a 6 cuotas con 0,2921 (cuota 89.741,08506207)
- **Cuando** se calculan las cuotas
- **Entonces** los valores devueltos **no** son iguales a su redondeo al peso ni a 2 decimales (119.802,13 y 89.741,09), sino a los completos (`119802.1331718775` y `89741.08506207002`, con 6 decimales): el redondeo se hace solo al presentar (RNF-11)

#### CA-RF27-07 — Más valores de referencia con E.A. 29,21 %

- **Dado** la tasa aplicada 0,2921, sin cuota única sin interés, y el valor y las cuotas de cada caso
- **Cuando** se calcula la cuota
- **Entonces** el resultado es, con 6 decimales: $1.254.700 a 6 cuotas → 225.196,278855; a 24 cuotas → 67.534,721989; a 36 cuotas → 50.487,483510; a 60 cuotas → 37.493,902150; $500.000 a 6 cuotas → 89.741,085062; a 3 cuotas → 173.913,014933; $100.000 a 2 cuotas → 51.624,666866

#### CA-RF27-08 — Valores de referencia con otras tasas

- **Dado** una compra de $1.000.000 a 12 cuotas, sin cuota única sin interés, y la tasa aplicada de cada caso
- **Cuando** se calcula la cuota
- **Entonces** con `1,01^12 − 1` (1 % mensual) es 88.848,788678 (la tabla estándar de amortización da $88.848,79); con 0,2 es 91.856,822998; con 1 (100 % E.A.) es 118.926,188719; con 0,0001 es 83.337,847084 (todos con 6 decimales; el último coincide con la búsqueda del saldo en cero)

### Cuota mensual: tasa cero, una cuota y la bandera

#### CA-RF27-09 — Con tasa 0 la cuota es el valor entre las cuotas, con o sin la bandera

- **Dado** una compra con `tasaEAAplicada` 0 y `cuotaUnicaSinInteres` `false`, y la misma con `true`
- **Cuando** se calcula la cuota de $1.200.000 a 12 cuotas, la de $1.254.700 a 12 cuotas y la de $80.000 a 1 cuota
- **Entonces** las cuotas son 100.000, 104.558,333333 (con 6 decimales) y 80.000 en los dos casos (`V / n`, ADR-014); en todos, `cuota · cuotas` es igual al valor (el interés es $0)

#### CA-RF27-10 — Una cuota con la bandera activada no cobra interés

- **Dado** una compra con `cuotaUnicaSinInteres` `true`, `cuotas` 1 y tasa aplicada 0,2921, y otra igual con tasa 1
- **Cuando** se calcula la cuota de $80.000 y la de $1.254.700
- **Entonces** las cuotas son exactamente 80.000 y 1.254.700, sin importar la tasa (CU-14, flujo alternativo 2a); el interés (`cuota · 1 − valor`) es $0

#### CA-RF27-11 — Una cuota sin la bandera sí cobra un mes de interés

- **Dado** una compra con `cuotaUnicaSinInteres` `false`, `cuotas` 1 y tasa aplicada 0,2921
- **Cuando** se calcula la cuota de $80.000 y la de $1.254.700
- **Entonces** las cuotas son $81.726,831931 y $1.281.783,200294 (con 6 decimales; `V · (1 + 0,2921)^(1/12)`), mayores que el valor de la compra (decisión D5; con tasa 0 sería `V / n`, CA-RF27-09)

#### CA-RF27-12 — La bandera no elimina el interés cuando hay más de una cuota

- **Dado** una compra de $1.254.700 a 12 cuotas con tasa aplicada 0,2921 y `cuotaUnicaSinInteres` `true`, y otra de $100.000 a 2 cuotas con la misma tasa y bandera
- **Cuando** se calculan las cuotas
- **Entonces** son 119.802,133172 y 51.624,666866 (con 6 decimales), iguales a las de las mismas compras con la bandera en `false` (el caso de referencia no cambia con la bandera); y mayores que `V / n`

### Cuota mensual: bordes de tamaño y de rango

#### CA-RF27-13 — Los extremos válidos de cuotas y de tasa se calculan

- **Dado** una compra de $1.000.000 con tasa aplicada 0,2921 y sin bandera
- **Cuando** se calcula con 1 cuota, con 60 cuotas y, con tasa 1 y 12 cuotas, y con tasa 0 y 60 cuotas
- **Entonces** los cuatro resultados son números finitos mayores que 0 y valen, con 6 decimales: 1.021.585,399134 (una cuota: `1.000.000 · (1 + 0,2921)^(1/12)`), 29.882,762533 (60 cuotas), 118.926,188719 (tasa 1, 12 cuotas) y 16.666,666667 (tasa 0, `1.000.000 / 60`)

> Nota: el tope de 60 cuotas viene de D7 de 5.2.1 (aprobado el 2026-11-12; sin fuente en los RF ni en los ADR).

#### CA-RF27-14 — Valores muy pequeños y muy grandes

- **Dado** la tasa aplicada 0,2921 y sin bandera
- **Cuando** se calcula la cuota de $0,01 a 3 cuotas, de $1 a 12 cuotas, de $999.999.999 a 60 cuotas y de $999.999.999 a 12 cuotas con tasa 1
- **Entonces** las cuotas son 0,003478 (6 decimales), 0,095483 (6 decimales), 29.882.762,5028 (4 decimales) y 118.926.188,5997 (4 decimales); ninguna es `NaN`, infinita ni negativa, y la cuota crece en proporción al valor (la cuota de $2.509.400 es el doble de la de $1.254.700, con la misma tasa y cuotas)

#### CA-RF27-15 — Una tasa positiva casi cero se comporta como tasa cero

- **Dado** una compra de $1.254.700 a 12 cuotas y, en cada caso, la tasa aplicada 1e-16, 1e-15 y 1e-10
- **Cuando** se calcula la cuota
- **Entonces** el resultado es finito y está a menos de 0,0001 de `V / n` = 104.558,333333 (no es `NaN` ni infinito por la división entre una tasa mensual diminuta; decisión D9)

### Cuota mensual: propiedades que deben cumplirse siempre

#### CA-RF27-16 — Las cuotas amortizan exactamente el valor

- **Dado** las compras de $1.254.700 a 12 cuotas, $1.254.700 a 60 cuotas, $500.000 a 6 cuotas y $1.000.000 a 24 cuotas, todas con tasa aplicada 0,2921
- **Cuando** se calcula la cuota `c` y se simula el saldo (`saldo = saldo · (1 + i) − c`, con `i` la tasa mensual de CA-RF27-01, durante `n` pagos, empezando en el valor de la compra)
- **Entonces** el saldo final es 0 con una diferencia menor que 0,0001 (la cuota fija cubre capital e interés)

#### CA-RF27-17 — La cuota baja al aumentar las cuotas y sube al aumentar la tasa

- **Dado** una compra de $1.254.700 con tasa 0,2921
- **Cuando** se calcula la cuota con 1, 2, 3, 6, 12, 24, 36 y 60 cuotas, y con 12 cuotas y tasas 0, 0,1, 0,2921 y 1
- **Entonces** las cuotas bajan estrictamente al subir el número de cuotas y suben estrictamente al subir la tasa; el total pagado (`cuota · n`) es mayor que el valor siempre que la tasa sea mayor que 0 y `n` mayor que 1 (y crece con `n`), y es igual al valor con tasa 0

#### CA-RF27-18 — El cálculo no cambia ni guarda nada

- **Dado** una compra (objeto) congelada con `Object.freeze`, con los cuatro campos
- **Cuando** se calcula la cuota dos veces
- **Entonces** no lanza error por escritura, ambas llamadas dan exactamente el mismo número y el objeto sigue igual (función pura; la cuota no se guarda, RNF-11)

#### CA-RF27-19 — Usa la tasa copiada en la compra, no otra tasa

- **Dado** una compra con `tasaEAAplicada` 0,2921 que además trae otras propiedades, entre ellas `tasaEA` 0,5 y `cuotaUnicaSinInteres` `false` (como podría llegar una compra con su tarjeta adjunta)
- **Cuando** se calcula la cuota de $1.254.700 a 12 cuotas
- **Entonces** es $119.802,13 (la de 0,2921, no la de 0,5): el cálculo usa solo `valor`, `cuotas`, `tasaEAAplicada` y `cuotaUnicaSinInteres`, de modo que cambiar la tasa de la tarjeta no recalcula compras anteriores (RF-25, ADR-014; la prueba con la tarjeta real llega en 5.2.3)

#### CA-RF27-20 — Sirve para una compra todavía sin guardar y para un avance

- **Dado** un objeto con solo `valor`, `cuotas`, `tasaEAAplicada` y `cuotaUnicaSinInteres` (sin `_id`, `tarjetaId`, fechas ni `tipo`, como en la vista previa de CU-14), y otro objeto con además `tipo` `AVANCE`
- **Cuando** se calcula la cuota de $500.000 a 6 cuotas con tasa 0,2921
- **Entonces** ambos dan 89.741,085062 (con 6 decimales): el avance se calcula igual que una compra (RF-28)

### Cuota mensual: entradas inválidas

Todas lanzan `RangeError` con un mensaje que contiene el nombre del campo (decisión D4) y no devuelven nada.

#### CA-RF27-21 — Valor que no es un número mayor que 0

- **Dado** una compra con los demás campos válidos
- **Cuando** `valor` es 0, −1254700, `NaN`, `Infinity`, `-Infinity`, el texto `"1254700"`, `null` o `undefined`
- **Entonces** lanza `RangeError` con `valor` en el mensaje; en cambio `valor` 0,01 se acepta

#### CA-RF27-22 — Número de cuotas fuera de rango o no entero

- **Dado** una compra con los demás campos válidos
- **Cuando** `cuotas` es 0, −1, 12,5, 61, `NaN`, `Infinity`, el texto `"12"`, `null` o `undefined`
- **Entonces** lanza `RangeError` con `cuotas` en el mensaje; 1 y 60 se aceptan

#### CA-RF27-23 — Tasa aplicada fuera de rango o que no es un número

- **Dado** una compra con los demás campos válidos
- **Cuando** `tasaEAAplicada` es −0,01, 1,0001, 29,21 (un porcentaje donde se espera una fracción), `NaN`, `Infinity`, el texto `"0.2921"`, `null` o `undefined`
- **Entonces** lanza `RangeError` con `tasaEAAplicada` en el mensaje; 0 y 1 se aceptan

#### CA-RF27-24 — La bandera ausente o que no es lógica se rechaza

- **Dado** una compra con los demás campos válidos
- **Cuando** `cuotaUnicaSinInteres` es `undefined` (ausente), `null`, el texto `"true"` o el número 1
- **Entonces** lanza `RangeError` con `cuotaUnicaSinInteres` en el mensaje (no se asume `false`: calcular con interés donde correspondía sin interés sería un error silencioso, decisión D4)

#### CA-RF27-25 — Con varios campos inválidos también falla

- **Dado** una compra con `valor` −1, `cuotas` 0 y `tasaEAAplicada` 29,21
- **Cuando** se calcula la cuota
- **Entonces** lanza `RangeError`; el mensaje puede mencionar cualquiera de los campos inválidos (no se especifica el orden)

### Mes del último pago

#### CA-RF27-26 — El caso de referencia: 12 cuotas terminan once meses después

- **Dado** una compra con `primerPago` 2026-12-01T00:00:00.000Z
- **Cuando** se calcula el mes del último pago con 12 cuotas
- **Entonces** es 2027-11-01T00:00:00.000Z (primer pago + 11 meses, con cruce de año; CU-14)

#### CA-RF27-27 — Una, dos y tres cuotas, con cruce de año

- **Dado** `primerPago` 2026-12-01T00:00:00.000Z
- **Cuando** se calcula con 1, 2 y 3 cuotas
- **Entonces** el mes del último pago es 2026-12-01 (el mismo mes), 2027-01-01 y 2027-02-01, cada uno a las 00:00:00.000 UTC

#### CA-RF27-28 — Sesenta cuotas

- **Dado** `primerPago` 2026-01-01T00:00:00.000Z, y otra compra con 2026-12-01T00:00:00.000Z
- **Cuando** se calcula con 60 cuotas
- **Entonces** el mes del último pago es 2030-12-01T00:00:00.000Z y 2031-11-01T00:00:00.000Z (cinco años menos un mes después del primero)

#### CA-RF27-29 — El día y la hora del primer pago no cambian el mes

- **Dado** `primerPago` sin normalizar: 2026-01-31T23:59:59.000Z, 2026-12-31T23:59:59.999Z, 2028-02-29T12:00:00.000Z y 2027-01-01T00:00:00.000Z
- **Cuando** se calcula con 2, 1, 2 y 1 cuota respectivamente
- **Entonces** los meses del último pago son 2026-02-01, 2026-12-01, 2028-03-01 y 2027-01-01 (cada uno a las 00:00:00.000 UTC): se usa el mes en UTC de la fecha, sin saltos por fin de mes (no hay «31 de enero + 1 mes = 3 de marzo») ni por año bisiesto

#### CA-RF27-30 — Siempre devuelve el día 1 a las 00:00 UTC y no modifica la fecha recibida

- **Dado** un `primerPago` 2026-03-15T10:30:00.000Z, congelado o copiado antes de llamar
- **Cuando** se calcula con 6 cuotas
- **Entonces** el resultado es 2026-08-01T00:00:00.000Z, es un `Date` nuevo (no el mismo objeto) y la fecha recibida conserva exactamente su valor original

#### CA-RF27-31 — La función de meses cumple lo mismo de punta a punta

- **Dado** cualquier `primerPago` normalizado entre enero de 2026 y diciembre de 2027 (por ejemplo, el día 1 de cada uno de esos 24 meses) y cualquier número de cuotas entre 1 y 60
- **Cuando** se calcula el mes del último pago
- **Entonces** la cantidad de meses entre `primerPago` y el resultado es siempre `cuotas − 1` (contando meses del calendario: `años · 12 + mes`)

#### CA-RF27-32 — Cuotas inválidas en el cálculo del mes

- **Dado** un `primerPago` válido
- **Cuando** `cuotas` es 0, −1, 12,5, 61, `NaN`, `Infinity`, el texto `"12"`, `null` o `undefined`
- **Entonces** lanza `RangeError` con `cuotas` en el mensaje (las mismas reglas de CA-RF27-22)

#### CA-RF27-33 — Un primer pago que no es una fecha válida se rechaza

- **Dado** 12 cuotas
- **Cuando** `primerPago` es una fecha inválida (`new Date('no es fecha')`), `null`, `undefined`, el texto `"2026-12-01"` o el número 1796083200000
- **Entonces** lanza `RangeError` con `primerPago` en el mensaje (la función recibe un `Date`, como el que guarda el esquema; decisión D6)

---

## Índice de criterios del paquete 5.2.2

- **RF-27:** CA-RF27-01 a CA-RF27-33. Tasa mensual: 01 a 04; cuota de referencia y precisión: 05 a 08; tasa cero, una cuota y bandera: 09 a 12; bordes de tamaño y rango: 13 a 15; propiedades: 16 a 20; entradas inválidas de la cuota: 21 a 25; mes del último pago: 26 a 33.
- **Total:** 33 criterios.

### Criterios con «Pendiente de decisión»

Ninguno. Las decisiones D1 a D9 de este paquete quedaron aprobadas el 2026-11-12, incluido el tope de 60 cuotas de CA-RF27-13. Las reglas que dependen de ellas son: D1 y D2 (el contrato de nombres de todos los criterios), D3 (CA-RF27-19 y 20), D4 (CA-RF27-04 y 21 a 25, 32, 33), D5 (CA-RF27-11), D6 (CA-RF27-26 a 31), D7 (CA-RF27-09 y 10), D8 (CA-RF27-05 a 08) y D9 (CA-RF27-15).

---

## Paquete 5.2.3 — Implementar CRUD de compras y avances (backend) (RF-26, RF-28; RF-27, RF-25 y RF-33 en lo que toca a compras)

Estado: Aprobado (2026-11-13)

### Alcance

Entran los endpoints para **registrar, listar, consultar, editar y eliminar compras a cuotas con tarjeta** (RF-26, RF-33) y para **registrar, editar y eliminar avances en efectivo** (RF-28), con la **transacción de dinero recibido** que acompaña a cada avance (ADR-014), sobre el esquema `CompraCredito` de 5.2.1 y las funciones de `src/tarjetas/cuota-credito.ts` de 5.2.2. Cada compra y cada avance que devuelve la API trae su **cuota** y su **mes del último pago**, calculados al responder y nunca guardados (RF-27, RNF-11). Entra también la regla de 5.1.2 «una tarjeta con compras no se elimina» (decisión D17) y el campo `transaccionId` de `CompraCredito` (decisión D12). **La vista previa de la cuota antes de guardar (`GET /tarjetas/:tarjetaId/cuota`, CU-14 paso 3) no entra: el desarrollador la dejó para el paquete 5.2.4 (decisión D3).**

**No** entran: la proyección de pagos por mes, el total del mes y el saldo de la tarjeta (RF-30 y RF-31, 5.3.1), el registro del pago de la tarjeta (RF-32, 5.3.2), el cambio de los reportes para que cuenten las compras por su categoría (ADR-014; los reportes de 3.x hoy solo leen transacciones) ni las pantallas (5.2.4). La forma del documento ya está cubierta por CA-RF26-01..31 y CA-RF28-01..05 (5.2.1) y el cálculo por CA-RF27-01..33 (5.2.2): aquí se verifica cómo los usa la API.

### Fuentes

- **RF-26:** registrar una compra indicando «tarjeta, descripción, categoría, valor, número de cuotas y mes del primer pago». **RF-27:** ver la cuota estimada y el mes del último pago. **RF-28:** avance en efectivo «reflejado como dinero recibido y como compra diferida a cuotas». **RF-33:** editar y eliminar «las tarjetas, compras con tarjeta y cargos fijos». **RF-25:** la nueva tasa aplica solo a compras posteriores. Ninguno define rutas, qué se edita, qué pasa al eliminar ni cómo se enlaza el avance con su transacción: lo no definido está en las decisiones D1 a D19.
- **Diccionario de la EDT, 5.2.3:** «Desarrollar los endpoints de compras con tarjeta y avances en efectivo; el avance genera además un ingreso clasificado como dinero recibido». Aceptación: «Un avance aparece como dinero recibido y no como ingreso propio del mes (ADR-014)» (CA-RF28-08). 5.2.4 (frontend) pide además «mostrar la cuota estimada antes de guardar» y «el mes del último pago»: esa vista previa por HTTP se trata en 5.2.4 (D3).
- **Documento de Diseño Técnico:** CU-14 (compra: tarjeta, cuotas, mes del primer pago, cuota y mes del último pago antes de guardar, «el backend guarda la compra con una copia de la tasa vigente»; postcondición: el balance no cambia hasta registrar el pago), CU-15 (avance: valor, cuotas y mes del primer pago; «el backend crea la compra de tipo avance y un ingreso clasificado como dinero recibido»; sus cuotas entran en la proyección), CU-13 flujo 3a (eliminar una tarjeta con compras pendientes: confirmación; ver la contradicción en D17). La secuencia «compra a cuotas» dibuja la vista previa (`GET /tarjetas/:id/cuota`, que queda para 5.2.4, D3) y `POST /compras-credito` para guardar (ver D1).
- **ADR-014 y `CLAUDE.md` (secciones 5 y 6):** una compra con tarjeta **no** es una transacción y no cambia el balance el día de la compra; el avance sí genera una transacción de ingreso `DINERO_RECIBIDO` con `tarjetaId` que no es ingreso propio; la compra copia `tasaEAAplicada` (y, por decisión de 5.2.1, `cuotaUnicaSinInteres`) al registrarse; la cuota se calcula, no se guarda; todo `POST` que crea datos lleva `@Idempotente()` y documenta `Idempotency-Key`; una categoría eliminada reasigna sus movimientos a la de respaldo; el campo del usuario se llama `usuarioId` (RF-04).
- **Convenciones ya aprobadas** (5.1.2 y `coordinacion/contratos/tarjetas.md`): `usuarioId` sale del JWT; recurso inexistente o ajeno → `404` con el mismo mensaje, nunca `403`; id mal formado → `400`; campo no declarado → `400`; `message` de validación es un arreglo con un texto por problema que empieza por el nombre del campo; `null` al editar → `400`; errores en formato Nest `{ statusCode, message, error }`; respuestas sin `usuarioId`, `_id` ni `__v`; `creadaEn` y `actualizadaEn` en ISO UTC; `PATCH` y `DELETE` toleran repetirse.
- **Código ya en `develop`:** `TransaccionesService` responde `409` si se intenta editar o eliminar desde `/transacciones` una transacción que no es `ORDINARIO` («la genera otro módulo»): el avance solo se gestiona desde la tarjeta. `CategoriasService.reasignarAOtros()` solo reasigna transacciones (D18). La categoría de respaldo de egresos es la general con `esRespaldo` `true` y tipo `EGRESO` (en la siembra, «Otros egresos»). `X-Zona-Horaria` (`src/common/zona-horaria.ts`) fija qué día es «hoy» (UTC sin el header). `GET /reportes/periodo` ya devuelve `dineroRecibido` a partir de las transacciones `DINERO_RECIBIDO`.

### Valores de referencia

- **De la hoja del promotor:** $1.254.700 a 12 cuotas con E.A. 29,21 % → cuota $119.802,13 (`119802.1331718775`); con primer pago en 2026-12, el último es 2027-11.
- **Calculados por el tester** con la fórmula de ADR-014 en doble precisión (los mismos de 5.2.2): $1.254.700 a 6 cuotas con 0,2921 → `225196.278855`; $500.000 a 6 con 0,2921 → `89741.085062`; $80.000 a 1 cuota con 0,2921 y sin la bandera → `81726.831931` (con la bandera, `80000`); $1.254.700 a 12 con tasa 0,31 → `120662.170314`; $120.000 a 12 con tasa 0 → `10000`. Las pruebas comparan los de la hoja con 2 decimales (`toBeCloseTo(119802.13, 2)`) y los demás con 4.

### Datos de las pruebas (para no repetirlos en cada criterio)

- **Tarjeta «Visa»** del usuario: `tasaEA` 0,2921, `cuotaUnicaSinInteres` `false`. **Categorías:** «Hogar» (general, `EGRESO`), «Salario» (general, `INGRESO`) y «Otros egresos» (general, `EGRESO`, `esRespaldo` `true`).
- **Compra base:** `{ "descripcion": "Televisor", "categoriaId": <Hogar>, "valor": 1254700, "cuotas": 12, "primerPago": "2026-12", "fecha": "2026-11-10" }`. **Avance base:** `{ "valor": 500000, "cuotas": 6, "primerPago": "2026-12", "fecha": "2026-11-10" }`.

### Contrato de nombres (aprobado)

- `TarjetasModule` registra (o importa) además el modelo `Categoria` (para validar la categoría) y, ya registrados, `CompraCredito`, `Transaccion` (ahora también se escribe en ella) e `Idempotencia`, con el nombre de su clase como token (`getModelToken(<Clase>.name)`), para que las pruebas los reemplacen por colecciones en memoria. `CategoriasModule` registra además `CompraCredito` (D18).
- Servicio `TarjetasService` (el de `CLAUDE.md`, que ya lista `registrarCompra`, `calcularCuota` y `proyectarPagos`); controladores y DTO los nombra el implementador. Las pruebas usan solo la API HTTP, las colecciones en memoria y `src/tarjetas/cuota-credito.ts`, que ya existe.

### Contrato HTTP (aprobado) (lo consumirá el frontend en 5.2.4)

Todas las rutas requieren `Authorization: Bearer <accessToken>`.

| Operación | Ruta | Cuerpo / query | Éxito |
|---|---|---|---|
| Registrar compra | `POST /tarjetas/:tarjetaId/compras` | `{ descripcion, categoriaId, valor, cuotas, primerPago, fecha? }` | `201` + compra |
| Registrar avance | `POST /tarjetas/:tarjetaId/avances` | `{ valor, cuotas, primerPago, fecha?, descripcion? }` | `201` + compra de `tipo` `AVANCE` |
| Listar | `GET /tarjetas/:tarjetaId/compras?tipo=COMPRA\|AVANCE&mes=YYYY-MM` | filtros opcionales | `200` + `{ items: [compra…] }` |
| Consultar | `GET /tarjetas/:tarjetaId/compras/:id` | — | `200` + compra |
| Editar | `PATCH /tarjetas/:tarjetaId/compras/:id` | `{ descripcion?, categoriaId?, valor?, cuotas?, primerPago?, fecha? }`, al menos uno (`categoriaId` solo en compras) | `200` + compra |
| Eliminar | `DELETE /tarjetas/:tarjetaId/compras/:id` | — | `204` sin cuerpo |
| Eliminar tarjeta (cambio) | `DELETE /tarjetas/:id` | — | `409` si tiene compras o avances |

`POST /tarjetas/:tarjetaId/compras` y `POST …/avances` llevan `@Idempotente()`; `GET`, `PATCH` y `DELETE` no. La **compra** (y el avance, que tiene la misma forma) devuelve exactamente estos campos (no trae `usuarioId`, `_id` ni `__v`):

```json
{
  "id": "66a0b3c4d5e6f70012ab34cf",
  "tarjetaId": "66a0b3c4d5e6f70012ab34cd",
  "categoriaId": "665f1c2e9b1d4a0012ab34ce",
  "tipo": "COMPRA",
  "descripcion": "Televisor",
  "valor": 1254700,
  "cuotas": 12,
  "fecha": "2026-11-10",
  "primerPago": "2026-12",
  "mesUltimoPago": "2027-11",
  "tasaEAAplicada": 0.2921,
  "cuotaUnicaSinInteres": false,
  "cuota": 119802.1331718775,
  "creadaEn": "2026-11-10T15:30:00.000Z",
  "actualizadaEn": "2026-11-10T15:30:00.000Z"
}
```

`valor`, `tasaEAAplicada` y `cuota` son números sin redondear (RNF-11); `fecha` es `YYYY-MM-DD` (se guarda a las 00:00 UTC de ese día, como las transacciones); `primerPago` y `mesUltimoPago` son `YYYY-MM` (en la base el primero se guarda como el día 1 a las 00:00 UTC, CA-RF26-22); `cuota` y `mesUltimoPago` se calculan al responder y no existen en la base. Mensajes de error fijos: `404` de tarjeta `Tarjeta no encontrada`; `404` de compra `Compra no encontrada`; `404` de categoría `Categoría no encontrada`; `409` al eliminar una tarjeta con compras `No se puede eliminar una tarjeta que ya tiene compras registradas`.

### Decisiones aprobadas por el desarrollador (2026-11-13)

El desarrollador aprobó la opción recomendada en todas las decisiones, **salvo D3 (la vista previa queda fuera del paquete, para 5.2.4) y D12 (se confirma la opción A)**. Ninguna de estas reglas está definida en un RF ni en un ADR, salvo donde se cita; cada una dice su respaldo y la alternativa descartada. Los criterios de abajo ya las reflejan.

> Decisión D1 — **rutas.** Recomendado: compras **anidadas** bajo su tarjeta, `/tarjetas/:tarjetaId/compras`, igual que los cargos (D1 de 5.1.2): una compra no existe sin su tarjeta, la ruta ya dice a cuál pertenece (no hay `tarjetaId` en el cuerpo que se pueda falsificar o editar) y la comprobación «la tarjeta es mía» queda en un solo lugar. Fuente en contra: la secuencia del Documento de Diseño Técnico dibuja `POST /compras-credito` (plano, con la tarjeta en el cuerpo); es un boceto sin cuerpo definido. Alternativa: `/compras-credito` con `tarjetaId` en el cuerpo (permite listar las compras de todas las tarjetas, que ningún RF pide; obliga a decidir si `tarjetaId` se edita).

> Decisión D2 — **cómo se registra un avance.** Recomendado: **ruta propia de creación**, `POST /tarjetas/:tarjetaId/avances`, y el resto de operaciones (listar, consultar, editar, eliminar) en `/compras`, donde compras y avances conviven y se distinguen por `tipo` (es una sola entidad, 5.2.1). Por qué: el avance no pide categoría ni descripción obligatoria al cliente (D9, D10), crea además una transacción y es una acción distinta en la pantalla (CU-15 «Registrar avance»); con un solo `POST /compras` con `tipo`, el cuerpo cambiaría de forma según el tipo (validación condicional, Swagger confuso). La regla de `CLAUDE.md` de «un solo endpoint con `tipo`» es la de `POST /transacciones` (el cliente fija el tipo con el botón); aquí no se duplican ingreso y egreso, se separan dos acciones con datos distintos. Alternativas: `POST /compras` con `tipo` en el cuerpo, o dos recursos completos (`/compras` y `/avances`, con sus cinco rutas cada uno).

> Decisión D3 — **vista previa de la cuota: fuera de este paquete.** El desarrollador decidió (2026-11-13) tratarla en 5.2.4 (`GET /tarjetas/:tarjetaId/cuota?valor&cuotas&primerPago`, dibujada en la secuencia de compra a cuotas y pedida por CU-14 paso 3). Este paquete no define ni prueba esa ruta, sus DTO ni su documentación Swagger; solo devuelve la `cuota` y el `mesUltimoPago` dentro de cada compra y avance (RF-27).

> Decisión D4 — **datos de entrada y formatos.** Recomendado: compra `{ descripcion, categoriaId, valor, cuotas, primerPago, fecha? }`; avance `{ valor, cuotas, primerPago, fecha?, descripcion? }`. `tarjetaId` sale de la ruta; **el cliente nunca envía** `tipo`, `tasaEAAplicada`, `cuotaUnicaSinInteres` ni `usuarioId` (el servidor los fija o copia de la tarjeta; enviarlos es `400`). `fecha` como `YYYY-MM-DD` (se guarda a las 00:00 UTC, igual que las transacciones: evita desfases de zona); `primerPago` como `YYYY-MM` o una fecha real `YYYY-MM-DD` de la que se toma el mes (el mismo validador y criterio que `periodo` de las metas de ahorro, 4.1.2). Las reglas de cada valor son las del esquema de 5.2.1 (descripción de 1 a 200 con recorte, valor > 0 con decimales, cuotas entero de 1 a 60). Alternativa: aceptar fecha ISO con hora (arrastra el problema de la zona horaria).

> Decisión D5 — **forma de la respuesta.** Recomendado: la del contrato de arriba: campos de la compra con `fecha` como `YYYY-MM-DD`, `primerPago` y `mesUltimoPago` como `YYYY-MM`, además `tasaEAAplicada` y `cuotaUnicaSinInteres` (para que la pantalla explique la cuota) y `cuota` **sin redondear**. El listado y el detalle devuelven la misma forma con la cuota calculada con la tasa de **cada** compra. No incluye el resumen de la categoría (la pantalla ya tiene la lista) ni el id de la transacción del avance (esa transacción se ve en `GET /transacciones`). Fuente: RF-27 y la secuencia (cuota y mes del último pago en la respuesta); lo demás es decisión de forma sin fuente. Alternativa: incluir `categoria` como hace `GET /transacciones`, o devolver la cuota solo en el detalle.

> Decisión D6 — **`fecha` por defecto.** Recomendado: opcional; sin ella es **hoy**, en la zona del header `X-Zona-Horaria` (UTC sin el header; zona inválida → `400`), como el mes actual de los reportes. Fuente: 5.2.1 D8 dejó a este paquete poner «hoy» por defecto; RF-26 no lista la fecha como dato del usuario. Alternativa: obligatoria, como en `POST /transacciones` (el cliente siempre la envía).

> Decisión D7 — **primer pago anterior al mes de la compra.** Recomendado: **se permite** (el mismo mes, el siguiente o uno anterior), sin restricción. Fuente: 5.2.1 D9 dejó la decisión a este paquete; ningún RF la restringe y el usuario puede transcribir una compra ya en curso. Alternativa: exigir que `primerPago` no sea anterior al mes de `fecha` (`400`).

> Decisión D8 — **validación de la categoría de una compra.** Recomendado: la categoría debe existir y ser general o del usuario; si no, `404` con `Categoría no encontrada` (el mismo mensaje para ajena e inexistente, nunca `403`; decisión ya tomada). Si existe y es visible pero es de **ingreso**, `400` con un texto que empieza por `categoriaId` (una compra es un gasto; igual que `POST /transacciones`). Sin fuente para el `400` por tipo. Alternativa: aceptar cualquier categoría visible.

> Decisión D9 — **categoría del avance.** Recomendado: el servidor la fija a la **categoría general de respaldo de egresos** (`esRespaldo` `true`, tipo `EGRESO`; «Otros egresos» en la siembra); el cliente no la envía (`400`) ni la edita. Fuente: 5.2.1 D4 la dejó obligatoria en el esquema y pidió decidir cómo se llena; RF-28 y CU-15 solo piden valor, cuotas y mes del primer pago. Alternativa: `categoriaId` opcional que, si se omite, es la de respaldo.

> Decisión D10 — **descripción del avance.** Recomendado: opcional; sin ella es `Avance en efectivo` (el esquema exige descripción); con ella, mismas reglas que en la compra (recorte, máximo 200, vacía → `400`). Sin fuente. Alternativa: obligatoria.

> Decisión D11 — **la transacción del avance.** Recomendado: una transacción del usuario con `tipo` `INGRESO`, `monto` = `valor` del avance, `fecha` = `fecha` del avance, `metodoPago` `EFECTIVO` (es un avance en efectivo), `clasificacionFlujo` `DINERO_RECIBIDO`, `tarjetaId` = la tarjeta, `deudaId` `null`, `categoriaId` `null` (no es ingreso propio ni cuenta por categoría, como los pagos de tarjeta) y la misma descripción. Fuente: ADR-014, CU-15 y `transaccion.schema.ts` (`categoriaId` opcional, `tarjetaId` para avances). Alternativa: `categoriaId` la de respaldo de ingresos.

> Decisión D12 — **cómo se enlaza el avance con su transacción: opción A aprobada (2026-11-13, ADR-003).** `CompraCredito` gana el campo `transaccionId` (`ObjectId`, referencia a `Transaccion`, opcional y sin valor por defecto): lo llevan los avances y las compras **no** lo tienen. Sin el enlace no se puede editar ni eliminar el avance (su transacción no se gestiona desde `/transacciones`, que responde `409`) y la tarjeta quedaría bloqueada para siempre por D17. El desarrollador autorizó modificar el criterio aprobado CA-RF26-02 de 5.2.1 y su prueba (CA-RF28-25, CA-RF28-26). Como aún no hay usuarios reales no necesita migración (ADR-003 no aplica retroactivamente antes del primer despliegue). Descartadas: (B) usar el mismo `_id` para ambos documentos (acoplamiento implícito) y (C) buscar la transacción por tarjeta, monto, fecha y descripción (falla con dos avances iguales).

> Decisión D13 — **qué se edita.** Recomendado: en una compra, `descripcion`, `categoriaId`, `valor`, `cuotas`, `primerPago` y `fecha`; en un avance, `descripcion`, `valor`, `cuotas`, `primerPago` y `fecha` (su transacción sigue a `descripcion`, `valor` y `fecha`; `categoriaId` en un avance es `400`). **No** se edita `tarjetaId` (para mover una compra se elimina y se crea otra), `tipo`, `tasaEAAplicada` ni `cuotaUnicaSinInteres`: **editar una compra nunca vuelve a copiar la tasa ni la bandera de la tarjeta** (ADR-014; la cuota se recalcula con la tasa de la compra). Sin fuente propia salvo RF-33 (editar compras) y ADR-014. Alternativa: no permitir editar avances (solo eliminar y volver a crear).

> Decisión D14 — **eliminar.** Recomendado: borrado físico, `204`. Eliminar un avance elimina también **su** transacción de dinero recibido (y solo esa). Fuente: RF-33; el borrado de metas y cargos es físico. Alternativa: borrado lógico (estado «anulada»), que obligaría a agregar un campo que ningún RF pide.

> Decisión D15 — **atomicidad entre compra y transacción.** Recomendado: el criterio es observable (CA-RF28-17 y 23): si falla el guardado de cualquiera de las dos partes, **no queda ninguna a medias**, responde `500` (no un éxito parcial) y la misma petición con la misma `Idempotency-Key` se puede reintentar (la clave se libera). El mecanismo lo elige el implementador: una transacción de MongoDB (necesita conjunto de réplicas y no se puede probar con las colecciones en memoria) o compensación (deshacer la primera si falla la segunda; un corte del proceso entre ambos pasos no queda cubierto). Fuente: ninguna. Alternativa: exigir transacción de MongoDB.

> Decisión D16 — **listado.** Recomendado: ordenado por `fecha` descendente y, a igual fecha, por creación descendente (lo más reciente primero); filtros opcionales `tipo` (`COMPRA` o `AVANCE`) y `mes` (`YYYY-MM`, el mes de la **fecha de la compra**, como cuenta en ADR-014); otro parámetro o valor inválido → `400`; sin paginación (como D6 de 5.1.2). Riesgo: una tarjeta acumula compras sin límite (no hay estado «pagada»); si el desarrollador lo prefiere, paginación por cursor como `GET /transacciones`. Sin fuente.

> Decisión D17 — **eliminar una tarjeta con compras.** Recomendado: `409` con `No se puede eliminar una tarjeta que ya tiene compras registradas` (avances incluidos), sin borrar nada (ni cargos ni compras), y con prioridad sobre el mensaje de pagos: un avance tiene una transacción con el `tarjetaId` y la comprobación de pagos de 5.1.2 mostraría «pagos» sin serlo. Es la extensión de D4 de 5.1.2 que ese paquete dejó a este; **ningún criterio de 5.1.2 cambia** (CA-RF33-19 a 22 solo crean pagos). **Contradice CU-13 flujo 3a**, que pide confirmación y borrar con su proyección; el desarrollador ya decidió el `409` (la confirmación del cliente sería antes de eliminar las compras una a una). Alternativa: `DELETE /tarjetas/:id?confirmar=true` que borre en cascada compras, avances y sus transacciones.

> Decisión D18 — **eliminar una categoría usada por compras.** Recomendado: al eliminar una categoría personalizada, sus **compras** (además de sus transacciones) pasan a la categoría general de respaldo de egresos (RF-12, `CLAUDE.md` sección 6); hoy `reasignarAOtros()` solo reasigna transacciones y dejaría compras apuntando a una categoría inexistente. Alternativa: `409` si la categoría tiene compras.

> Decisión D19 — **mensajes y orden de las comprobaciones.** Recomendado: `Tarjeta no encontrada`, `Compra no encontrada` (inexistente, ajena o de otra tarjeta) y `Categoría no encontrada`. Primero se valida el formato de ids y cuerpo (`400`), luego la tarjeta (`404`), luego la categoría (`404`/`400`) y solo entonces se guarda. Sin fuente; es la convención de 5.1.2.

---

### RF-26 — Registrar compras con tarjeta de crédito (API)

#### Registrar (`POST /tarjetas/:tarjetaId/compras`)

#### CA-RF26-32 — Registrar la compra de referencia de la hoja del promotor

- **Dado** la tarjeta «Visa» (E.A. 0,2921, sin la bandera) del usuario y la categoría «Hogar»
- **Cuando** envía `POST /tarjetas/<visa>/compras` con la compra base ($1.254.700, 12 cuotas, primer pago `2026-12`, fecha `2026-11-10`)
- **Entonces** responde `201` con exactamente los campos del contrato: `tipo` `COMPRA`, `tarjetaId` y `categoriaId` como texto, `valor` 1254700, `cuotas` 12, `fecha` `"2026-11-10"`, `primerPago` `"2026-12"`, `mesUltimoPago` `"2027-11"`, `tasaEAAplicada` 0,2921, `cuotaUnicaSinInteres` `false`, `cuota` 119802,13 (`toBeCloseTo(119802.13, 2)`) y las fechas `creadaEn` y `actualizadaEn`, sin `usuarioId`, `_id` ni `__v`; en la base hay un solo documento con el `usuarioId` del usuario, `primerPago` 2026-12-01T00:00:00.000Z, `fecha` 2026-11-10T00:00:00.000Z y **sin** campos `cuota` ni `mesUltimoPago` (se calculan, no se guardan)

#### CA-RF26-33 — Una compra con tarjeta no es una transacción

- **Dado** un usuario sin transacciones
- **Cuando** registra la compra base
- **Entonces** la colección de transacciones sigue vacía (ADR-014: el dinero sale del bolsillo cuando se paga la tarjeta, no al comprar)

#### CA-RF26-34 — La compra copia la tasa y la bandera de la tarjeta

- **Dado** una tarjeta con `tasaEA` 0,31 y `cuotaUnicaSinInteres` `true`
- **Cuando** registra una compra en ella
- **Entonces** la respuesta y el documento guardado traen `tasaEAAplicada` 0,31 y `cuotaUnicaSinInteres` `true` (el cliente no los envía; ver CA-RF26-49)

#### CA-RF26-35 — Sin `fecha`, la compra es de hoy en la zona del cliente

- **Dado** que en el servidor son las 02:00 UTC del 2026-11-11 y una tarjeta del usuario
- **Cuando** registra la compra base sin `fecha`, una vez sin header, otra con `X-Zona-Horaria: America/Bogota` (UTC−5: aún es el día 10) y otra con `X-Zona-Horaria: Zona/Invalida`
- **Entonces** las dos primeras responden `201` con `fecha` `"2026-11-11"` y `"2026-11-10"` y se guardan a las 00:00 UTC de ese día; la tercera responde `400` y no guarda nada


#### CA-RF26-36 — La fecha admite pasado, futuro y fin de mes

- **Dado** una tarjeta del usuario
- **Cuando** registra compras con `fecha` `2020-01-31`, `2026-02-28` y `2030-06-15`
- **Entonces** las tres responden `201`, devuelven y guardan exactamente ese día (a las 00:00 UTC), sin pasarlo al día 1 (la compra cuenta en el mes de su fecha, ADR-014)

#### CA-RF26-37 — El mes del primer pago se acepta como `YYYY-MM` o como fecha y se guarda como el día 1

- **Dado** una tarjeta del usuario
- **Cuando** envía `primerPago` `"2026-12"`, `"2026-12-15"`, `"2026-01-31"` o `"2026-02-28"`
- **Entonces** las cuatro responden `201` con `primerPago` `"2026-12"`, `"2026-12"`, `"2026-01"` y `"2026-02"`, y la base guarda el día 1 de ese mes a las 00:00:00.000 UTC (el día de fin de mes no corre el mes)

#### CA-RF26-38 — El primer pago puede caer antes, en o después del mes de la compra

- **Dado** una compra con `fecha` `2026-11-10`
- **Cuando** `primerPago` es `"2026-10"`, `"2026-11"` o `"2026-12"`
- **Entonces** las tres responden `201` (el usuario puede transcribir una compra ya en curso)


#### CA-RF26-39 — Cuotas en los dos extremos: 1 y 60

- **Dado** una tarjeta «Visa» (0,2921, sin la bandera) y `primerPago` `"2026-12"`
- **Cuando** registra una compra de $1.254.700 a 1 cuota y otra a 60 cuotas
- **Entonces** responden `201`; la primera tiene `mesUltimoPago` `"2026-12"` (el mismo mes) y la segunda `"2031-11"`; ambas tienen `cuota` finita y positiva

#### CA-RF26-40 — El valor admite decimales y se guarda sin redondear

- **Dado** una tarjeta del usuario
- **Cuando** registra compras con `valor` 100,5 y 0,01
- **Entonces** responden `201` y devuelven y guardan exactamente 100,5 y 0,01

#### CA-RF26-41 — La descripción se recorta y admite hasta 200 caracteres

- **Dado** una tarjeta del usuario
- **Cuando** envía `descripcion` `"  Televisor  "` y otra de exactamente 200 caracteres
- **Entonces** ambas responden `201`; la primera devuelve y guarda `"Televisor"`; la segunda conserva sus 200 caracteres

#### CA-RF26-42 — Faltan campos obligatorios

- **Dado** una tarjeta del usuario
- **Cuando** envía la compra base sin `descripcion`, o sin `categoriaId`, o sin `valor`, o sin `cuotas`, o sin `primerPago` (cada caso por separado), o `{}`
- **Entonces** cada una responde `400` con un texto por cada campo faltante que empieza por el nombre del campo, y no se guarda nada (`fecha` no es obligatoria: CA-RF26-35)

#### CA-RF26-43 — Descripción inválida

- **Dado** una tarjeta del usuario
- **Cuando** envía `descripcion` vacía, solo espacios, de 201 caracteres, el número `123`, `true` o `null`
- **Entonces** cada una responde `400` con un texto que empieza por `descripcion`, y no se guarda nada

#### CA-RF26-44 — Valor inválido

- **Dado** una tarjeta del usuario
- **Cuando** envía `valor` 0, −1, `"1000"` (texto numérico), `"abc"` o `null`
- **Entonces** cada una responde `400` con un texto que empieza por `valor`, y no se guarda nada

#### CA-RF26-45 — Cuotas inválidas

- **Dado** una tarjeta del usuario
- **Cuando** envía `cuotas` 0, −1, 12,5, 61, `"12"` o `null`
- **Entonces** cada una responde `400` con un texto que empieza por `cuotas`, y no se guarda nada (el tope de 60 es el aprobado en 5.2.1, D7)

#### CA-RF26-46 — Mes del primer pago inválido

- **Dado** una tarjeta del usuario
- **Cuando** envía `primerPago` `"pronto"`, `"2026-13"`, `"2026-02-30"`, `"2026-12-01T00:00:00.000Z"` (con hora), el número `202612` o `null`
- **Entonces** cada una responde `400` con un texto que empieza por `primerPago`, y no se guarda nada

#### CA-RF26-47 — Fecha de la compra inválida

- **Dado** una tarjeta del usuario
- **Cuando** envía `fecha` `"ayer"`, `"10/11/2026"`, `"2026-02-30"`, `"2026-11-10T15:00:00.000Z"` (con hora) o `null`
- **Entonces** cada una responde `400` con un texto que empieza por `fecha`, y no se guarda nada

#### CA-RF26-48 — `categoriaId` con formato inválido

- **Dado** una tarjeta del usuario
- **Cuando** envía `categoriaId` `"no-es-un-id"` o el número `5`
- **Entonces** responde `400` con un texto que empieza por `categoriaId` (distinto del `404` de una categoría válida que no existe, CA-RF26-51)

#### CA-RF26-49 — Campos no declarados se rechazan

- **Dado** una tarjeta del usuario
- **Cuando** el cuerpo incluye además `usuarioId`, `id`, `tarjetaId`, `tipo` (también `"AVANCE"`), `tasaEAAplicada`, `cuotaUnicaSinInteres`, `cuota`, `mesUltimoPago`, `createdAt` o cualquier otro campo
- **Entonces** responde `400` con un texto por el campo sobrante y no se guarda nada (la compra es del usuario del JWT y de la tarjeta de la ruta, y la tasa y la bandera las copia el servidor)

#### CA-RF26-50 — La tarjeta de la ruta: mal formada 400; inexistente o de otro usuario 404

- **Dado** una tarjeta «Visa» del usuario B y un id válido que no existe
- **Cuando** el usuario A registra una compra válida en cada una, y en la ruta `/tarjetas/no-es-un-id/compras`
- **Entonces** las dos primeras responden `404` con `Tarjeta no encontrada` (el mismo mensaje, nunca `403`) y la tercera `400` con un texto que empieza por `tarjetaId`; no se guarda ninguna compra

#### CA-RF26-51 — Categoría inexistente o de otro usuario: 404

- **Dado** una categoría personalizada del usuario B y un id de categoría válido que no existe
- **Cuando** el usuario A registra la compra base con cada una
- **Entonces** ambas responden `404` con `Categoría no encontrada` (el mismo mensaje, nunca `403`) y no se guarda nada

#### CA-RF26-52 — La categoría puede ser general o propia

- **Dado** la categoría general «Hogar» y una categoría personalizada de egresos «Mascotas» del usuario
- **Cuando** registra una compra con cada una
- **Entonces** ambas responden `201` con ese `categoriaId`

#### CA-RF26-53 — Una categoría de ingreso no sirve para una compra

- **Dado** la categoría general de ingresos «Salario»
- **Cuando** registra la compra base con ese `categoriaId`
- **Entonces** responde `400` con un texto que empieza por `categoriaId` y no se guarda nada (igual que `POST /transacciones`)


#### CA-RF26-54 — Repetir la petición con la misma clave de idempotencia no duplica la compra

- **Dado** un usuario que registra la compra base con header `Idempotency-Key` y obtiene `201`
- **Cuando** repite la misma petición con la misma clave
- **Entonces** recibe la misma respuesta (mismo `id`) con `Idempotent-Replayed: true`, hay una sola compra en la base y no hay `409`

#### CA-RF26-55 — La misma clave con otra petición se rechaza

- **Dado** una clave ya usada con la compra base
- **Cuando** se envía con la misma clave la compra con `valor` 1000000
- **Entonces** responde `422` y la compra original no cambia

#### CA-RF26-56 — Dos compras iguales con claves distintas son legítimas

- **Dado** un usuario con la compra base ya registrada
- **Cuando** envía la misma compra con otra `Idempotency-Key` (o sin ninguna)
- **Entonces** responde `201` con otro `id` y hay dos compras (no se deduplica por contenido)

#### CA-RF26-57 — Todas las rutas exigen sesión

- **Dado** una petición sin header `Authorization`, o con un token inválido o vencido
- **Cuando** llama a cada una de las seis rutas nuevas del contrato (`POST …/compras`, `POST …/avances`, `GET …/compras`, `GET …/compras/:id`, `PATCH …/compras/:id`, `DELETE …/compras/:id`) con ids válidos
- **Entonces** todas responden `401` y no se guarda ni se cambia nada

#### Listar (`GET /tarjetas/:tarjetaId/compras`)

#### CA-RF26-58 — Lista solo las compras de esa tarjeta y del usuario, la más reciente primero

- **Dado** el usuario A con tres compras en «Visa» (fechas `2026-11-10`, `2026-11-25` y otra `2026-11-10` creada después), una compra en «Mastercard» y compras del usuario B en una tarjeta suya
- **Cuando** A envía `GET /tarjetas/<visa>/compras`
- **Entonces** responde `200` con `{ "items": [...] }` de exactamente las tres compras de «Visa», en el orden `2026-11-25`, la `2026-11-10` creada después y la `2026-11-10` creada antes; cada elemento tiene la forma del contrato (sin `usuarioId`); y una tarjeta sin compras responde `{ "items": [] }`, no `404`


#### CA-RF26-59 — El listado incluye compras y avances, y se puede filtrar por tipo

- **Dado** una compra y un avance en «Visa»
- **Cuando** envía el listado sin filtro, con `tipo=COMPRA` y con `tipo=AVANCE`
- **Entonces** devuelve las dos, solo la compra y solo el avance, cada una con su `tipo`

#### CA-RF26-60 — El filtro `mes` usa el mes de la fecha de la compra, con bordes de mes

- **Dado** compras en «Visa» con `fecha` `2026-10-31`, `2026-11-01`, `2026-11-30`, `2026-12-01` y `2028-02-29`
- **Cuando** envía `mes=2026-11` y, aparte, `mes=2028-02`
- **Entonces** la primera devuelve solo las del `2026-11-01` y `2026-11-30` y la segunda solo la del `2028-02-29` (el `primerPago` no cuenta para el filtro)


#### CA-RF26-61 — Parámetros inválidos en el listado

- **Dado** una tarjeta del usuario
- **Cuando** envía `tipo=PRESTAMO`, `tipo=avance`, `mes=2026-13`, `mes=2026-11-01` o un parámetro desconocido (`?foo=1`)
- **Entonces** cada una responde `400` con un texto que empieza por el parámetro inválido

#### CA-RF26-62 — Listar las compras de una tarjeta ajena o inexistente: 404

- **Dado** una tarjeta del usuario B con compras y un id válido inexistente
- **Cuando** el usuario A lista las compras de cada una
- **Entonces** ambas responden `404` con `Tarjeta no encontrada`

#### Consultar (`GET /tarjetas/:tarjetaId/compras/:id`)

#### CA-RF26-63 — Consultar una compra propia

- **Dado** la compra base registrada en «Visa»
- **Cuando** envía `GET /tarjetas/<visa>/compras/<id>`
- **Entonces** responde `200` con la misma compra que devolvió el `POST` (incluidos `cuota` y `mesUltimoPago`)

#### CA-RF26-64 — Compra inexistente, ajena o en otra tarjeta: 404; id mal formado: 400

- **Dado** una compra del usuario B, una compra propia de «Mastercard» pedida bajo la ruta de «Visa», un id válido inexistente y `no-es-un-id`
- **Cuando** el usuario A las consulta bajo la ruta de «Visa»
- **Entonces** las tres primeras responden `404` con `Compra no encontrada` (el mismo mensaje) y la cuarta `400` con un texto que empieza por `id`

#### CA-RF26-65 — Eliminar una categoría usada por compras las reasigna a la de respaldo

- **Dado** una categoría personalizada de egresos «Mascotas» del usuario con una compra, y la general de respaldo de egresos
- **Cuando** elimina «Mascotas» con `DELETE /categorias/<id>`
- **Entonces** responde `204` y la compra sigue existiendo con `categoriaId` igual al de la categoría de respaldo (ninguna compra queda apuntando a una categoría inexistente)


---

### RF-27 — Cuota y mes del último pago en la API de compras

#### CA-RF27-34 — La compra devuelve su cuota con precisión completa

- **Dado** la compra de referencia registrada (tarjeta 0,2921, sin la bandera)
- **Cuando** se consulta con `GET …/compras/<id>`
- **Entonces** `cuota` está dentro de `119802.1331718775` con 6 decimales y **no** es el valor redondeado (`119802.13` ni `119802`): el backend calcula con precisión completa y redondea solo quien presenta (RNF-11)

#### CA-RF27-35 — Una cuota sin interés solo con la bandera de la tarjeta copiada

- **Dado** una tarjeta «Débito» con `cuotaUnicaSinInteres` `true` y otra «Visa» con `false`, ambas con tasa 0,2921
- **Cuando** registra en cada una una compra de $80.000 a 1 cuota, y en «Débito» una de $80.000 a 2 cuotas
- **Entonces** `cuota` es `80000` en «Débito» a 1 cuota, `81726.8319` (4 decimales) en «Visa» a 1 cuota, y en «Débito» a 2 cuotas la cuota con interés (mayor que 40.000: la bandera solo exime la cuota única)

#### CA-RF27-36 — Tasa cero: el valor entre las cuotas

- **Dado** una tarjeta con `tasaEA` 0
- **Cuando** registra una compra de $120.000 a 12 cuotas
- **Entonces** `cuota` es exactamente `10000` y `tasaEAAplicada` es `0`

#### CA-RF27-37 — El mes del último pago cruza años y es el mismo mes con una cuota

- **Dado** una tarjeta del usuario
- **Cuando** registra compras con `primerPago` `"2026-12"` a 12 cuotas, `"2026-11"` a 24 cuotas y `"2026-01-31"` a 1 cuota
- **Entonces** `mesUltimoPago` es `"2027-11"`, `"2028-10"` y `"2026-01"`

#### CA-RF27-38 — Cada compra del listado trae su cuota con su propia tasa

- **Dado** «Visa» con la compra de referencia a 0,2921 y, tras subir la tasa de la tarjeta a 0,31, otra compra igual ($1.254.700 a 12 cuotas)
- **Cuando** lista las compras
- **Entonces** la primera trae `cuota` 119802,13 y `tasaEAAplicada` 0,2921 y la segunda 120662,1703 (4 decimales) y 0,31

---

### RF-25 — El cambio de tasa no recalcula las compras anteriores (con compras reales)

#### CA-RF25-07 — Cambiar la tasa de la tarjeta no altera la cuota de las compras anteriores

- **Dado** la compra de referencia registrada con la tasa 0,2921 (cuota 119.802,13)
- **Cuando** el usuario cambia la tasa de «Visa» a 0,31 con `PATCH /tarjetas/<visa>` y registra otra compra igual
- **Entonces** al consultar la primera sigue con `tasaEAAplicada` 0,2921 y `cuota` 119802,13; la segunda trae 0,31 y 120662,17; y en la base la primera conserva 0,2921

#### CA-RF25-08 — Cambiar la bandera de la tarjeta tampoco recalcula las compras anteriores

- **Dado** «Visa» con `cuotaUnicaSinInteres` `true` y una compra de $80.000 a 1 cuota (cuota 80.000)
- **Cuando** el usuario pone la bandera en `false` y registra otra compra de $80.000 a 1 cuota
- **Entonces** la primera conserva `cuotaUnicaSinInteres` `true` y `cuota` 80000; la segunda trae `false` y `81726.8319`

#### CA-RF25-09 — Editar una compra no vuelve a copiar la tasa de la tarjeta

- **Dado** la compra de referencia (0,2921) y la tarjeta cuya tasa ya se cambió a 0,31
- **Cuando** edita la compra con `PATCH` y `{ "cuotas": 6 }`
- **Entonces** `tasaEAAplicada` sigue en 0,2921 y `cuota` es la de 6 cuotas con esa tasa: 225196,2789 (4 decimales)

---

### RF-33 — Editar y eliminar compras (API)

#### Editar (`PATCH /tarjetas/:tarjetaId/compras/:id`)

#### CA-RF33-27 — Cambiar la descripción de una compra

- **Dado** la compra base registrada
- **Cuando** envía `PATCH` con `{ "descripcion": "  Televisor 55 pulgadas  " }`
- **Entonces** responde `200` con `descripcion` `"Televisor 55 pulgadas"`, el resto igual y `actualizadaEn` no anterior a la de antes; la base refleja el cambio

#### CA-RF33-28 — Cambiar varios campos recalcula la cuota y el mes del último pago

- **Dado** la compra base y la categoría personalizada «Mascotas» del usuario
- **Cuando** envía `{ "valor": 500000, "cuotas": 6, "primerPago": "2027-01-20", "fecha": "2026-11-28", "categoriaId": <Mascotas>, "descripcion": "Cama" }`
- **Entonces** responde `200` con esos valores, `primerPago` `"2027-01"`, `mesUltimoPago` `"2027-06"` y `cuota` 89741,0851 (4 decimales: $500.000 a 6 cuotas con 0,2921); la base guarda `primerPago` 2027-01-01T00:00:00.000Z; `tasaEAAplicada`, `cuotaUnicaSinInteres`, `tipo` y `tarjetaId` no cambian

#### CA-RF33-29 — Cuerpo vacío o con `null`

- **Dado** la compra base
- **Cuando** envía `{}`, o `{ "descripcion": null }`, `{ "valor": null }`, `{ "cuotas": null }`, `{ "primerPago": null }`, `{ "fecha": null }` o `{ "categoriaId": null }`
- **Entonces** cada una responde `400` y la compra no cambia (al menos un campo, y a una compra no se le quita un dato)

#### CA-RF33-30 — Valores inválidos al editar

- **Dado** la compra base
- **Cuando** envía `valor` 0, `cuotas` 61, `cuotas` 12,5, `descripcion` de 201 caracteres o solo espacios, `primerPago` `"pronto"`, `fecha` `"2026-02-30"` o `categoriaId` `"no-es-un-id"`
- **Entonces** cada una responde `400` con un texto que empieza por el campo inválido y la compra no cambia

#### CA-RF33-31 — Campos que no se editan se rechazan

- **Dado** la compra base
- **Cuando** envía `tarjetaId` (también el de otra tarjeta propia), `tipo` (también `"AVANCE"`), `tasaEAAplicada`, `cuotaUnicaSinInteres`, `usuarioId`, `id`, `cuota`, `mesUltimoPago`, `creadaEn` o cualquier otro campo
- **Entonces** cada una responde `400` con un texto por el campo y la compra no cambia (para mover una compra de tarjeta se elimina y se crea otra)

#### CA-RF33-32 — La categoría al editar: 404, 400 o válida

- **Dado** la compra base, una categoría personalizada del usuario B, un id de categoría inexistente, la categoría de ingresos «Salario» y la categoría general «Alimentación» de egresos
- **Cuando** edita `categoriaId` con cada una
- **Entonces** las dos primeras responden `404` con `Categoría no encontrada`, «Salario» responde `400` con un texto que empieza por `categoriaId`, y «Alimentación» responde `200`; la compra solo cambia en el último caso


#### CA-RF33-33 — Editar una compra ajena, de otra tarjeta o inexistente: 404

- **Dado** una compra del usuario B, una compra propia de «Mastercard» enviada bajo la ruta de «Visa», un id válido inexistente y una tarjeta de la ruta ajena
- **Cuando** el usuario A les envía un `PATCH` válido
- **Entonces** las tres primeras responden `404` con `Compra no encontrada`, la cuarta con `Tarjeta no encontrada`, y ninguna compra cambia; un id mal formado en la ruta responde `400`

#### CA-RF33-34 — Repetir la misma edición es inofensivo

- **Dado** la compra base
- **Cuando** envía dos veces `{ "valor": 900000 }`
- **Entonces** ambas responden `200` con el mismo resultado y solo hay una compra

#### Eliminar (`DELETE /tarjetas/:tarjetaId/compras/:id`)

#### CA-RF33-35 — Eliminar una compra

- **Dado** dos compras en «Visa», una transacción ordinaria del usuario y una compra en «Mastercard»
- **Cuando** elimina la primera con `DELETE`
- **Entonces** responde `204` sin cuerpo; su `GET` responde `404`; la otra compra, la de «Mastercard» y la transacción ordinaria siguen intactas (el borrado es físico y definitivo)

#### CA-RF33-36 — Eliminar de nuevo, o una compra ajena, de otra tarjeta o inexistente: 404

- **Dado** una compra ya eliminada, una compra del usuario B, una compra de «Mastercard» bajo la ruta de «Visa» y un id inexistente
- **Cuando** el usuario A les envía `DELETE` bajo la ruta de «Visa»
- **Entonces** todas responden `404` con `Compra no encontrada` y nada se elimina; con un id mal formado, `400`

#### Eliminar una tarjeta que tiene compras (`DELETE /tarjetas/:id`)

#### CA-RF33-37 — No se elimina una tarjeta con compras

- **Dado** «Visa» con un cargo fijo y una compra
- **Cuando** el usuario envía `DELETE /tarjetas/<visa>`
- **Entonces** responde `409` con `No se puede eliminar una tarjeta que ya tiene compras registradas`; la tarjeta, su cargo y su compra siguen existiendo intactos


#### CA-RF33-38 — Una tarjeta con solo un avance también da el 409 de compras

- **Dado** «Visa» con un avance (que tiene su transacción de dinero recibido con el `tarjetaId` de la tarjeta) y sin pagos, y otra tarjeta con un pago y una compra
- **Cuando** el usuario envía `DELETE` a cada una
- **Entonces** ambas responden `409` con el mensaje de **compras** (no el de pagos, aunque haya transacciones con su `tarjetaId`) y no se borra nada

#### CA-RF33-39 — Las compras de otra tarjeta no bloquean; sin las compras, la tarjeta se elimina

- **Dado** «Visa» sin compras, y «Mastercard» con un cargo fijo y una compra
- **Cuando** el usuario elimina «Visa» y, después de eliminar la compra de «Mastercard», elimina también «Mastercard»
- **Entonces** ambas responden `204`, y el cargo de «Mastercard» se borra en cascada

#### CA-RF33-40 — Eliminar la tarjeta ajena con compras: 404, nunca 409

- **Dado** una tarjeta del usuario B con compras
- **Cuando** el usuario A envía `DELETE /tarjetas/<id>`
- **Entonces** responde `404` con `Tarjeta no encontrada` (un `409` revelaría que existe) y la tarjeta y sus compras siguen existiendo

---

### RF-28 — Registrar avances en efectivo (API)

#### Registrar (`POST /tarjetas/:tarjetaId/avances`)

#### CA-RF28-06 — Registrar un avance

- **Dado** la tarjeta «Visa» (0,2921, sin la bandera) del usuario y la categoría de respaldo de egresos
- **Cuando** envía `POST /tarjetas/<visa>/avances` con el avance base ($500.000 a 6 cuotas, primer pago `2026-12`, fecha `2026-11-10`)
- **Entonces** responde `201` con la forma de la compra: `tipo` `AVANCE`, `descripcion` `"Avance en efectivo"`, `categoriaId` el de la categoría de respaldo de egresos, `valor` 500000, `cuotas` 6, `fecha` `"2026-11-10"`, `primerPago` `"2026-12"`, `mesUltimoPago` `"2027-05"`, `tasaEAAplicada` 0,2921, `cuotaUnicaSinInteres` `false` y `cuota` 89741,0851 (4 decimales); en la base hay un documento `AVANCE` del usuario

#### CA-RF28-07 — El avance crea su transacción de dinero recibido

- **Dado** un usuario sin transacciones
- **Cuando** registra el avance base
- **Entonces** hay exactamente una transacción, del usuario, con `tipo` `INGRESO`, `monto` 500000, `fecha` 2026-11-10T00:00:00.000Z, `metodoPago` `EFECTIVO`, `clasificacionFlujo` `DINERO_RECIBIDO`, `tarjetaId` el de «Visa», `deudaId` `null`, `categoriaId` `null` y la misma descripción que el avance


#### CA-RF28-08 — Un avance aparece como dinero recibido y no como ingreso propio (criterio de la EDT)

- **Dado** un usuario sin movimientos y con el avance base registrado en noviembre de 2026
- **Cuando** consulta `GET /reportes/periodo?mes=2026-11`
- **Entonces** `dineroRecibido` es 500000, `ingresos` es 0 y `balance` es 0 (ADR-014: el avance no es ingreso propio y no suma al balance)

#### CA-RF28-09 — La descripción del avance

- **Dado** una tarjeta del usuario
- **Cuando** registra avances con `descripcion` `"  Para el arriendo  "`, uno de 200 caracteres, y otros con `descripcion` vacía, solo espacios, de 201 caracteres, `123` o `null`
- **Entonces** los dos primeros responden `201` (el primero con `"Para el arriendo"` en el avance y en su transacción) y los demás `400` con un texto que empieza por `descripcion`, sin guardar compra ni transacción


#### CA-RF28-10 — La categoría del avance la pone el servidor

- **Dado** la categoría general de respaldo de egresos y otras categorías (propia, general, ajena y de ingreso)
- **Cuando** registra un avance sin `categoriaId`, y otros enviando `categoriaId` con cada una de esas categorías
- **Entonces** el primero responde `201` con `categoriaId` de la categoría de respaldo; los demás responden `400` con un texto que empieza por `categoriaId` y no guardan nada


#### CA-RF28-11 — Sin `fecha`, el avance y su transacción son de hoy

- **Dado** que en el servidor son las 02:00 UTC del 2026-11-11
- **Cuando** registra el avance base sin `fecha`, una vez sin header y otra con `X-Zona-Horaria: America/Bogota`
- **Entonces** el primero guarda `fecha` `2026-11-11` y el segundo `2026-11-10`, y la transacción de cada uno lleva la misma fecha que su avance

#### CA-RF28-12 — Faltan datos o son inválidos: no se guarda ni el avance ni la transacción

- **Dado** una tarjeta del usuario
- **Cuando** envía el avance base sin `valor`, sin `cuotas` o sin `primerPago`, o con `valor` 0, `cuotas` 0, 61 o 12,5, `primerPago` `"pronto"` o `fecha` `"ayer"`
- **Entonces** cada una responde `400` con un texto que empieza por el campo y no queda ningún avance ni ninguna transacción

#### CA-RF28-13 — Campos no declarados se rechazan

- **Dado** una tarjeta del usuario
- **Cuando** el cuerpo incluye además `tipo`, `tarjetaId`, `usuarioId`, `tasaEAAplicada`, `cuotaUnicaSinInteres`, `metodoPago`, `clasificacionFlujo` o cualquier otro campo
- **Entonces** responde `400` con un texto por el campo sobrante y no se guarda nada

#### CA-RF28-14 — El avance en una tarjeta ajena o inexistente: 404 y nada se guarda

- **Dado** una tarjeta del usuario B y un id válido inexistente
- **Cuando** el usuario A registra el avance base en cada una
- **Entonces** ambas responden `404` con `Tarjeta no encontrada` y no queda ningún avance ni ninguna transacción

#### CA-RF28-15 — Repetir con la misma clave de idempotencia no duplica el avance ni la transacción

- **Dado** un avance registrado con `Idempotency-Key` (`201`)
- **Cuando** repite la misma petición con la misma clave
- **Entonces** recibe la misma respuesta con `Idempotent-Replayed: true` y hay un solo avance y **una sola** transacción de dinero recibido; la misma clave con otro cuerpo responde `422` y no cambia nada

#### CA-RF28-16 — Dos avances iguales con claves distintas son legítimos

- **Dado** un avance registrado
- **Cuando** envía el mismo avance con otra clave
- **Entonces** responde `201`, hay dos avances y dos transacciones, cada una enlazada a su avance (eliminar uno no borra la del otro: CA-RF28-22)

#### CA-RF28-17 — Si falla una de las dos partes, no queda ninguna a medias

- **Dado** un entorno en el que el guardado de la transacción falla (y, aparte, uno en el que falla el guardado del avance)
- **Cuando** registra el avance base
- **Entonces** responde `500` y no queda ninguna compra ni ninguna transacción; al repetir la petición con la misma `Idempotency-Key` cuando el fallo desaparece, se registra una sola vez (la clave se liberó)


#### CA-RF28-18 — El avance se gestiona desde la tarjeta, no desde `/transacciones`

- **Dado** un avance registrado
- **Cuando** el usuario lista `GET /transacciones`, y envía `PATCH` y `DELETE` a `/transacciones/<id de su transacción>`
- **Entonces** el listado trae la transacción con `clasificacionFlujo` `DINERO_RECIBIDO`; el `PATCH` y el `DELETE` responden `409` y ni la transacción ni el avance cambian; el avance aparece en `GET /tarjetas/<visa>/compras` con `tipo` `AVANCE`

#### CA-RF28-19 — Una sola cuota sin interés también aplica al avance

- **Dado** una tarjeta con `cuotaUnicaSinInteres` `true` (0,2921)
- **Cuando** registra un avance de $500.000 a 1 cuota y otro a 2 cuotas
- **Entonces** el primero tiene `cuota` 500000 y el segundo una cuota mayor que 250.000 (con interés)

#### Editar y eliminar un avance (`/tarjetas/:tarjetaId/compras/:id`)

#### CA-RF28-20 — Editar el avance actualiza su transacción de dinero recibido

- **Dado** el avance base registrado, con su transacción, y otro avance con su transacción
- **Cuando** edita el primero con `{ "valor": 600000, "fecha": "2026-11-20", "descripcion": "Avance del 20" }`
- **Entonces** responde `200` con esos valores y la cuota nueva de $600.000 a 6 cuotas; su transacción pasa a `monto` 600000, `fecha` 2026-11-20T00:00:00.000Z y la nueva descripción, sigue siendo `DINERO_RECIBIDO` con el mismo `tarjetaId`; sigue habiendo una transacción por avance y la del otro avance no cambia


#### CA-RF28-21 — Editar solo las cuotas o el mes del primer pago no toca la transacción; `categoriaId` no se edita en un avance

- **Dado** el avance base con su transacción
- **Cuando** edita `{ "cuotas": 12, "primerPago": "2027-02" }` y luego `{ "categoriaId": <Hogar> }`
- **Entonces** el primero responde `200` con `cuota` y `mesUltimoPago` (`"2028-01"`) nuevos y la transacción queda exactamente igual; el segundo responde `400` con un texto que empieza por `categoriaId` y nada cambia

#### CA-RF28-22 — Eliminar el avance elimina su transacción, y solo la suya

- **Dado** dos avances idénticos (mismo valor, fecha y descripción) en «Visa», cada uno con su transacción, y una transacción ordinaria y un pago de tarjeta del usuario
- **Cuando** elimina uno con `DELETE`
- **Entonces** responde `204`; queda un avance y una transacción de dinero recibido (la del otro avance), y la ordinaria y el pago siguen intactos; si elimina también el otro, `GET /reportes/periodo?mes=2026-11` vuelve a `dineroRecibido` 0


#### CA-RF28-23 — Editar o eliminar un avance no deja nada a medias

- **Dado** un avance con su transacción, y un entorno en que falla el guardado de uno de los dos cambios
- **Cuando** edita `valor` o elimina el avance
- **Entonces** responde `500` y el avance y su transacción quedan exactamente como estaban

#### CA-RF28-24 — Al eliminar la cuenta no queda ningún avance, compra ni transacción del usuario

- **Dado** un usuario con una compra y un avance (con su transacción) registrados por la API, y otro usuario con los suyos
- **Cuando** el primero elimina su cuenta (`DELETE /usuarios/me`, RF-04)
- **Entonces** no queda ninguna compra, avance ni transacción con su `usuarioId` y los del otro usuario siguen intactos (no se agrega ningún campo de usuario con otro nombre)

#### CA-RF28-25 — El esquema guarda el enlace del avance con su transacción (modifica CA-RF26-02 de 5.2.1)

- **Dado** el esquema `CompraCredito`
- **Cuando** se inspecciona el campo `transaccionId` y se crea una compra sin él, con un id válido y con el texto `no-es-un-id`
- **Entonces** es de tipo `ObjectId` con referencia a `Transaccion` (ADR-001), opcional y **sin valor por defecto**; sin él y con un id válido la validación no reporta errores (y sin él el documento no tiene el campo); con `no-es-un-id` falla con error solo en `transaccionId`; la lista de campos de CA-RF26-02 pasa a incluir `transaccionId`

#### CA-RF28-26 — El avance guarda el id de su transacción y la compra no tiene ese campo

- **Dado** un usuario con una compra y un avance registrados por la API
- **Cuando** se leen los documentos guardados
- **Entonces** el del avance tiene `transaccionId` igual al `_id` de su transacción de dinero recibido (la única `DINERO_RECIBIDO` de ese avance) y el de la compra no tiene `transaccionId`

---

### Documentación Swagger

`src/common/swagger.spec.ts` descubre todos los controladores y fallará si alguna de las seis rutas del paquete o de sus DTO (de entrada, de salida y de query) no tiene etiqueta, resumen, descripción detallada, respuestas de error (400, 401, 404, 409, 422 y 500 según apliquen) y `description` + `example` en cada propiedad; además, cada `POST` que responde `201` (compras y avances) debe documentar el header `Idempotency-Key`. No es una prueba de este paquete, pero su cumplimiento forma parte de darlo por terminado. Además deben verse en `/api/docs`: la descripción general de la etiqueta `tarjetas` en `src/common/swagger.ts` (que hoy dice que «la cuota, la proyección y el total del mes llegan con las compras») actualizada con las reglas de compras y avances: la compra copia la tasa y la bandera de la tarjeta y editar la tarjeta no la recalcula; `cuota` y `mesUltimoPago` se calculan al responder y no se guardan; la compra no es una transacción y el avance sí (`DINERO_RECIBIDO`, no es ingreso propio); y que la tarjeta con compras responde `409` al eliminarla (la descripción del `DELETE /tarjetas/:id`, que hoy dice «cuando existan las compras…», debe corregirse). Los criterios CA-RF26-32..65, CA-RF27-34..38, CA-RF25-07..09, CA-RF33-27..40 y CA-RF28-06..24 y CA-RF28-26 fijan los códigos de error que deben documentarse.

---

## Índice de criterios del paquete 5.2.3

- **RF-26:** CA-RF26-32 a CA-RF26-65. Registrar: 32 a 57 (forma y flujo de caja: 32 a 34; fecha y primer pago: 35 a 39; valor y descripción: 40 y 41; datos faltantes e inválidos: 42 a 49; tarjeta y categoría: 50 a 53; idempotencia: 54 a 56; sesión: 57); listar: 58 a 62; consultar: 63 y 64; categoría eliminada: 65.
- **RF-27:** CA-RF27-34 a CA-RF27-38 (cuota y mes del último pago en las respuestas). La vista previa (antes CA-RF27-39 a 42) salió del paquete (D3).
- **RF-25:** CA-RF25-07 a CA-RF25-09.
- **RF-33:** CA-RF33-27 a CA-RF33-40. Editar compras: 27 a 34; eliminar compras y tarjetas con compras: 35 a 40.
- **RF-28:** CA-RF28-06 a CA-RF28-26. Registrar: 06 a 19; editar y eliminar: 20 a 23; cuenta: 24; esquema y enlace: 25 y 26.
- **Total:** 34 + 5 + 3 + 14 + 21 = 77 criterios.
- **Modifica 5.2.1:** CA-RF26-02 (la lista de campos incluye `transaccionId`), el contrato de nombres de 5.2.1 y su decisión 14, y la prueba `src/tarjetas/compra-credito.schema.spec.ts`.

### Criterios con «Pendiente de decisión»

Ninguno. El desarrollador aprobó el 2026-11-13 las decisiones D1 a D19 (con D3 fuera del paquete y D12 opción A) y, con ellas, todos los criterios de esta sección.
