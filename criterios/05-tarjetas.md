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

---

## Paquete 5.2.6 (código provisional) — Vista previa de la cuota de una compra o avance antes de guardar (backend) (RF-27)

Estado: Aprobado (2026-11-19)

### Alcance

Entra **un solo endpoint de lectura**, `GET /tarjetas/:tarjetaId/cuota?valor&cuotas&primerPago`, que responde la **cuota estimada** y el **mes del último pago** de una compra (o avance) que el usuario todavía no guardó, calculados con la **tasa y la bandera `cuotaUnicaSinInteres` actuales** de la tarjeta (que son las que `POST …/compras` y `POST …/avances` copiarán al guardar). Lo pide el frontend para su paquete 5.2.4 (resumen previo a guardar: «la cuota estimada y el mes del último pago», Diccionario de la EDT) y, por RNF-11, el cliente no puede calcular la cuota. El desarrollador aprobó crear este paquete aparte (2026-11-13; antes 5.2.3 D3 lo había dejado para 5.2.4). Sirve igual para el resumen de un **avance** (CU-15 paso 3: «el sistema muestra la cuota estimada»): la tarjeta copia la misma tasa y bandera en ambos.

**No** entran: guardar nada (ni compra, ni avance, ni transacción), el cronograma de cuotas ni el interés total (decisión D7 de 5.2.2), la proyección y el total del mes (5.3.1), el pago de la tarjeta (5.3.2) ni cambios en los endpoints de compras. El cálculo ya existe y está probado (CA-RF27-01..33, `src/tarjetas/cuota-credito.ts`); aquí se verifica cómo lo expone la API.

### Fuentes

- **RF-27 y CU-14 paso 3 (Documento de Diseño Técnico):** «el sistema calcula la cuota con la tasa mensual equivalente y muestra la cuota y el mes del último pago» **antes** de guardar; flujo alternativo 2a (una sola cuota en una tarjeta sin intereses: cuota igual al valor). **CU-15 paso 3** (avance): «el sistema muestra la cuota estimada».
- **Secuencia «compra a cuotas» (Documento de Diseño Técnico):** el frontend llama `GET /tarjetas/:id/cuota?valor&cuotas`; el backend aplica `i = (1 + EA)^(1/12) − 1` y `cuota = V·i / (1 − (1 + i)^(−n))` y responde «cuota estimada y mes del último pago»; después el usuario guarda con un `POST` y el backend «lee la tasa vigente de la tarjeta» y guarda la compra con copia de la tasa. El boceto no incluye `primerPago` en la consulta, pero sin él no se puede dar el mes del último pago (ver D4).
- **Diccionario de la EDT, 5.2.4:** «mostrar la cuota estimada antes de guardar»; aceptación «el resumen previo a guardar muestra la cuota estimada y el mes del último pago».
- **ADR-014 y `CLAUDE.md` (secciones 5, 6 y 7):** fórmula de la cuota (`V / n` con tasa 0 o con una sola cuota en una tarjeta con `cuotaUnicaSinInteres`); los cálculos viven en el backend con precisión completa (RNF-11); solo los `POST` que **crean datos** llevan `@Idempotente()` (este `GET` no crea nada); la documentación Swagger debe ser muy detallada.
- **Criterios ya aprobados que este paquete reutiliza:** 5.2.2 (cálculo, valores de referencia, CA-RF27-01..33) y 5.2.3 (DTO de compras: `valor` mayor que 0 con decimales, `cuotas` entero de 1 a 60, `primerPago` `YYYY-MM` o fecha real `YYYY-MM-DD`; mensajes que empiezan por el nombre del campo; `404 Tarjeta no encontrada` para tarjeta inexistente o ajena, nunca `403`; `400` antes que `404`; campo no declarado `400`; `message` arreglo; formato de error Nest). Contratos del frontend: `../coordinacion/contratos/compras.md` y `contratos/tarjetas.md`.
- **Código ya en `develop`:** `calcularCuota` y `calcularMesUltimoPago` (`cuota-credito.ts`), `TarjetasService.obtenerPropia` (404 de tarjeta ajena o inexistente), `ComprasController` (`tarjetas/:tarjetaId`), `TarjetaIdParamDto`, `MesOFechaCalendario`, `CUOTAS_MAXIMAS`, `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted` y `transform`. `CompraRespuestaDto` ya fija los nombres `cuota`, `mesUltimoPago` (`YYYY-MM`), `tasaEAAplicada` y `cuotaUnicaSinInteres`.

### Valores de referencia

Son los de 5.2.3 y 5.2.2: $1.254.700 a 12 cuotas con tasa 0,2921 → `119802.1331718775` (hoja del promotor: $119.802,13) y, con `primerPago` `2026-12`, último pago `2027-11`; $80.000 a 1 cuota con 0,2921 sin la bandera → `81726.8319`, con la bandera → `80000`; $80.000 a 2 cuotas con 0,2921 → `41299.7335`; $1.254.700 a 12 con 0,31 → `120662.1703`; $120.000 a 12 con tasa 0 → `10000`; $500.000 a 6 con 0,2921 → `89741.0851`; $0,01 a 3 cuotas con 0,2921 → `0.003478` (6 decimales); $999.999.999 a 60 con 0,2921 → `29882762.5028` (4 decimales). Las pruebas comparan los de la hoja con 2 decimales (`toBeCloseTo(119802.13, 2)`) y los demás con 4 (o 6 donde se indica).

### Datos de las pruebas

Los de 5.2.3: **tarjeta «Visa»** del usuario con `tasaEA` 0,2921 y `cuotaUnicaSinInteres` `false` (otras tarjetas se indican en cada criterio); un segundo usuario B con sus propias tarjetas. **Consulta base:** `GET /tarjetas/<visa>/cuota?valor=1254700&cuotas=12&primerPago=2026-12`.

### Contrato de nombres (aprobado)

- No hay nombres de código que las pruebas importen: se prueba solo por HTTP, con las colecciones en memoria del arnés `test/tarjetas/arnes-compras.ts` (que ya registra tarjetas, compras, transacciones, categorías e idempotencia). Servicio, controlador y DTO los nombra el implementador (ver D1 y D11).

### Contrato HTTP (aprobado) (lo consumirá el frontend en 5.2.4)

Requiere `Authorization: Bearer <accessToken>`.

| Operación | Ruta | Query | Éxito |
|---|---|---|---|
| Vista previa de la cuota | `GET /tarjetas/:tarjetaId/cuota` | `valor` (número > 0), `cuotas` (entero 1 a 60), `primerPago` (`YYYY-MM` o `YYYY-MM-DD`), los tres obligatorios | `200` + `{ cuota, mesUltimoPago, tasaEAAplicada, cuotaUnicaSinInteres }` |

Respuesta (exactamente estos cuatro campos; sin `id`, `usuarioId`, `_id` ni `__v`):

```json
{
  "cuota": 119802.1331718775,
  "mesUltimoPago": "2027-11",
  "tasaEAAplicada": 0.2921,
  "cuotaUnicaSinInteres": false
}
```

`cuota` es un número **sin redondear** (RNF-11); `mesUltimoPago` es `YYYY-MM`, igual que en la compra; `tasaEAAplicada` y `cuotaUnicaSinInteres` son la tasa y la bandera que la tarjeta tiene **hoy** y que se copiarían al guardar (para mostrar «Tasa 29,21 % E.A.»). Errores: `400` (query o `tarjetaId` inválidos), `401` (sin sesión), `404 Tarjeta no encontrada` (inexistente o de otro usuario), formato Nest `{ statusCode, message, error }` con `message` arreglo en los `400`. Sin `Idempotency-Key` y sin `X-Zona-Horaria`. No guarda nada.

### Decisiones ya tomadas por el desarrollador (no se reabren)

- Este paquete se crea aparte de 5.2.3 y de 5.2.4 (aprobado 2026-11-13).
- La vista previa usa la **tasa y la bandera actuales** de la tarjeta, las que se copiarán al guardar.
- **Sin efectos secundarios.** Todas las rutas exigen sesión (Bearer JWT).

### Decisiones aprobadas por el desarrollador (2026-11-19)

El desarrollador aprobó la opción recomendada en las 14 decisiones, **salvo D10, que queda solo con los criterios de que no escribe y de que no usa caché** (se retiró el criterio de «una sola lectura de la tarjeta»). Ninguna de estas reglas está definida en un RF ni en un ADR, salvo donde se cita; cada una dice su respaldo y la alternativa descartada. Los criterios de abajo ya las reflejan.

> Decisión D1 — **ruta y dónde vive.** Recomendado: `GET /tarjetas/:tarjetaId/cuota`, en el `ComprasController` (ya tiene el prefijo `tarjetas/:tarjetaId`, su servicio ya inyecta `TarjetasService` y comprobar «la tarjeta es mía» es una sola llamada a `obtenerPropia`); el cálculo delega en `calcularCuota` y `calcularMesUltimoPago`. Fuente: la secuencia dibuja `GET /tarjetas/:id/cuota`, 5.2.3 D3 y el contrato `compras.md` la nombran `GET /tarjetas/:tarjetaId/cuota`; la clase donde vive no la fija ninguna fuente y las pruebas no la ven. Alternativa: `TarjetasController` con `TarjetasService.calcularCuota(compra)` (el método que lista `CLAUDE.md`).

> Decisión D2 — **nombres de los parámetros de query.** Recomendado: `valor`, `cuotas` y `primerPago`, los mismos del cuerpo de `POST …/compras`. Fuente: propuesta del frontend y la secuencia (`?valor&cuotas`); así el frontend envía los mismos nombres en la vista previa y al guardar. Alternativa: `monto` / `numeroCuotas` (sin fuente).

> Decisión D3 — **formato del texto numérico en la query.** Una query siempre llega como texto, así que no puede aplicar la regla del `POST` (que rechaza `"1000"` como texto en el JSON). Recomendado: se acepta **solo texto decimal simple**: `valor` con la forma `^\d+(\.\d+)?$` y mayor que 0 (`1254700`, `100.5`, `0.01`; punto como separador decimal), y `cuotas` con la forma `^\d+$` entre 1 y 60. Se rechazan (`400`) el texto vacío, `abc`, `1e3`, `0x10`, `1,5` (coma), espacios, el signo (`-5`, `+5`), `12.5` en `cuotas`, `Infinity`/`NaN` y un `valor` que desborde a infinito. Fuente: ninguna; es lo más cercano a las reglas del `POST` (valor finito mayor que 0, cuotas entero de 1 a 60). Alternativa: conversión permisiva con `Number()` (acepta `1e3`, `0x10`, ` 12 `, y convierte `""` en 0 sin avisar).

> Decisión D4 — **`primerPago`.** Recomendado: **obligatorio**, con las mismas reglas que en el `POST` (`YYYY-MM` o una fecha real `YYYY-MM-DD` sin hora, de la que solo se toma el mes), sin restricción respecto de la fecha actual (D7 de 5.2.3), porque sin él no se puede dar el mes del último pago. Fuente: la propuesta del frontend, CU-14 paso 3 y el Diccionario de la EDT («el mes del último pago»); el boceto de la secuencia (`?valor&cuotas`) no lo trae. Alternativa: opcional, y si falta se omite `mesUltimoPago` (la respuesta cambiaría de forma; el frontend siempre lo tiene en ese paso).

> Decisión D5 — **forma de la respuesta.** Recomendado: `{ cuota, mesUltimoPago, tasaEAAplicada, cuotaUnicaSinInteres }`, con los mismos nombres y significado que en la respuesta de la compra (`tasaEAAplicada` es la tasa que **se aplicaría** al guardar): el adaptador del frontend reutiliza su mapeo y la pantalla puede mostrar «Tasa 29,21 % E.A.» y avisar «una cuota sin interés». No repite `valor`, `cuotas` ni `primerPago` ni trae `id`. Fuente: nombres de `CompraRespuestaDto` y del contrato `compras.md`; el frontend sugirió, como opcionales, `tasaEA` y `cuotaUnicaSinInteres`. Alternativas: usar `tasaEA` (el nombre del campo de la tarjeta; en una vista previa de compra se confunde con la tasa ya guardada), devolver solo `{ cuota, mesUltimoPago }`, o repetir la consulta en la respuesta (útil para descartar respuestas que llegan fuera de orden con la espera de ~400 ms del frontend, aunque el cliente puede cancelar la petición anterior).

> Decisión D6 — **parámetros no declarados.** Recomendado: cualquier otro parámetro responde `400` con un texto que empieza por su nombre, en especial `fecha`, `tipo`, `tasaEA`, `tasaEAAplicada`, `cuotaUnicaSinInteres`, `usuarioId`, `descripcion` y `categoriaId`. El cliente **nunca elige** la tasa ni la bandera: son las de la tarjeta (la vista previa no sirve para «simular otra tasa»). Fuente: la regla ya aprobada de 5.1.2/5.2.3 (campo no declarado → `400`, `ValidationPipe` estricto) y CA-RF26-49. Alternativa: ignorarlos en silencio (el frontend no se enteraría de que su parámetro no tuvo efecto).

> Decisión D7 — **orden de comprobaciones y mensajes.** Recomendado: un `401` sin sesión va antes que todo; luego formato de `tarjetaId` y de la query (`400`); luego la tarjeta (`404 Tarjeta no encontrada`, mensaje fijo igual para ajena e inexistente, nunca `403`). Una tarjeta ajena con query inválida responde `400`: no revela si existe. Fuente: D19 de 5.2.3 y 5.1.2. Alternativa: `404` primero (exigiría leer la tarjeta antes de validar).

> Decisión D8 — **headers.** Recomendado: no exige `Idempotency-Key` (no crea datos: `CLAUDE.md` sección 6; ni siquiera con `IDEMPOTENCIA_OBLIGATORIA=true`) ni `X-Zona-Horaria` (no hay «hoy» que resolver); si llegan, se ignoran sin error y la respuesta no lleva `Idempotent-Replayed`. Fuente: `CLAUDE.md` sección 6 y el encargo del frontend. Alternativa: rechazar un `X-Zona-Horaria` inválido con `400` (innecesario: no se usa).

> Decisión D9 — **una misma ruta para compra y avance.** Recomendado: una sola ruta (no `…/cuota-avance`), porque el avance copia de la tarjeta la misma tasa y la misma bandera y se calcula igual que una compra (RF-28, CA-RF27-20). Fuente: CU-15 paso 3 y 5.2.2. Alternativa: ruta aparte para el avance (duplica sin diferencia de comportamiento).

> Decisión D10 — **rendimiento: barata, sin escrituras y sin caché (aprobada sin el criterio de lecturas).** La consulta se pedirá con cada cambio de valor, cuotas o mes (con espera de ~400 ms). Criterios verificables: (a) **no escribe en ninguna colección** y responde aunque las escrituras fallen (CA-RF27-49 y 52); (b) **no guarda en caché** la tasa: cambiar la tasa de la tarjeta se refleja en la siguiente consulta (CA-RF27-46). Fuente: el encargo del frontend; no hay RNF numérico para este endpoint. **Retirado por el desarrollador:** el criterio «lee solo la colección de tarjetas, una vez» (iba a ser CA-RF27-53); queda como práctica de revisión de código, no como prueba.

> Decisión D11 — **DTO y reutilización con la compra.** Recomendado (no verificable por HTTP, pero fija los mensajes y Swagger): una clase de query propia, que **reutiliza** `TarjetaIdParamDto`, el validador `MesOFechaCalendario('primerPago')`, la constante `CUOTAS_MAXIMAS` y los mensajes de `CrearCompraDto`, y añade solo la regla de texto de D3 (porque la query llega como texto). No se puede usar `PickType(CrearCompraDto, ['valor', 'cuotas', 'primerPago'])` tal cual: sus reglas (`IsNumber`, `IsInt`) rechazan el texto que trae la query. Los mensajes de error empiezan por el nombre del campo, como en el `POST`; el texto exacto de `valor` y `cuotas` puede variar. Alternativa: `PickType` más una transformación de texto a número con `Number()` (D3, alternativa).

> Decisión D12 — **numeración de los criterios.** Los IDs `CA-RF27-39` a `CA-RF27-42` estuvieron reservados en un borrador de 5.2.3 y salieron de ese paquete (D3 de 5.2.3; no existe prueba con esos IDs). Recomendado: reutilizarlos aquí, continuando la numeración tras CA-RF27-38. Alternativa: empezar en `CA-RF27-43`.

> Decisión D13 — **sin tope superior para `valor`.** Recomendado: igual que en el `POST` (mayor que 0, sin máximo); solo se rechaza lo que no es finito. Fuente: CA-RF26-44 y 5.2.2 (`calcularCuota` no tiene tope). Alternativa: un tope (sin fuente).

> Decisión D14 — **contrato y Swagger.** Recomendado: al aprobarse, el arquitecto deja en `../coordinacion/contratos/` este contrato para la conformidad del frontend; el Swagger de la ruta queda como la fuente de verdad una vez implementada (ver «Documentación Swagger»).

---

### RF-27 — Vista previa de la cuota (API)

#### La respuesta

#### CA-RF27-39 — La vista previa de la compra de referencia de la hoja del promotor

- **Dado** la tarjeta «Visa» del usuario (E.A. 0,2921, sin la bandera)
- **Cuando** envía `GET /tarjetas/<visa>/cuota?valor=1254700&cuotas=12&primerPago=2026-12`
- **Entonces** responde `200` con **exactamente** `cuota`, `mesUltimoPago`, `tasaEAAplicada` y `cuotaUnicaSinInteres`: `cuota` 119802,13 (`toBeCloseTo(119802.13, 2)`), `mesUltimoPago` `"2027-11"` (once meses después del primer pago, con cruce de año), `tasaEAAplicada` 0,2921 y `cuotaUnicaSinInteres` `false`; sin `id`, `usuarioId`, `_id` ni `__v`

#### CA-RF27-40 — La cuota llega con precisión completa, sin redondear

- **Dado** la tarjeta «Visa» (0,2921) y la consulta base
- **Cuando** consulta la vista previa
- **Entonces** `cuota` está dentro de `119802.1331718775` con 6 decimales (`toBeCloseTo(119802.1331718775, 6)`) y **no** es `119802.13` ni `119802`: el redondeo lo hace el cliente al presentar (RNF-11)

#### CA-RF27-41 — El mes del último pago cruza años y es el mismo mes con una cuota

- **Dado** la tarjeta «Visa» y `valor=1254700`
- **Cuando** consulta con `primerPago=2026-12` y `cuotas=1`, con `2026-12` y `cuotas=60`, con `2026-11` y `cuotas=24`, con `2026-12-15` y `cuotas=12`, y con `2026-01-31` y `cuotas=1`
- **Entonces** `mesUltimoPago` es `"2026-12"`, `"2031-11"`, `"2028-10"`, `"2027-11"` y `"2026-01"` (el día del `primerPago` no corre el mes; igual que CA-RF26-37 y CA-RF27-37)

#### CA-RF27-42 — Una cuota sin la bandera cobra un mes de interés; con la bandera, no

- **Dado** una tarjeta «Visa» con `cuotaUnicaSinInteres` `false` y otra «Débito» con `true`, ambas con tasa 0,2921
- **Cuando** consulta `valor=80000&cuotas=1` en cada una, y `valor=80000&cuotas=2` en «Débito»
- **Entonces** `cuota` es `81726.8319` (4 decimales) en «Visa» a 1 cuota, `80000` en «Débito» a 1 cuota (con `cuotaUnicaSinInteres` `true` en la respuesta) y, en «Débito» a 2 cuotas, `41299.7335` (4 decimales): la bandera solo exime la cuota única (igual que CA-RF27-35)

#### CA-RF27-43 — Con tasa cero la cuota es el valor entre las cuotas

- **Dado** una tarjeta con `tasaEA` 0
- **Cuando** consulta `valor=120000&cuotas=12&primerPago=2026-12`, y `valor=100.5&cuotas=1&primerPago=2026-12`
- **Entonces** `cuota` es exactamente `10000` y `100.5`, y `tasaEAAplicada` es `0` (igual que CA-RF27-36)

#### CA-RF27-44 — Valores decimales, muy pequeños y muy grandes

- **Dado** la tarjeta «Visa» (0,2921)
- **Cuando** consulta `valor=0.01&cuotas=3` y `valor=999999999&cuotas=60` (con `primerPago=2026-12`)
- **Entonces** responden `200` y las cuotas son `0.003478` (6 decimales) y `29882762.5028` (4 decimales); ninguna es `NaN`, infinita ni negativa (mismos valores que CA-RF27-14)

#### La tasa y la bandera de la tarjeta

#### CA-RF27-45 — La respuesta trae la tasa y la bandera que la tarjeta tiene hoy

- **Dado** una tarjeta con `tasaEA` 0,31 y `cuotaUnicaSinInteres` `true`
- **Cuando** consulta la vista previa
- **Entonces** `tasaEAAplicada` es `0.31` y `cuotaUnicaSinInteres` es `true` (para que la pantalla muestre «Tasa 31 % E.A.»)

#### CA-RF27-46 — Usa la tasa actual de la tarjeta, sin caché, y no toca las compras anteriores

- **Dado** la tarjeta «Visa» (0,2921) con la compra de referencia ya registrada y la vista previa consultada una vez (cuota 119.802,13)
- **Cuando** el usuario cambia la tasa a 0,31 con `PATCH /tarjetas/<visa>` y consulta de nuevo la vista previa de $1.254.700 a 12 cuotas
- **Entonces** `cuota` es `120662.1703` (4 decimales) y `tasaEAAplicada` `0.31`; y la compra registrada antes conserva `tasaEAAplicada` 0,2921 y su `cuota` (la vista previa no modifica nada, CA-RF25-07)

#### CA-RF27-47 — La vista previa coincide con lo que guarda la compra

- **Dado** tres tarjetas: «Visa» (0,2921, `false`), «Débito» (0,2921, `true`) y «Cero» (tasa 0)
- **Cuando** en cada una consulta la vista previa de la compra base ($1.254.700, 12 cuotas, `2026-12`) y de $80.000 a 1 cuota, y luego registra con `POST …/compras` esa misma compra
- **Entonces** `cuota`, `mesUltimoPago`, `tasaEAAplicada` y `cuotaUnicaSinInteres` de la vista previa son **idénticos** a los de la compra creada (lo que el usuario ve en el resumen es lo que se guarda)

#### CA-RF27-48 — Sirve también para el resumen de un avance

- **Dado** la tarjeta «Visa» (0,2921, sin la bandera)
- **Cuando** consulta la vista previa de $500.000 a 6 cuotas con `primerPago=2026-12` y luego registra con `POST …/avances` ese mismo avance
- **Entonces** la vista previa y el avance creado traen la misma `cuota` (89741,0851, 4 decimales), el mismo `mesUltimoPago` (`"2027-05"`), la misma `tasaEAAplicada` y la misma `cuotaUnicaSinInteres` (CU-15 paso 3)

#### Sin efectos secundarios

#### CA-RF27-49 — No guarda nada

- **Dado** un usuario con la tarjeta «Visa», una compra, un avance (con su transacción) y claves de idempotencia ya guardadas
- **Cuando** consulta la vista previa varias veces, con valores distintos
- **Entonces** las colecciones de compras, transacciones, tarjetas (incluida la `actualizadaEn` de la tarjeta) e idempotencia quedan **idénticas** a como estaban (la vista previa no es una compra ni una transacción; el balance no cambia, ADR-014)

#### CA-RF27-50 — No exige `Idempotency-Key` ni `X-Zona-Horaria` y los ignora

- **Dado** la tarjeta «Visa»
- **Cuando** envía la consulta base sin ningún header especial; con `IDEMPOTENCIA_OBLIGATORIA=true`; con un header `Idempotency-Key`; y con un `X-Zona-Horaria: Zona/Invalida`
- **Entonces** las cuatro responden `200` con el mismo cuerpo, sin header `Idempotent-Replayed`, y no se guarda ninguna clave de idempotencia (D8)

#### CA-RF27-51 — Repetir la consulta da la misma respuesta

- **Dado** la tarjeta «Visa»
- **Cuando** envía dos veces la misma consulta
- **Entonces** las dos respuestas son idénticas y no cambia nada en la base (la consulta se puede repetir con cada cambio del formulario)

#### CA-RF27-52 — Responde aunque la base rechace escrituras

- **Dado** la tarjeta «Visa» y todas las colecciones configuradas para que **toda escritura falle**
- **Cuando** consulta la vista previa
- **Entonces** responde `200` con la cuota correcta (la consulta no escribe en ninguna colección; D10)

#### Parámetros de la consulta

Todos los `400` traen el formato de error Nest `{ statusCode, message, error }`, con `message` arreglo y un texto por problema que empieza por el nombre del campo, y no calculan ni guardan nada.

#### CA-RF27-53 — Faltan parámetros obligatorios

- **Dado** la tarjeta «Visa»
- **Cuando** envía la consulta base sin `valor`, o sin `cuotas`, o sin `primerPago` (cada caso por separado), o sin ningún parámetro
- **Entonces** cada una responde `400` con un texto por cada parámetro faltante que empieza por su nombre (`valor`, `cuotas`, `primerPago`)

#### CA-RF27-54 — `valor` inválido

- **Dado** la tarjeta «Visa»
- **Cuando** envía `valor` `0`, `0.0`, `-1`, `+5`, `abc`, el texto vacío (`valor=`), `1e3`, `0x10`, `1,5`, `Infinity`, `NaN` y un número de 400 cifras (que desborda a infinito)
- **Entonces** cada una responde `400` con un texto que empieza por `valor`; en cambio `valor` `1254700`, `100.5` y `0.01` se aceptan (D3)

#### CA-RF27-55 — `cuotas` inválidas

- **Dado** la tarjeta «Visa»
- **Cuando** envía `cuotas` `0`, `-1`, `12.5`, `61`, `abc`, `12a`, el texto vacío (`cuotas=`), `1e1` y `NaN`
- **Entonces** cada una responde `400` con un texto que empieza por `cuotas`; en cambio `cuotas` `1` y `60` se aceptan (el tope de 60 es el aprobado en 5.2.1, D7)

#### CA-RF27-56 — `primerPago` inválido

- **Dado** la tarjeta «Visa»
- **Cuando** envía `primerPago` `pronto`, `2026-13`, `2026-02-30`, `2026-12-01T00:00:00.000Z` (con hora), `202612` y el texto vacío (`primerPago=`)
- **Entonces** cada una responde `400` con un texto que empieza por `primerPago` (los mismos casos de CA-RF26-46)

#### CA-RF27-57 — `primerPago` acepta mes o fecha real, sin importar cuándo sea

- **Dado** la tarjeta «Visa» y 12 cuotas
- **Cuando** envía `primerPago` `2026-12`, `2026-12-15`, `2026-01-31`, `2026-02-28` y `2020-01` (muy anterior a hoy)
- **Entonces** las cinco responden `200`, con `mesUltimoPago` `"2027-11"`, `"2027-11"`, `"2026-12"`, `"2027-01"` y `"2020-12"` (no hay restricción respecto de la fecha actual, D4)

#### CA-RF27-58 — Un parámetro repetido se rechaza

- **Dado** la tarjeta «Visa»
- **Cuando** envía `?valor=1000&valor=2000&cuotas=12&primerPago=2026-12`, y lo mismo repitiendo `cuotas` y repitiendo `primerPago`
- **Entonces** cada una responde `400` con un texto que empieza por el nombre del parámetro repetido (no se usa «el primero» ni «el último» en silencio)

#### CA-RF27-59 — Parámetros no declarados se rechazan: el cliente no elige la tasa

- **Dado** la tarjeta «Visa» (0,2921)
- **Cuando** la consulta base incluye además `fecha`, `tipo`, `tasaEA`, `tasaEAAplicada`, `cuotaUnicaSinInteres`, `usuarioId`, `descripcion`, `categoriaId` o `foo` (cada uno por separado)
- **Entonces** cada una responde `400` con un texto que empieza por el nombre del parámetro sobrante (D6); por ejemplo, `?tasaEAAplicada=0.5` no cambia la cuota ni se ignora

#### CA-RF27-60 — Varios parámetros inválidos: un texto por cada uno

- **Dado** la tarjeta «Visa»
- **Cuando** envía `valor=0&cuotas=61&primerPago=pronto`
- **Entonces** responde `400` con un texto que empieza por `valor`, otro por `cuotas` y otro por `primerPago`

#### La tarjeta y la sesión

#### CA-RF27-61 — Tarjeta de otro usuario o inexistente: 404; `tarjetaId` mal formado: 400

- **Dado** una tarjeta «Visa» del usuario B y un id válido que no existe
- **Cuando** el usuario A envía la consulta base a cada una, y a `/tarjetas/no-es-un-id/cuota`
- **Entonces** las dos primeras responden `404` con `Tarjeta no encontrada` (el mismo mensaje, nunca `403`, y sin `cuota`, tasa ni bandera de la tarjeta ajena) y la tercera `400` con un texto que empieza por `tarjetaId`

#### CA-RF27-62 — Primero se valida la consulta y después la tarjeta

- **Dado** la tarjeta «Visa» del usuario B
- **Cuando** el usuario A consulta esa tarjeta con `valor=0` y, aparte, con una consulta válida
- **Entonces** la primera responde `400` (con un texto que empieza por `valor`) y la segunda `404 Tarjeta no encontrada` (D7: una consulta inválida no revela si la tarjeta existe)

#### CA-RF27-63 — La tarjeta de otro usuario no afecta la cuota del usuario

- **Dado** el usuario A con «Visa» (0,2921) y el usuario B con una tarjeta también llamada «Visa» con tasa 0,5
- **Cuando** A y B consultan la vista previa de la consulta base en su propia tarjeta
- **Entonces** A obtiene 119802,13 con `tasaEAAplicada` 0,2921 y B obtiene la cuota con 0,5 y `tasaEAAplicada` 0,5 (cada uno ve solo su tarjeta; el usuario sale del JWT)

#### CA-RF27-64 — La ruta exige sesión

- **Dado** una petición sin header `Authorization`, o con un token inválido o vencido
- **Cuando** consulta `GET /tarjetas/<visa>/cuota` con la consulta base, y también con la tarjeta de otro usuario y con parámetros inválidos
- **Entonces** todas responden `401` (la sesión se comprueba antes que los parámetros y que la tarjeta) y no se calcula ni se guarda nada

---

### Documentación Swagger

`src/common/swagger.spec.ts` descubre todos los controladores y fallará si la ruta nueva o sus DTO (de query y de respuesta) no tienen etiqueta (`tarjetas`), resumen, descripción detallada, respuestas de error (`400`, `401`, `404` y `500` según apliquen) y `description` + `example` en cada propiedad. Como este `GET` no crea datos, **no** debe documentar `Idempotency-Key` ni `X-Zona-Horaria`. La descripción de la ruta debe explicar, para que otro desarrollador no tenga que leer el código: que es una **vista previa sin efectos** (no guarda compra, avance ni transacción); que usa la tasa y la bandera **actuales** de la tarjeta, las que copiará `POST …/compras` o `POST …/avances` al guardar, y que cambiar la tasa de la tarjeta después no recalcula compras ya guardadas; la fórmula (`i = (1 + EA)^(1/12) − 1`, `cuota = V·i / (1 − (1 + i)^(−n))`, y `V / n` con tasa 0 o una cuota en tarjeta con `cuotaUnicaSinInteres`); que `cuota` llega **sin redondear** (RNF-11) y `mesUltimoPago` es `YYYY-MM`; el formato de cada parámetro (`valor` decimal con punto, `cuotas` entero de 1 a 60, `primerPago` `YYYY-MM` o `YYYY-MM-DD`), que los tres son obligatorios y que cualquier otro parámetro responde `400`; y que sirve igual para el resumen de un avance. Debe actualizarse la descripción general de la etiqueta `tarjetas` en `src/common/swagger.ts` para mencionar la vista previa. Los criterios CA-RF27-53 a CA-RF27-64 fijan los códigos de error que deben documentarse.

---

## Índice de criterios del paquete 5.2.6

- **RF-27:** CA-RF27-39 a CA-RF27-64. Respuesta: 39 a 44 (referencia, precisión, mes del último pago, bandera, tasa cero, extremos); tasa y bandera de la tarjeta: 45 a 48 (actuales, sin caché, igual a lo que guarda la compra y el avance); sin efectos secundarios y rendimiento: 49 a 52; parámetros: 53 a 60; tarjeta y sesión: 61 a 64.
- **Total:** 26 criterios. El criterio «lee solo la tarjeta, una vez» se retiró (D10) y los siguientes se renumeraron sin huecos.

### Criterios con «Pendiente de decisión»

Ninguno. El desarrollador aprobó el 2026-11-19 las decisiones D1 a D14 (D10 sin el criterio de lecturas) y, con ellas, todos los criterios de esta sección. Reglas que dependen de ellas: D1 (ruta de todos los criterios), D2 (nombres de la query), D3 (CA-RF27-54 y 55), D4 (CA-RF27-39, 53, 56 y 57), D5 (forma de la respuesta de todos los criterios, en especial 39 y 45), D6 (CA-RF27-59), D7 (CA-RF27-61, 62 y 64), D8 (CA-RF27-50), D9 (CA-RF27-48), D10 (CA-RF27-46, 49 y 52), D12 (los IDs) y D13 (CA-RF27-44 y 54).

---

## Paquete 5.3.1 — Total del mes y proyección por tarjeta (RF-30, RF-31)

Estado: Aprobado por el desarrollador el 2026-11-19

### Alcance

Entra el **cálculo y la lectura** de lo que el usuario debe pagar por cada tarjeta: (1) el **total estimado del mes** (RF-30), que es la suma de las **cuotas vigentes** de sus compras y avances más sus **cargos fijos activos**; (2) el **saldo pendiente después del pago del mes** y (3) la **proyección mensual** de los meses siguientes hasta la última cuota registrada (RF-31). Cada compra aporta su propia cuota con **su** `tasaEAAplicada` y **su** `cuotaUnicaSinInteres`, usando las funciones ya existentes de `src/tarjetas/cuota-credito.ts` (`calcularCuota`, `calcularMesUltimoPago`); todo sin redondear (RNF-11): el cliente redondea al mostrar. Para que el frontend pueda mostrarlo (paquete 5.3.3), entra también **un endpoint de lectura**, `GET /tarjetas/:tarjetaId/proyeccion?mes` (D1).

**No** entran: el pago de la tarjeta, su comparación con el total estimado y el campo «pagado» (RF-32, paquete 5.3.2: este paquete **no considera ningún pago**, D8); guardar nada (la consulta no escribe); cupo, día de corte o día de pago (el esquema no los guarda); intereses de mora ni comisiones fuera de los cargos fijos; el cronograma de cada compra por separado; el CRUD de compras, avances y cargos (ya hecho en 5.1.2 y 5.2.3).

### Fuentes

- **RF-30 y RF-31 (Especificación de Requisitos):** RF-30, «visualizar por cada tarjeta el total estimado a pagar en el mes, compuesto por las cuotas vigentes y los cargos fijos activos». RF-31, «visualizar la proyección de pagos de cada tarjeta para los meses siguientes, hasta la última cuota registrada, junto con el saldo pendiente después del pago del mes». RNF-11: los cálculos financieros viven en el backend con precisión completa y se redondea solo al presentar.
- **CU-17 (Documento de Diseño Técnico):** el usuario abre una tarjeta; el sistema calcula el total del mes (cuotas vigentes más cargos fijos activos), muestra el saldo pendiente después del pago del mes y muestra la proyección por mes hasta la última cuota registrada. Flujo alternativo 2a: «la tarjeta no tiene compras ni cargos: el total del mes es cero». CU-14 y CU-15 (postcondición): la compra y el avance «entran en la proyección de la tarjeta».
- **Sección 2.3 del Documento de Diseño Técnico y ADR-014 (`CLAUDE.md` sección 5):** «Proyección de tarjetas: suma por mes las cuotas vigentes de cada compra y los cargos recurrentes activos de la tarjeta»; la cuota es `V·i / (1 − (1 + i)^(−n))`, o `V / n` con tasa cero o con una sola cuota en una tarjeta con `cuotaUnicaSinInteres`; la tasa se copia en la compra (`tasaEAAplicada`), así que cambiar la de la tarjeta no recalcula compras anteriores; una compra con tarjeta no afecta el balance el día de la compra (este paquete no toca el balance).
- **Diccionario de la EDT, 5.3.1:** «Servicio de proyección con su suite de pruebas unitarias»; aceptación: «la proyección coincide con la de la hoja de cálculo del promotor para los mismos datos». `CLAUDE.md` lista `TarjetasService.proyectarPagos(tarjetaId)`.
- **Código ya en `develop`:** `calcularCuota` y `calcularMesUltimoPago` (`cuota-credito.ts`); esquemas `CompraCredito` (`primerPago` siempre día 1 UTC, `cuotas` 1 a 60, `tipo` COMPRA o AVANCE) y `CargoRecurrente` (`activo`, `valor` mayor que 0, sin fecha de inicio ni fin); `TarjetasService.obtenerPropia` (404 de tarjeta ajena o inexistente); `TarjetaIdParamDto`; `MesCalendario`; `@ZonaHoraria()`, `ApiZonaHoraria` y el patrón de `GET /ahorro/progreso` (`mes` opcional `YYYY-MM`, mes actual según `X-Zona-Horaria`); `ValidationPipe` global estricto.
- **Criterios ya aprobados que este paquete reutiliza:** 5.2.2 (cálculo y valores de referencia), 5.2.3 (compras: `primerPago` y `fecha` sin restricción respecto de hoy, avances como compras a cuotas), 5.2.6 (patrón de un `GET` de cálculo sin efectos: formato de error Nest, `message` arreglo con un texto por problema que empieza por el nombre del campo, `404 Tarjeta no encontrada` nunca `403`, `400` antes que `404`, sin `Idempotency-Key`).

### Valores de referencia y cómo se obtuvieron

- **De la hoja del promotor:** solo uno: $1.254.700 a 12 cuotas con E.A. 29,21 % → cuota de $119.802,13 (`119802.1331718775` sin redondear). La hoja de Numbers **no está** en el repositorio ni en `../docs`; el resto de los valores no vienen de ella. Lo que queda **por confirmar con la hoja** está en el apartado final.
- **Calculados por el tester con un cálculo aparte del código del repo** (Python con aritmética decimal de 50 dígitos, sin usar `cuota-credito.ts`): la cuota con la fórmula de ADR-014 y, como segundo método independiente, una búsqueda binaria de la cuota que deja el saldo en cero tras `n` pagos (`saldo = saldo · (1 + i) − cuota`); coinciden en 30 decimales. Las sumas, los totales y los saldos se calcularon con esas cuotas. Cuotas con E.A. 29,21 %: A = $1.254.700 a 12 → `119802.1331718775`; B = $500.000 a 6 → `89741.08506207`; C = $80.000 a 1 → `81726.83193074`; D = $240.000 a 3 → `83478.24716790`; E = $100.000 a 2 → `51624.66686647`; con E.A. 31 %: F = $1.254.700 a 12 → `120662.17031426`; con tasa 0: G = $120.000 a 12 → `10000`; con la bandera: $80.000 a 2 cuotas (la bandera solo exime la cuota única) → `41299.733493`; $500.000 a 3 cuotas → `173913.014933`. Los valores de A, B, C, F, G, $80.000 a 2 y $500.000 a 3 ya estaban en los criterios aprobados de 5.2.2 y 5.2.6.
- **Tolerancia al verificar:** el valor de la hoja con 2 decimales (`toBeCloseTo(119802.13, 2)`); todos los demás con 6 decimales (`toBeCloseTo(x, 6)`), porque las sumas llegan a unos pocos millones y la doble precisión conserva más de 9 decimales a esa magnitud. Nunca se compara contra un valor redondeado al peso: nada se redondea.

### Datos de las pruebas

- **Tarjetas del usuario A:** «Visa» (`tasaEA` 0,2921, `cuotaUnicaSinInteres` `false`), «Débito» (0,2921, `true`) y «Cero» (tasa 0); un segundo usuario B con sus propias tarjetas.
- **Compras (en «Visa» salvo que se diga otra):** A = compra $1.254.700 a 12 cuotas, `primerPago` 2026-12 (vigente 2026-12 a 2027-11); B = avance $500.000 a 6 cuotas, 2026-12 (2026-12 a 2027-05); C = compra $80.000 a 1 cuota, 2026-12 (solo 2026-12); D = compra $240.000 a 3 cuotas, 2027-02 (2027-02 a 2027-04, **futura** respecto de 2026-12); E = compra $100.000 a 2 cuotas, 2026-09 (2026-09 y 2026-10, **terminada** en 2026-12); F = compra $1.254.700 a 12 cuotas con tasa 0,31, 2026-12; G = compra $120.000 a 12 cuotas con tasa 0, 2026-12.
- **Cargos fijos de «Visa»:** «Netflix» $40.000 activo, «Seguro» $15.000 activo y «Gimnasio» $60.000 **inactivo**: los activos suman $55.000.
- **Escenario base** = «Visa» con A, B y C y los tres cargos. Con él, mes a mes (las cuotas ya incluyen la tasa de cada compra; `total` = `cuotas` + 55.000; `saldoPendiente` = suma de las cuotas de los meses **posteriores**):

| Mes | `cuotas` | `total` | `saldoPendiente` |
|---|---|---|---|
| 2026-12 (referencia) | 291270.05016469 | 346270.05016469 | 1766528.890201 |
| 2027-01 | 209543.21823395 | 264543.21823395 | 1556985.671967 |
| 2027-02 | 209543.21823395 | 264543.21823395 | 1347442.453733 |
| 2027-03 | 209543.21823395 | 264543.21823395 | 1137899.235499 |
| 2027-04 | 209543.21823395 | 264543.21823395 | 928356.017265 |
| 2027-05 | 209543.21823395 | 264543.21823395 | 718812.799031 |
| 2027-06 | 119802.13317188 | 174802.13317188 | 599010.665859 |
| 2027-07 | 119802.13317188 | 174802.13317188 | 479208.532688 |
| 2027-08 | 119802.13317188 | 174802.13317188 | 359406.399516 |
| 2027-09 | 119802.13317188 | 174802.13317188 | 239604.266344 |
| 2027-10 | 119802.13317188 | 174802.13317188 | 119802.133172 |
| 2027-11 | 119802.13317188 | 174802.13317188 | 0 |

Comprobaciones aritméticas del tester: la suma de todas las cuotas del escenario es `2057798.94036569` (12·A + 6·B + 1·C); el saldo de 2026-12 es esa suma menos la cuota de 2026-12, `1766528.890201` (= 11·A + 5·B).

### Contrato de nombres (aprobado, D7)

- **Función pura** en `src/tarjetas/proyeccion-tarjeta.ts`, sin Nest, Mongoose ni base de datos: `calcularProyeccion({ mes, compras, cargos })`.
  - `mes`: texto `YYYY-MM`, el mes de referencia.
  - `compras`: arreglo de objetos con `valor`, `cuotas`, `tasaEAAplicada`, `cuotaUnicaSinInteres` (los de `calcularCuota`) y `primerPago` (`Date`, día 1 UTC). Solo las de **una** tarjeta; cualquier otra propiedad se ignora.
  - `cargos`: arreglo de objetos con `valor` y `activo`; la función descarta los inactivos.
  - Devuelve `{ mes, cuotas, cargosFijos, total, saldoPendiente, proyeccion }`, con `proyeccion` = arreglo de `{ mes, cuotas, cargosFijos, total, saldoPendiente }` (los meses **siguientes**, en orden ascendente y sin saltos). Sin `tarjetaId`: eso lo agrega el servicio.
  - Errores: `RangeError` con el nombre del campo al inicio del mensaje (`mes` mal formado; una compra inválida lanza el error de `calcularCuota` o `calcularMesUltimoPago`), como en 5.2.2.
- **HTTP:** se prueba solo por la API con las colecciones en memoria del arnés `test/tarjetas/arnes-compras.ts` (ya registra tarjetas, cargos, compras, transacciones, categorías e idempotencia). El servicio, el controlador y los DTO los nombra el implementador (D1); `CLAUDE.md` sugiere `TarjetasService.proyectarPagos`.

### Contrato HTTP (aprobado, D1, D5, D6) (lo consumirá el frontend en 5.3.3)

Requiere `Authorization: Bearer <accessToken>`.

| Operación | Ruta | Query | Éxito |
|---|---|---|---|
| Total del mes, saldo y proyección | `GET /tarjetas/:tarjetaId/proyeccion` | `mes` opcional, `YYYY-MM` (sin él, el mes actual según `X-Zona-Horaria`, UTC si no se envía) | `200` + el objeto de abajo |

```json
{
  "tarjetaId": "665f1c2a9b1e4a0012a3b4c5",
  "mes": "2026-12",
  "cuotas": 291270.05016469,
  "cargosFijos": 55000,
  "total": 346270.05016469,
  "saldoPendiente": 1766528.890201,
  "proyeccion": [
    { "mes": "2027-01", "cuotas": 209543.21823395, "cargosFijos": 55000, "total": 264543.21823395, "saldoPendiente": 1556985.671967 }
  ]
}
```

Los campos del nivel superior son el **mes de referencia** (RF-30 y el saldo de RF-31); `proyeccion` trae los meses **siguientes** (RF-31), uno por mes, sin saltos, hasta el último mes con cuotas, cada uno con la misma forma que el nivel superior (sin `tarjetaId`). Todos los montos son números **sin redondear**; `mes` es `YYYY-MM`. Sin `id`, `usuarioId`, `_id` ni `__v`. Errores: `400` (`mes`, parámetro no declarado, `tarjetaId` o `X-Zona-Horaria` inválidos), `401` (sin sesión), `404 Tarjeta no encontrada` (inexistente o de otro usuario), formato Nest `{ statusCode, message, error }` con `message` arreglo en los `400`. Sin `Idempotency-Key`. No guarda nada.

### Decisiones aprobadas por el desarrollador (2026-11-19)

El desarrollador aprobó la opción recomendada en las 11 decisiones (D2 = suma de las cuotas de los meses posteriores; D3 = los cargos activos se repiten en cada mes proyectado). Ninguna de estas reglas está definida en un RF ni en un ADR, salvo donde se cita; cada una dice su respaldo y la alternativa descartada. Los criterios de abajo ya las reflejan.

> Decisión D1 — **alcance: servicio y endpoint de lectura.** Opciones: (A) solo el servicio y la función pura, sin ruta; (B) servicio, función pura y `GET /tarjetas/:tarjetaId/proyeccion?mes`; (C) dos rutas, `…/total-mes` y `…/proyeccion`. **Recomendado: B.** Fuente: la EDT no tiene otro paquete del backend que exponga el cálculo (5.3.2 es el pago) y 5.3.3 (frontend) necesita los números calculados por el backend (RNF-11); el mismo criterio se aplicó en 4.3.1 (P2) y 5.2.6. CU-17 trae las tres cosas al abrir una tarjeta, así que una sola llamada evita dos viajes y dos lecturas de las mismas compras. La clase que aloja la ruta (`TarjetasController` o un controlador propio) no la ve ninguna prueba; el método sugerido es `TarjetasService.proyectarPagos`. Con A, el paquete 5.3.3 quedaría bloqueado.

> Decisión D2 — **qué es «saldo pendiente después del pago del mes».** RF-31 no lo define. Opciones: (A) **capital** pendiente, amortizado con la tasa de cada compra (lo que se le debe al banco sin intereses futuros); (B) **suma de las cuotas de los meses posteriores** al de referencia (lo que todavía saldrá del bolsillo por cuotas ya registradas, con sus intereses); (C) devolver ambos. **Recomendado: B.** Razones: es exactamente lo que se ve en la proyección (el saldo después del mes `M` es la suma de las cuotas de los meses siguientes, así que el cliente puede verificar a la vista que cuadra y que el último mes termina en 0); no necesita casos especiales con tasa 0 ni con `cuotaUnicaSinInteres` (la cuota ya vale `V / n` y el saldo es `(n − k)·V / n`); se parece a RF-38, donde el saldo pendiente de una deuda incluye los intereses; y no exige un cálculo de amortización. Cifras para decidir, con la compra de referencia A después del primer pago: (A) capital `1161981.067122` frente a (B) `11·A = 1317823.464891`; en el escenario base a 2026-12, `1583032.681627` frente a `1766528.890201`. **Reglas que acompañan a B:** cuentan las cuotas de **todas** las compras y avances que todavía no se pagan, incluidas las de una compra cuyo `primerPago` es posterior al mes de referencia (la deuda ya existe); una compra terminada aporta 0; **no** incluye cargos fijos (no son una deuda: son indefinidos); y **no** descuenta pagos de la tarjeta (D8). Esto queda por contrastar con la hoja del promotor.

> Decisión D3 — **cargos fijos en la proyección.** Opciones: (A) los cargos activos se **repiten cada mes** de la proyección, hasta el último mes con cuotas (no la extienden); (B) los cargos cuentan solo en el mes de referencia y la proyección lleva solo cuotas; (C) se repiten un número fijo de meses (p. ej. 12) aunque no queden cuotas. **Recomendado: A.** Fuente: el Documento de Diseño Técnico (sección 2.3) dice que la proyección «suma por mes las cuotas vigentes de cada compra y los cargos recurrentes activos de la tarjeta», y RF-29 define los cargos como **mensuales**; RF-31 pide proyectar «hasta la última cuota registrada», no hasta el último cargo (los cargos no tienen fin), por eso no la extienden: una tarjeta con solo cargos tiene `proyeccion` vacía. **Límite conocido:** el cargo no guarda fecha de inicio, de fin ni historial de activaciones; un cargo activo **hoy** se aplica a cualquier mes consultado, también a meses pasados (D4).

> Decisión D4 — **qué cuenta como cuota vigente en un mes y qué mes se puede consultar.** Opciones para la vigencia: (A) una compra aporta su cuota al mes `M` si `primerPago ≤ M ≤ mesUltimoPago` (ambos extremos incluidos, comparando meses, no días); (B) también el mes de la `fecha` de la compra. Para el mes de referencia: (a) cualquier mes `YYYY-MM`, pasado, actual o futuro; (b) solo el actual o futuros (meses pasados `400`). **Recomendado: A y (a).** Fuente: `primerPago` y `mesUltimoPago` son los datos que RF-26 y RF-27 definen para la cuota; la fecha de la compra solo decide el mes del **gasto por categoría** (ADR-014), no cuándo se paga. Una compra con `primerPago` posterior al mes de referencia no aporta al total del mes pero sí a la proyección y al saldo; una ya terminada no aporta a nada. Se acepta un mes pasado porque 5.3.3 mostrará «la comparación con lo pagado» de meses anteriores y porque `GET /ahorro/progreso` y los reportes ya aceptan cualquier mes; con la limitación de D3 para los cargos.

> Decisión D5 — **mes de referencia y validaciones de la query.** Opciones: (A) `mes` opcional `YYYY-MM`; sin él, el mes actual según `X-Zona-Horaria` (UTC si no se envía), con las mismas reglas que `GET /ahorro/progreso`; una zona inválida es `400` siempre, incluso con `mes`; (B) `mes` obligatorio; (C) un nombre distinto (`periodo`). **Recomendado: A.** Fuente: es la convención del repo (reportes, ahorro) y el frontend ya usa ese header; CU-17 dice «el total del mes» al abrir la tarjeta, sin pedir un mes, así que el caso normal no envía parámetros. Además: `mes` repetido y cualquier parámetro no declarado (`desde`, `hasta`, `periodo`, `tasaEA`, `usuarioId`…) responden `400` con un texto que empieza por su nombre (regla de 5.1.2, 5.2.3 y 5.2.6); un `mes` con otro formato (`2026-1`, `202612`, `2026-12-01`) es `400` con un texto que empieza por `mes`. Sin tope respecto del mes actual.

> Decisión D6 — **forma de la respuesta y desglose.** Opciones: (A) nivel superior = mes de referencia (`mes`, `cuotas`, `cargosFijos`, `total`, `saldoPendiente`) más `proyeccion` con los meses **siguientes** de la misma forma; (B) un objeto anidado `mesActual` y `proyeccion` (misma forma en ambos, un solo DTO); (C) una sola lista `meses` que incluye el de referencia; (D) además, un `detalle` por compra o cargo. **Recomendado: A**, sin `detalle`. Razones: separa `cuotas` y `cargosFijos` porque RF-30 pide un total «compuesto por» ambos; sigue la letra de RF-31 («meses siguientes»); `GET /tarjetas/:id/compras` y `…/cargos` ya listan cada compra y cada cargo con su cuota y su mes del último pago, así que un desglose por compra duplicaría datos que el cliente ya tiene. Nombres: `cuotas` (suma de las cuotas vigentes), `cargosFijos` (suma de los cargos activos), `total` (su suma), `saldoPendiente`. Si se elige B o C, solo cambian las rutas de los campos en las pruebas.

> Decisión D7 — **función pura con nombre fijo, además del endpoint.** Opciones: (A) función pura `calcularProyeccion` en `src/tarjetas/proyeccion-tarjeta.ts` con el contrato de arriba, probada con entradas armadas a mano, más pruebas por HTTP; (B) solo pruebas por HTTP, sin nombres de código; (C) un método de servicio que lee la base y calcula en el mismo lugar. **Recomendado: A.** Fuente: la EDT pide «servicio de proyección con su suite de pruebas unitarias» y que coincida con la hoja de cálculo; 5.2.2 usó el mismo patrón (funciones puras en `cuota-credito.ts`, que `calcularProyeccion` reutiliza) y permite medir con Stryker la lógica sin montar la aplicación. Los criterios marcan su capa: **[función]**, **[HTTP]** o **[función + HTTP]**; los de cálculo se prueban sobre la función y un subconjunto representativo también por HTTP (lo que prueba que el servicio carga bien las compras y cargos de la tarjeta). Con B habría que probar toda la matriz de cálculo por HTTP (más lento y más largo de armar).

> Decisión D8 — **sin pagos, sin efectos, sin caché y orden de comprobaciones.** Recomendado: (a) no se consideran pagos de la tarjeta (transacciones con `tarjetaId`, `PAGO_TARJETA`): el total estimado y el saldo salen solo de compras, avances y cargos; RF-32 (5.3.2) añadirá la comparación con lo pagado, probablemente como campos nuevos sin cambiar los existentes; (b) la consulta no escribe en ninguna colección, no guarda caché y refleja de inmediato un cambio en compras, avances, cargos o tarjeta; (c) no exige `Idempotency-Key` ni lo usa (es un `GET`, `CLAUDE.md` sección 6), aun con `IDEMPOTENCIA_OBLIGATORIA=true`; (d) orden: `401` sin sesión antes que todo; luego el formato de `tarjetaId`, de `mes` y de `X-Zona-Horaria` (`400`); luego la tarjeta (`404 Tarjeta no encontrada`, mensaje fijo, igual para ajena e inexistente, nunca `403`). Una tarjeta ajena con `mes` inválido responde `400` (no revela si existe). Fuente: D7 y D10 de 5.2.6, `CLAUDE.md` secciones 5 y 6. Alternativa a (a): descontar ya los pagos del saldo (adelanta 5.3.2 y obliga a decidir cómo se asigna un pago a un mes).

> Decisión D9 — **meses sin cuotas, sin tope y sin paginar.** Recomendado: la proyección es **contigua**: desde el mes siguiente al de referencia hasta el `mesUltimoPago` más lejano, aparece cada mes aunque no tenga cuotas (con solo los cargos activos); si no queda ninguna cuota posterior al mes de referencia, `proyeccion` es `[]`. No hay tope de meses ni paginación. Fuente: RF-31 («hasta la última cuota registrada»); `primerPago` no tiene restricción respecto de hoy (D7 de 5.2.3) y las cuotas llegan a 60, así que la lista es larga solo si el usuario registra un `primerPago` muy lejano o consulta un `mes` muy pasado (CA-RF30-23). Alternativas: omitir los meses sin cuotas (rompe la gráfica mensual del front) o limitar a 60 meses (sin fuente; cortaría la regla «hasta la última cuota»).

> Decisión D10 — **numeración y contrato con el frontend.** No existen criterios `CA-RF30-nn` ni `CA-RF31-nn`; recomendado empezar en `01` para cada RF. Los criterios de la consulta HTTP (mes, parámetros, tarjeta, sesión, efectos) se numeran dentro de RF-30, porque es la consulta del total del mes que RF-31 amplía. Al aprobarse, el arquitecto deja en `../coordinacion/contratos/` el contrato para la conformidad del frontend; el Swagger de la ruta será la fuente de verdad una vez implementada.

> Decisión D11 — **valores de referencia por confirmar con la hoja.** Ver el apartado final. Recomendado: aprobar los criterios con los valores calculados aquí (verificados de forma independiente) y, cuando el promotor entregue la hoja, contrastar al menos el escenario base; si algún valor no coincide, se corrige el criterio (con aprobación) antes de implementar, no el código.

---

### RF-30 — Total estimado a pagar en el mes (cuotas vigentes y cargos fijos activos)

Salvo que se diga otra cosa, «consulta» es `GET /tarjetas/<id>/proyeccion?mes=…` para los criterios [HTTP] y `calcularProyeccion({ mes, compras, cargos })` para los criterios [función]; los datos son los de «Datos de las pruebas».

#### El total del mes

#### CA-RF30-01 — El total del mes de la compra de referencia de la hoja del promotor [función + HTTP]

- **Dado** la tarjeta «Visa» (0,2921) con solo la compra A ($1.254.700 a 12 cuotas, `primerPago` 2026-12), sin cargos
- **Cuando** consulta el mes `2026-12`
- **Entonces** `cuotas` es 119802,13 (`toBeCloseTo(119802.13, 2)`), `cargosFijos` es 0, `total` es 119802,13 y `mes` es `"2026-12"`

#### CA-RF30-02 — Los montos llegan con precisión completa, sin redondear [función + HTTP]

- **Dado** la tarjeta y la consulta de CA-RF30-01
- **Cuando** consulta el mes `2026-12`
- **Entonces** `cuotas` y `total` están dentro de `119802.1331718775` con 6 decimales (`toBeCloseTo(119802.1331718775, 6)`) y **no** son `119802.13` ni `119802`: el redondeo lo hace el cliente al presentar (RNF-11)

#### CA-RF30-03 — Las cuotas de varias compras y avances se suman [función + HTTP]

- **Dado** el escenario base: «Visa» con la compra A, el avance B ($500.000 a 6 cuotas) y la compra C ($80.000 a 1 cuota), todas con `primerPago` 2026-12, y los cargos activos de $55.000
- **Cuando** consulta el mes `2026-12`
- **Entonces** `cuotas` es `291270.05016469` (A `119802.1331718775` + B `89741.08506207` + C `81726.83193074`; 6 decimales), `cargosFijos` `55000` y `total` `346270.05016469`; el avance cuenta igual que una compra (RF-28)

#### CA-RF30-04 — Cada compra usa su propia tasa: el cambio de tasa de la tarjeta no recalcula las anteriores [función + HTTP]

- **Dado** «Visa» con la compra A registrada con 0,2921; luego el usuario cambia la tasa de la tarjeta a 0,31 con `PATCH /tarjetas/<visa>` y registra la compra F ($1.254.700 a 12 cuotas, `primerPago` 2026-12), que copia 0,31 (por la función: A con `tasaEAAplicada` 0,2921 y F con 0,31)
- **Cuando** consulta el mes `2026-12`
- **Entonces** `cuotas` es `240464.30348614` (A `119802.13317188` con 0,2921 + F `120662.17031426` con 0,31; 6 decimales): la compra anterior conserva su tasa (RF-25, ADR-014)

#### CA-RF30-05 — La bandera de una sola cuota sin interés es la de cada compra [función + HTTP]

- **Dado** la tarjeta «Débito» (0,2921, `cuotaUnicaSinInteres` `true`) con una compra de $80.000 a 1 cuota y otra de $80.000 a 2 cuotas, ambas con `primerPago` 2026-12; y la tarjeta «Visa» (sin la bandera) con una compra de $80.000 a 1 cuota con `primerPago` 2026-12
- **Cuando** consulta el mes `2026-12` de cada tarjeta, y de «Débito» otra vez después de cambiar su bandera a `false` con `PATCH /tarjetas/<débito>`
- **Entonces** «Débito» da `cuotas` `121299.733493` (80000 de la cuota única, sin interés, más `41299.733493` de la de 2 cuotas, que sí lleva interés: la bandera solo exime la cuota única) y «Visa» da `81726.831931` (un mes de interés); tras cambiar la bandera, «Débito» sigue dando `121299.733493` (cada compra conserva la suya)

#### CA-RF30-06 — Con tasa cero, las cuotas son el valor entre el número de cuotas [función]

- **Dado** la tarjeta «Cero» (tasa 0) con la compra G ($120.000 a 12 cuotas, `primerPago` 2026-12)
- **Cuando** consulta el mes `2026-12`
- **Entonces** `cuotas` es exactamente `10000` y `total` `10000`

#### Los cargos fijos

#### CA-RF30-07 — Los cargos fijos activos suman y los inactivos no [función + HTTP]

- **Dado** «Visa» con la compra A y los cargos «Netflix» $40.000 y «Seguro» $15.000 (activos) y «Gimnasio» $60.000 (inactivo)
- **Cuando** consulta el mes `2026-12`
- **Entonces** `cargosFijos` es `55000` y `total` es `cuotas + 55000` (`174802.13317188`; 6 decimales): el cargo inactivo no cuenta; y al activar «Gimnasio» con `PATCH …/cargos/<id>` `{ "activo": true }`, la siguiente consulta da `cargosFijos` `115000`

#### CA-RF30-08 — Una tarjeta solo con cargos fijos [función + HTTP]

- **Dado** «Visa» sin compras, con los cargos activos «Netflix» y «Seguro»
- **Cuando** consulta el mes `2026-12`
- **Entonces** `cuotas` es `0`, `cargosFijos` `55000`, `total` `55000`, `saldoPendiente` `0` y `proyeccion` `[]`

#### CA-RF30-09 — Una tarjeta sin compras ni cargos activos: el total es cero [función + HTTP]

- **Dado** una tarjeta recién creada, sin compras ni cargos; y otra solo con cargos inactivos (CU-17, flujo 2a)
- **Cuando** consulta el mes `2026-12`
- **Entonces** las dos responden `200` con `cuotas` `0`, `cargosFijos` `0`, `total` `0`, `saldoPendiente` `0` y `proyeccion` `[]` (no es error ni `404`)

#### Qué cuota está vigente

#### CA-RF30-10 — La vigencia incluye el mes del primer pago y el del último [función]

- **Dado** «Visa» solo con la compra A (`primerPago` 2026-12, último pago 2027-11 tras cruzar el año)
- **Cuando** consulta los meses `2026-11`, `2026-12`, `2027-11` y `2027-12`
- **Entonces** `cuotas` es `0`, `119802.133172`, `119802.133172` y `0` (la cuota cuenta del mes del primer pago al del último, ambos incluidos)

#### CA-RF30-11 — Una compra con el primer pago en un mes futuro no cuenta todavía [función]

- **Dado** «Visa» con la compra A y la compra D ($240.000 a 3 cuotas, `primerPago` 2027-02)
- **Cuando** consulta los meses `2026-12`, `2027-01` y `2027-02`
- **Entonces** `cuotas` es `119802.133172` en los dos primeros (D no cuenta) y `203280.380340` en `2027-02` (A + D `83478.247168`)

#### CA-RF30-12 — Una compra ya terminada no cuenta [función]

- **Dado** «Visa» con la compra E ($100.000 a 2 cuotas, `primerPago` 2026-09, cuotas en 2026-09 y 2026-10) y la compra A
- **Cuando** consulta los meses `2026-10`, `2026-11` y `2026-12`
- **Entonces** `cuotas` es `51624.666866` (la segunda cuota de E: en su último mes todavía cuenta), `0` y `119802.133172` (E ya no aparece)

#### CA-RF30-13 — La vigencia la decide el mes del primer pago, no la fecha de la compra [función + HTTP]

- **Dado** una compra de $1.254.700 a 12 cuotas hecha el `2026-12-31` con `primerPago` `2027-01`, y otra igual hecha el `2026-06-15` con `primerPago` `2026-12` (en «Visa»)
- **Cuando** consulta los meses `2026-12` y `2027-01`
- **Entonces** la primera no cuenta en `2026-12` y sí en `2027-01`; la segunda cuenta en `2026-12` aunque se hizo seis meses antes (la fecha de la compra solo decide su mes de gasto por categoría, ADR-014)

#### CA-RF30-14 — Se puede consultar un mes pasado [función]

- **Dado** «Visa» con la compra E, la compra A y los cargos activos de $55.000
- **Cuando** consulta el mes `2026-10`
- **Entonces** `cuotas` es `51624.666866` (E; A todavía no empieza), `cargosFijos` `55000` y `total` `106624.666866` (los cargos activos hoy se aplican a todo mes: no hay historial de cargos, D3)

#### De dónde salen los datos

#### CA-RF30-15 — Solo cuentan las compras y los cargos de esa tarjeta y de ese usuario [HTTP]

- **Dado** el usuario A con «Visa» (compra A y cargos de $55.000) y «Débito» (una compra de $80.000 a 1 cuota con `primerPago` 2026-12 y un cargo de $20.000), y el usuario B con una tarjeta también llamada «Visa» con la misma compra A y un cargo de $9.000
- **Cuando** A y B consultan el mes `2026-12` de su propia «Visa»
- **Entonces** A obtiene `cuotas` `119802.133172` y `cargosFijos` `55000` (sin lo de «Débito» ni lo de B) y B obtiene `cuotas` `119802.133172` y `cargosFijos` `9000` (el usuario sale del JWT)

#### CA-RF30-16 — Los pagos y el dinero recibido de la tarjeta no cambian el total estimado [HTTP]

- **Dado** «Visa» con la compra A y una transacción `PAGO_TARJETA` de $300.000 con `tarjetaId` de «Visa» en 2026-12 (guardada directamente en la colección de transacciones) y el avance B (con su transacción `DINERO_RECIBIDO`)
- **Cuando** consulta el mes `2026-12`
- **Entonces** `cuotas`, `total` y `saldoPendiente` son los mismos que sin esa transacción de pago (este paquete no considera pagos: RF-32 es 5.3.2, D8)

#### CA-RF30-17 — Un cambio en las compras, avances o cargos se refleja en la siguiente consulta [HTTP]

- **Dado** el escenario base con la consulta de `2026-12` ya hecha (`total` `346270.05016469`)
- **Cuando** el usuario desactiva «Netflix» con `PATCH`, elimina la compra C con `DELETE …/compras/<id>` y cambia B a 3 cuotas con `PATCH …/compras/<id>`, y consulta de nuevo
- **Entonces** `cargosFijos` es `15000`, y `cuotas` es la de A (`119802.133172`) más la de B a 3 cuotas ($500.000, 0,2921: `173913.014933`), es decir `293715.148105`; no hay caché

#### La consulta

#### CA-RF30-18 — La forma exacta de la respuesta [HTTP]

- **Dado** el escenario base
- **Cuando** consulta `GET /tarjetas/<visa>/proyeccion?mes=2026-12`
- **Entonces** responde `200` con **exactamente** las claves `tarjetaId` (el id de la tarjeta), `mes`, `cuotas`, `cargosFijos`, `total`, `saldoPendiente` y `proyeccion`; cada elemento de `proyeccion` trae exactamente `mes`, `cuotas`, `cargosFijos`, `total` y `saldoPendiente`; los montos son números (no texto) y `mes` es `YYYY-MM`; sin `id`, `usuarioId`, `_id` ni `__v` en ningún nivel

#### CA-RF30-19 — Sin `mes`, se usa el mes actual en UTC [HTTP]

- **Dado** el reloj en `2026-12-15T12:00:00Z` y el escenario base
- **Cuando** consulta sin `mes` y sin `X-Zona-Horaria`
- **Entonces** `mes` es `"2026-12"` y las cifras son las del mes `2026-12` de la tabla

#### CA-RF30-20 — Sin `mes`, el mes actual depende de `X-Zona-Horaria` [HTTP]

- **Dado** el reloj en `2027-01-01T03:00:00Z` (en Bogotá todavía es el 31 de diciembre) y, aparte, en `2026-12-31T20:00:00Z` (en Tokio ya es el 1 de enero)
- **Cuando** consulta sin `mes`: sin header y con `X-Zona-Horaria: America/Bogota` en el primer instante, y sin header y con `X-Zona-Horaria: Asia/Tokyo` en el segundo
- **Entonces** `mes` es `"2027-01"` y `"2026-12"` en el primer instante, y `"2026-12"` y `"2027-01"` en el segundo (mismo borde de mes que `GET /ahorro/progreso`)

#### CA-RF30-21 — Con `mes`, la zona no cambia nada; una zona inválida es `400` siempre [HTTP]

- **Dado** el escenario base
- **Cuando** consulta `?mes=2026-12` con `X-Zona-Horaria: Asia/Tokyo`, y con `X-Zona-Horaria: Zona/Invalida` (con `mes` y sin él)
- **Entonces** el primero responde `200` con el mismo cuerpo que sin header; los dos con zona inválida responden `400` con un texto que empieza por `X-Zona-Horaria`

#### CA-RF30-22 — `mes` con un formato inválido [HTTP]

- **Dado** «Visa»
- **Cuando** envía `mes` `2026-13`, `2026-00`, `2026-1`, `202612`, `2026-12-01`, `diciembre`, el texto vacío (`mes=`) y ` 2026-12` (con espacio)
- **Entonces** cada uno responde `400` en formato Nest con `message` arreglo y un texto que empieza por `mes`, sin calcular nada

#### CA-RF30-23 — Un `mes` muy pasado o muy futuro es válido [HTTP]

- **Dado** el escenario base
- **Cuando** consulta `mes=2020-01` y `mes=2099-12`
- **Entonces** las dos responden `200`: en `2020-01`, `cuotas` `0`, `cargosFijos` `55000`, `saldoPendiente` `2057798.940366` (todas las cuotas están por pagar) y `proyeccion` de 94 elementos, de `"2020-02"` a `"2027-11"` (sin tope, D9); en `2099-12`, `cuotas` `0`, `total` `55000`, `saldoPendiente` `0` y `proyeccion` `[]`

#### CA-RF30-24 — Un `mes` repetido se rechaza [HTTP]

- **Dado** «Visa»
- **Cuando** envía `?mes=2026-12&mes=2027-01`
- **Entonces** responde `400` con un texto que empieza por `mes` (no se usa «el primero» ni «el último» en silencio)

#### CA-RF30-25 — Parámetros no declarados se rechazan [HTTP]

- **Dado** «Visa»
- **Cuando** envía `?mes=2026-12` más, cada uno por separado, `desde`, `hasta`, `periodo`, `tasaEA`, `tasaEAAplicada`, `usuarioId`, `tarjetaId` o `foo`
- **Entonces** cada uno responde `400` con un texto que menciona el nombre del parámetro sobrante (el `ValidationPipe` estricto redacta `property <nombre> should not exist`; el cliente no elige tasas ni usuario)

#### CA-RF30-26 — Tarjeta de otro usuario o inexistente: 404; `tarjetaId` mal formado: 400 [HTTP]

- **Dado** una tarjeta «Visa» del usuario B con compras y cargos, y un id válido que no existe
- **Cuando** el usuario A consulta cada una (con `mes=2026-12`) y consulta `/tarjetas/no-es-un-id/proyeccion`
- **Entonces** las dos primeras responden `404` con `Tarjeta no encontrada` (el mismo mensaje, nunca `403`, y sin ninguna cifra de la tarjeta ajena) y la tercera `400` con un texto que empieza por `tarjetaId`

#### CA-RF30-27 — Primero se valida la consulta y después la tarjeta [HTTP]

- **Dado** la tarjeta «Visa» del usuario B
- **Cuando** el usuario A consulta esa tarjeta con `mes=2026-13` y, aparte, con `mes=2026-12`
- **Entonces** la primera responde `400` (texto que empieza por `mes`) y la segunda `404 Tarjeta no encontrada` (una consulta inválida no revela si la tarjeta existe, D8)

#### CA-RF30-28 — La ruta exige sesión [HTTP]

- **Dado** una petición sin header `Authorization`, o con un token inválido o vencido
- **Cuando** consulta `GET /tarjetas/<visa>/proyeccion?mes=2026-12`, y también con la tarjeta de otro usuario y con `mes` inválido
- **Entonces** todas responden `401` (la sesión se comprueba antes que la consulta y que la tarjeta) y no se calcula nada

#### CA-RF30-29 — La consulta no guarda nada y no usa la idempotencia [HTTP]

- **Dado** el escenario base, una transacción, claves de idempotencia ya guardadas y la variable `IDEMPOTENCIA_OBLIGATORIA` activada
- **Cuando** consulta varias veces, con y sin `Idempotency-Key`
- **Entonces** todas responden `200` sin exigir `Idempotency-Key`, sin el header `Idempotent-Replayed` y sin guardar ninguna clave; las colecciones de tarjetas (incluida su `actualizadaEn`), compras, cargos, transacciones e idempotencia quedan **idénticas** a como estaban

#### CA-RF30-30 — Repetir la consulta da la misma respuesta, y responde aunque la base rechace escrituras [HTTP]

- **Dado** el escenario base y, en otra corrida, todas las colecciones configuradas para que **toda escritura falle**
- **Cuando** envía dos veces la misma consulta
- **Entonces** las dos respuestas son idénticas y, con las escrituras fallando, también responde `200` con las mismas cifras (la consulta solo lee)

#### CA-RF30-31 — La función rechaza entradas inválidas y no modifica lo que recibe [función]

- **Dado** una compra con `cuotas` `0`, otra con `valor` `-1`, otra con `primerPago` que no es una fecha válida y una consulta con `mes` `2026-13`, `"2026-1"` y `202612` (número)
- **Cuando** llama a `calcularProyeccion` con cada una
- **Entonces** lanza `RangeError` con un mensaje que contiene el nombre del campo (`cuotas`, `valor`, `primerPago` y `mes`; el texto completo no se verifica), sin devolver `NaN`; y con una entrada válida, ni `compras` ni `cargos` (ni sus objetos) quedan modificados

---

### RF-31 — Proyección de pagos de los meses siguientes y saldo pendiente

#### La proyección

#### CA-RF31-01 — La proyección de la compra de referencia [función + HTTP]

- **Dado** «Visa» con solo la compra A (`primerPago` 2026-12), sin cargos
- **Cuando** consulta el mes `2026-12`
- **Entonces** `proyeccion` tiene **11** elementos, de `"2027-01"` a `"2027-11"` en orden ascendente (con el cruce de año), cada uno con `cuotas` 119802,13 (`toBeCloseTo(119802.13, 2)`), `cargosFijos` 0 y `total` igual a `cuotas`; el último mes es el del último pago de A

#### CA-RF31-02 — Las cuotas de la proyección bajan cuando termina cada compra [función + HTTP]

- **Dado** el escenario base (C termina en 2026-12, B en 2027-05 y A en 2027-11)
- **Cuando** consulta el mes `2026-12`
- **Entonces** `proyeccion` tiene 11 elementos y, mes a mes, `cuotas` y `total` son los de la tabla del escenario base: `209543.21823395` y `264543.21823395` de `2027-01` a `2027-05` (A + B; C ya no aparece) y `119802.13317188` y `174802.13317188` de `2027-06` a `2027-11` (solo A); 6 decimales

#### CA-RF31-03 — Los cargos fijos activos se repiten en cada mes proyectado [función]

- **Dado** el escenario base y, aparte, el mismo con «Netflix» y «Seguro» inactivos
- **Cuando** consulta el mes `2026-12`
- **Entonces** `cargosFijos` es `55000` en el mes de referencia y en **cada** elemento de `proyeccion` en el primer caso, y `0` en todos en el segundo (D3)

#### CA-RF31-04 — La proyección llega hasta el último pago más lejano y los cargos no la extienden [función]

- **Dado** una tarjeta con la compra A (último pago 2027-11) y la compra D (último pago 2027-04), con cargos activos
- **Cuando** consulta el mes `2026-12`, y consulta una tarjeta con solo cargos activos y sin compras
- **Entonces** el último elemento de `proyeccion` es `"2027-11"` (el `mesUltimoPago` más lejano de todas las compras, no el de la última compra registrada) y no hay ningún mes posterior, aunque los cargos no tengan fin; la tarjeta con solo cargos tiene `proyeccion` `[]`

#### CA-RF31-05 — Un mes de referencia en el último pago o después: solo cargos y saldo cero [función]

- **Dado** el escenario base
- **Cuando** consulta los meses `2027-11` y `2027-12`
- **Entonces** en `2027-11`, `cuotas` es `119802.133172`, `saldoPendiente` `0` y `proyeccion` `[]` (es el último mes con cuotas); en `2027-12`, `cuotas` `0`, `cargosFijos` `55000`, `total` `55000`, `saldoPendiente` `0` y `proyeccion` `[]`

#### CA-RF31-06 — Un mes de referencia anterior al primer pago: nada vence todavía, todo está por pagar [función]

- **Dado** «Visa» con solo la compra A (`primerPago` 2026-12) y los cargos activos
- **Cuando** consulta el mes `2026-11`
- **Entonces** `cuotas` es `0`, `total` `55000`, `saldoPendiente` `1437625.598063` (las 12 cuotas de A) y `proyeccion` tiene 12 elementos, de `"2026-12"` a `"2027-11"`, con `cuotas` `119802.133172` en cada uno

#### CA-RF31-07 — Los meses sin cuotas entre medias aparecen en la proyección [función]

- **Dado** «Visa» solo con la compra D ($240.000 a 3 cuotas, `primerPago` 2027-02) y los cargos activos de $55.000
- **Cuando** consulta el mes `2026-12`
- **Entonces** `cuotas` es `0` y `total` `55000`; `proyeccion` tiene 4 elementos: `"2027-01"` (`cuotas` `0`, `total` `55000`: un mes sin cuota que **no** se omite) y `"2027-02"`, `"2027-03"`, `"2027-04"` (`cuotas` `83478.247168`, `total` `138478.247168`); los meses son consecutivos y sin saltos (D9)

#### El saldo pendiente

#### CA-RF31-08 — El saldo después del pago del mes es la suma de las cuotas de los meses siguientes [función + HTTP]

- **Dado** el escenario base
- **Cuando** consulta el mes `2026-12`
- **Entonces** `saldoPendiente` es `1766528.890201` (6 decimales; `11·A + 5·B`) y es igual a la suma de las `cuotas` de todos los elementos de `proyeccion`; no incluye los cargos fijos ni la cuota de 2026-12 (D2)

#### CA-RF31-09 — El saldo de cada mes de la proyección baja hasta cero [función + HTTP]

- **Dado** el escenario base
- **Cuando** consulta el mes `2026-12`
- **Entonces** el `saldoPendiente` de los elementos de `proyeccion` es, de `2027-01` a `2027-11`: `1556985.671967`, `1347442.453733`, `1137899.235499`, `928356.017265`, `718812.799031`, `599010.665859`, `479208.532688`, `359406.399516`, `239604.266344`, `119802.133172` y `0` (6 decimales); y cada saldo es el anterior menos las `cuotas` de su mes (el del mes de referencia incluido)

#### CA-RF31-10 — Los cargos fijos no son parte del saldo [función]

- **Dado** «Visa» solo con cargos activos de $55.000 y sin compras, y el escenario base
- **Cuando** consulta el mes `2026-12`
- **Entonces** en la tarjeta con solo cargos `saldoPendiente` es `0` y en el escenario base es el mismo `1766528.890201` que sin cargos (no suma `55000` por ningún mes)

#### CA-RF31-11 — El saldo incluye las compras futuras completas y no cuenta las terminadas [función]

- **Dado** «Visa» con la compra A, la compra D (futura, `primerPago` 2027-02) y la compra E (terminada en 2026-10)
- **Cuando** consulta los meses `2026-12` y `2027-02`
- **Entonces** `saldoPendiente` es `1568258.206394` en `2026-12` (`11·A` más las 3 cuotas de D, `250434.741504`; E aporta 0) y `1245175.692883` en `2027-02` (`9·A` más las 2 cuotas restantes de D, `166956.494336`)

#### CA-RF31-12 — El saldo con tasa cero y con una sola cuota sin interés [función]

- **Dado** la tarjeta «Cero» con la compra G ($120.000 a 12 cuotas, 2026-12) y la tarjeta «Débito» (con la bandera) con una compra de $80.000 a 1 cuota con `primerPago` 2026-12
- **Cuando** consulta en «Cero» los meses `2026-12` y `2027-11`, y en «Débito» los meses `2026-11` y `2026-12`
- **Entonces** en «Cero» `saldoPendiente` es `110000` y `0`; en «Débito» `2026-11` da `cuotas` `0`, `saldoPendiente` `80000` y `proyeccion` con un solo mes, `2026-12`, de `cuotas` `80000`, y `2026-12` da `saldoPendiente` `0` (no hay interés oculto)

#### CA-RF31-13 — El saldo suma las compras con tasas distintas [función]

- **Dado** «Visa» con la compra A (0,2921) y la compra F (0,31), ambas con `primerPago` 2026-12
- **Cuando** consulta el mes `2026-12`
- **Entonces** `saldoPendiente` es `2645107.338348` (`11·A + 11·F`; cada compra con su tasa)

#### Propiedades y coherencia

#### CA-RF31-14 — Los meses son contiguos y los montos son coherentes [función + HTTP]

- **Dado** el escenario base y la tarjeta de CA-RF31-07
- **Cuando** consulta el mes `2026-12`
- **Entonces** el primer elemento de `proyeccion` es el mes siguiente al de referencia y cada uno es el mes siguiente al anterior (con cruce de año); en el nivel superior y en cada elemento, `total` es `cuotas + cargosFijos`, y ningún monto es negativo, `NaN` ni infinito

#### CA-RF31-15 — El mes siguiente de la proyección coincide con consultar ese mes [HTTP]

- **Dado** el escenario base
- **Cuando** consulta `mes=2026-12` y luego `mes=2027-01`
- **Entonces** el primer elemento de `proyeccion` de la primera consulta es **igual** (`mes`, `cuotas`, `cargosFijos`, `total` y `saldoPendiente`) al nivel superior de la segunda, y la `proyeccion` de la segunda es la de la primera sin ese primer elemento

#### CA-RF31-16 — La proyección y el saldo llegan con precisión completa [función]

- **Dado** el escenario base
- **Cuando** consulta el mes `2026-12`
- **Entonces** `saldoPendiente` y los montos de `proyeccion` conservan decimales más allá de los dos primeros (`1766528.890201` y `209543.218234` no son enteros ni valen `1766528.89` ni `209543.22`): nada se redondea (RNF-11)

---

### Documentación Swagger

`src/common/swagger.spec.ts` descubre todos los controladores y fallará si la ruta nueva o sus DTO (de query y de respuesta) no tienen etiqueta (`tarjetas`), resumen, descripción detallada, respuestas de error (`400`, `401`, `404` y `500` según apliquen) y `description` + `example` en cada propiedad. Como este `GET` no crea datos, **no** debe documentar `Idempotency-Key`; sí documenta `X-Zona-Horaria` (`ApiZonaHoraria`) porque decide el mes actual cuando falta `mes`. La descripción de la ruta debe explicar, para que otro desarrollador no tenga que leer el código: qué es el total del mes (suma de las cuotas vigentes de compras y avances, cada una con su propia tasa, más los cargos fijos activos); la **regla de vigencia** (`primerPago ≤ mes ≤ mesUltimoPago`, extremos incluidos); qué es el `saldoPendiente` (suma de las cuotas de los meses posteriores, con intereses; sin cargos fijos; incluye compras con primer pago futuro) y que no es el capital; que los cargos fijos activos se repiten en cada mes proyectado, no extienden la proyección y no tienen historial (se aplican también a meses pasados); que `proyeccion` empieza en el mes siguiente al de referencia, es contigua y termina en el último pago más lejano (`[]` si no quedan cuotas); que una tarjeta sin compras ni cargos activos da todo en cero; que no considera pagos de la tarjeta (llegan con RF-32); que los montos llegan **sin redondear** (RNF-11); la fórmula de la cuota; el formato de `mes` y que es opcional; y que cualquier otro parámetro responde `400`. Debe actualizarse la descripción general de la etiqueta `tarjetas` en `src/common/swagger.ts`, que hoy dice «Aún no hay proyección de pagos ni total del mes», para mencionar la ruta. Los criterios CA-RF30-21 a CA-RF30-28 fijan los códigos de error que deben documentarse.

---

## Índice de criterios del paquete 5.3.1

- **RF-30:** CA-RF30-01 a CA-RF30-31. Total del mes: 01 a 06 (referencia de la hoja, precisión, varias compras y avances, tasa propia de cada compra, bandera, tasa cero); cargos fijos: 07 a 09 (activos e inactivos, solo cargos, tarjeta vacía); vigencia: 10 a 14 (extremos, futura, terminada, fecha de compra, mes pasado); datos: 15 a 17 (de esa tarjeta y de ese usuario, sin pagos, sin caché); la consulta: 18 a 30 (forma, mes por defecto y zona, formato de `mes`, extremos, repetido, no declarados, 404 y 400, 401, sin efectos, repetible); función: 31.
- **RF-31:** CA-RF31-01 a CA-RF31-16. Proyección: 01 a 07 (referencia, bajan las cuotas, cargos repetidos, último pago más lejano, posterior, anterior, meses sin cuotas); saldo: 08 a 13 (mes de referencia, mes a mes, sin cargos, futuras y terminadas, tasa cero y bandera, tasas mixtas); coherencia: 14 a 16.
- **Total:** 47 criterios (31 + 16). Capas: **función** (`calcularProyeccion`): RF30-01 a 14 y 31, RF31-01 a 14 y 16; **HTTP**: RF30-01 a 05, 07 a 09, 13 y 15 a 30, RF31-01, 02, 08, 09, 14 y 15.

### Criterios con «Pendiente de decisión»

Ninguno. El desarrollador aprobó el 2026-11-19 las decisiones D1 a D11 y, con ellas, los 47 criterios de esta sección. Reglas que dependen de ellas: D1 (la ruta, de todos los criterios HTTP), D2 (el saldo: CA-RF31-08 a 13 y los valores de la tabla), D3 (cargos: CA-RF30-07, 08, 14 y CA-RF31-03, 04, 10), D4 (vigencia y meses pasados: CA-RF30-10 a 14, CA-RF31-05, 06, 11), D5 (mes: CA-RF30-19 a 25), D6 (forma: CA-RF30-18 y todos los que leen campos), D7 (la función y las capas), D8 (sin pagos, sin efectos, orden de errores: CA-RF30-16, 17, 26 a 30), D9 (CA-RF30-23, CA-RF31-04, 07) y D11 (los valores por confirmar).

### Valores por confirmar con la hoja del promotor

La hoja no está disponible; el único valor verificado contra ella es $1.254.700 a 12 cuotas con E.A. 29,21 % → $119.802,13. Todo lo demás se calculó con la fórmula de `CLAUDE.md` sección 5 y se verificó con un segundo método independiente (ver «Valores de referencia»), pero estas cifras y reglas **conviene contrastarlas con la hoja** antes de aprobar:

1. **Definición de «saldo pendiente» (D2).** Es la duda principal: si la hoja resta capital (`1583032.68` en el escenario base a 2026-12) o suma las cuotas que faltan (`1766528.89`). Cambia todos los valores de CA-RF31-08 a 13 y la tabla del escenario base.
2. **Cargos fijos en meses posteriores (D3).** Si la hoja repite los cargos en cada mes de la proyección (y hasta cuándo) o solo los cuenta en el mes actual.
3. **Compras con primer pago futuro en el saldo (D2 y D4).** Si la hoja las cuenta completas en el saldo desde hoy (recomendado) o solo cuando empiezan a pagarse.
4. **Si el mes de referencia queda dentro de la lista de la proyección o aparte (D6).** La hoja puede mostrar una sola serie; cambiaría solo la forma de la respuesta, no los números.
5. **Los totales del escenario base y de las combinaciones** (A + B + C; A con tasa 0,31; A + D; etc.). Los cálculos individuales son fiables; falta que la hoja confirme las sumas con las mismas compras. Conviene contrastar al menos una tarjeta con dos o tres compras de distinto plazo y un cargo fijo.

---

## Paquete 5.3.2 — Registro de pago de tarjeta (RF-32)

Estado: Aprobado por el desarrollador el 2026-11-20 (los valores de la hoja del promotor siguen por confirmar)

### Alcance

Entra el **registro del pago de una tarjeta** (RF-32, CU-18): un egreso del usuario asociado a la tarjeta, guardado como **transacción** con `clasificacionFlujo` `PAGO_TARJETA` y `tarjetaId` (ADR-014), y su **comparación con el total estimado del mes** (el que ya calcula `GET /tarjetas/:tarjetaId/proyeccion`, 5.3.1). Para que el usuario pueda **corregir** un pago equivocado y para que una tarjeta con pagos se pueda eliminar, entran también **listar** los pagos de una tarjeta y **eliminar** uno (D4). Los reportes no cambian de código: ya cuentan los `PAGO_TARJETA` en el balance del mes y los excluyen del gasto por categoría; aquí se **verifica por HTTP** que el pago registrado desde la tarjeta llega bien a ellos (postcondición de CU-18, criterio de la EDT).

**No** entran: editar un pago (se elimina y se registra de nuevo, D4); descontar los pagos del `saldoPendiente` ni asignar un pago a una cuota concreta (D5); intereses de mora; cupo, día de corte o de pago (el esquema no los guarda); pagos de deudas (RF-37, paquete 6.x); las pantallas (5.3.3, frontend); el cambio de los reportes para que cuenten las compras con tarjeta por su categoría (ADR-014; paquete aparte); cambiar el cálculo del total estimado ni de la proyección (5.3.1: este paquete **reutiliza** ese cálculo y no lo duplica).

### Fuentes

- **RF-32 (Especificación de Requisitos):** «registrar el pago de una tarjeta como un egreso asociado a ella y compararlo con el total estimado del mes». RF-33 (editar y eliminar) nombra tarjetas, compras y cargos, no pagos.
- **CU-18 (Documento de Diseño Técnico):** el usuario elige «Registrar pago» en una tarjeta; el sistema propone el total estimado del mes; el usuario confirma o ajusta el valor pagado y la fecha; el backend guarda «un egreso clasificado como pago de tarjeta asociado a ella»; el sistema muestra la diferencia entre lo pagado y lo estimado. Postcondición: «el pago afecta el balance del mes en que se hizo y no aparece en el reporte por categoría». Sección 2.3 (balance del mes): «una compra con tarjeta no afecta el balance el día de la compra; lo afecta el pago de la tarjeta».
- **Diccionario de la EDT, 5.3.2:** «Desarrollar el registro del pago de una tarjeta como egreso asociado a ella, que afecta el balance del mes en que se paga y no el reporte por categoría». Entregable: «Endpoint de pago de tarjeta». Aceptación: «El pago se refleja en el balance del mes del pago y no se cuenta dos veces en el reporte por categoría (ADR-014)». 5.3.3 (frontend) pide «la comparación con lo pagado» en la vista de la tarjeta.
- **ADR-014 y `CLAUDE.md` (secciones 5 y 6):** `transacciones.clasificacionFlujo = PAGO_TARJETA` con `tarjetaId`; el balance del mes cuenta los pagos de tarjeta; el gasto por categoría los excluye; todo `POST` que crea datos lleva `@Idempotente()` y documenta `Idempotency-Key`; una compra con tarjeta no es una transacción; el campo del usuario se llama `usuarioId` (RF-04); el cálculo vive en el backend y se redondea solo al presentar (RNF-11).
- **Código ya en `develop`:** `Transaccion` (`categoriaId` opcional y `null` por defecto, `metodoPago` obligatorio entre `EFECTIVO`, `DEBITO` y `TRANSFERENCIA`, `tarjetaId` opcional; el comentario de `transaccion.enums.ts` dice que un `PAGO_TARJETA` lleva «el método con que se pagó»); `TransaccionesService` responde `409` si se edita o elimina desde `/transacciones` una transacción que no es `ORDINARIO`; `ReportesService.sumarMovimiento` suma el `PAGO_TARJETA` en `pagosTarjeta` y lo resta del `balance`, y el gasto por categoría solo cuenta `ORDINARIO` (`GET /reportes/categorias`); `GET /ahorro/progreso` ya suma `pagosTarjeta` a los egresos; `TarjetasService.eliminar` ya responde `409 No se puede eliminar una tarjeta que ya tiene pagos registrados` (CA-RF33-19 a 22, hoy probados con pagos sembrados en la base: la ruta de este paquete es la que faltaba para crearlos y borrarlos de verdad); `TarjetasService.proyectarPagos` y `calcularProyeccion` (5.3.1); `MONTO_MAXIMO` (999.999.999.999) y los validadores `FechaCalendario` y `MesCalendario` de `src/common/validadores.ts`; `@ZonaHoraria()` y `ApiZonaHoraria`; `ValidationPipe` global estricto; el avance de 5.2.3 (su transacción `DINERO_RECIBIDO` también lleva `tarjetaId`: no es un pago).
- **Criterios ya aprobados que este paquete reutiliza:** 5.2.3 (patrón de `POST` anidado en la tarjeta con `fecha` por defecto según `X-Zona-Horaria`, descripción opcional con valor por defecto, idempotencia, `404` de tarjeta ajena sin guardar nada, orden `401` → `400` → `404`), 5.3.1 (el total estimado y su contrato) y 5.1.2 (CA-RF33-19 a 22).

### Valores de referencia y cómo se obtuvieron

- **De la hoja del promotor:** solo el de siempre: $1.254.700 a 12 cuotas con E.A. 29,21 % → cuota de $119.802,13 (`119802.1331718775`). La hoja **no está** en el repositorio ni en `../docs`, y no se sabe si tiene una columna de «pagado» o de «diferencia»: ninguno de los valores de este paquete viene de ella. Lo que queda por confirmar está en el apartado final.
- **Calculados por el tester con un cálculo aparte del código del repo** (Python con aritmética decimal de 50 dígitos, sin usar `cuota-credito.ts`; las cuotas con la fórmula de ADR-014, como en 5.3.1): con E.A. 29,21 %, A = $1.254.700 a 12 → `119802.133171877499`; B = $500.000 a 6 → `89741.085062070011`; C = $80.000 a 1 → `81726.831930738000`; con tasa 0, G = $120.000 a 12 → `10000`. Total estimado del escenario base: 2026-12 = A + B + C + 55.000 = `346270.050164685510`; 2027-01 = A + B + 55.000 = `264543.218233947510`; 2027-06 = A + 55.000 = `174802.133171877499`; 2026-11 y 2099-12 = 55.000 (solo los cargos).
- **Diferencias** (`diferencia = pagado − estimado`, ver D3), calculadas con esos totales: pagar 346.270 → `−0.050164685510`; pagar 300.000 → `−46270.050164685510`; pagar 300.000 y luego 46.270,05 → `−0.000164685510`; pagar 400.000 → `+53729.949835314490`; pagar 100.000 en 2027-06 → `−74802.133171877499`; pagar 50.000 en 2027-01 → `−214543.218233947510`; pagar 40.000 en 2026-11 → `−15000`; pagar 10.000 de la tarjeta «Cero» → exactamente `0`.
- **Tolerancia al verificar:** los montos guardados o devueltos tal cual (el `valor` del pago, la suma de pagos enteros) se comparan exactos; el total estimado y la `diferencia` con 6 decimales (`toBeCloseTo(x, 6)`); nunca contra un valor redondeado al peso: nada se redondea (RNF-11).

### Datos de las pruebas

- **Tarjetas del usuario A:** «Visa» (0,2921) con el **escenario base de 5.3.1** (compra A, avance B y compra C, todas con `primerPago` 2026-12, y los cargos activos «Netflix» $40.000 y «Seguro» $15.000 más «Gimnasio» $60.000 inactivo); «Cero» (tasa 0) con la compra G ($120.000 a 12 cuotas, `primerPago` 2026-12: estimado de 2026-12 = `10000`); «Vacía» (sin compras ni cargos: estimado 0) y «Débito» (otra tarjeta del mismo usuario). El usuario B tiene su propia «Visa» con el mismo escenario.
- **Categorías generales:** «Hogar» (`EGRESO`), «Salario» (`INGRESO`) y «Otros egresos» (`EGRESO`, respaldo).
- **Pago base:** `{ "valor": 300000, "fecha": "2026-12-05", "metodoPago": "TRANSFERENCIA", "descripcion": "Pago de diciembre" }`. Salvo que se diga otra cosa, el reloj está en `2026-12-15T12:00:00Z`.

### Contrato de nombres (D11)

- **No hay entidad nueva ni función pura nueva.** El pago **es** una transacción (D1): `TarjetasModule` ya registra `Transaccion` e `Idempotencia` con el nombre de su clase como token (`getModelToken(Transaccion.name)`), que es lo que las pruebas reemplazan por colecciones en memoria. El `id` del pago es el `_id` de su transacción. El servicio, el controlador y los DTO los nombra el implementador (`CLAUDE.md` ya lista `TarjetasService.registrarPago(dto)`). El cálculo de la comparación **no** duplica el de la proyección: usa `calcularProyeccion` / `proyectarPagos`.
- **HTTP:** se prueba solo por la API con el arnés `test/tarjetas/arnes-compras.ts` (ya monta tarjetas, cargos, compras, transacciones, categorías, reportes, idempotencia y la eliminación de la cuenta). El tester agregará a ese arnés los atajos `crearPago`, `listarPagos` y `eliminarPago` (está en `test/`, no es producción).

### Contrato HTTP (propuesto, D1, D3, D4) (lo consumirá el frontend en 5.3.3)

Todas las rutas requieren `Authorization: Bearer <accessToken>`.

| Operación | Ruta | Cuerpo / query | Éxito |
|---|---|---|---|
| Registrar pago | `POST /tarjetas/:tarjetaId/pagos` | `{ valor, fecha?, metodoPago?, descripcion? }` | `201` + pago con su `comparacion` |
| Listar pagos | `GET /tarjetas/:tarjetaId/pagos?mes=YYYY-MM` | `mes` opcional | `200` + `{ items: [pago…] }` |
| Eliminar pago | `DELETE /tarjetas/:tarjetaId/pagos/:id` | — | `204` sin cuerpo |
| Total del mes (cambio aditivo) | `GET /tarjetas/:tarjetaId/proyeccion?mes` | sin cambios | `200` + lo de 5.3.1 más `pagado` y `diferencia` en el nivel superior |

`POST …/pagos` lleva `@Idempotente()` y documenta `Idempotency-Key` y `X-Zona-Horaria`; `GET` y `DELETE` no. El **pago** que devuelven las tres rutas tiene exactamente estos campos (sin `usuarioId`, `_id`, `__v`, `tipo`, `monto` ni `clasificacionFlujo`); el `POST` agrega `comparacion`:

```json
{
  "id": "66a0b3c4d5e6f70012ab3501",
  "tarjetaId": "66a0b3c4d5e6f70012ab34cd",
  "valor": 300000,
  "fecha": "2026-12-05",
  "metodoPago": "TRANSFERENCIA",
  "descripcion": "Pago de diciembre",
  "creadaEn": "2026-12-15T12:00:00.000Z",
  "comparacion": {
    "mes": "2026-12",
    "estimado": 346270.05016468551,
    "pagado": 300000,
    "diferencia": -46270.05016468551
  }
}
```

`GET /tarjetas/:tarjetaId/proyeccion?mes=2026-12` conserva todos sus campos y agrega, **solo en el nivel superior** (el mes de referencia; las filas de `proyeccion` no cambian), `"pagado": 300000` y `"diferencia": -46270.05016468551`. `valor` y los montos de `comparacion` son números sin redondear (RNF-11); `fecha` es `YYYY-MM-DD`; `mes` es `YYYY-MM`. Mensajes de error fijos: `404 Tarjeta no encontrada`; `404 Pago no encontrado`. Errores en formato Nest `{ statusCode, message, error }` con `message` arreglo en los `400`.

### Decisiones propuestas (pendientes de aprobación)

Ninguna de estas reglas está definida en un RF ni en un ADR, salvo donde se cita; cada una dice su respaldo y la alternativa descartada. Los criterios de abajo reflejan la **opción recomendada** de cada una. Si el desarrollador elige otra, solo cambian los criterios que cada decisión nombra.

> Decisión D1 — **ruta, qué es el pago y su categoría.** Opciones: (A) ruta propia `POST /tarjetas/:tarjetaId/pagos`, con `@Idempotente()`; el pago **es** una transacción `EGRESO` con `clasificacionFlujo` `PAGO_TARJETA`, `tarjetaId` y **sin categoría** (`categoriaId` `null`); (B) reutilizar `POST /transacciones` agregando `clasificacionFlujo` y `tarjetaId` al cuerpo; (C) ruta propia con una colección `pagostarjeta` aparte. **Recomendado: A.** Razones: `CLAUDE.md` sección 6 manda un solo `POST /transacciones` para el **botón** de ingreso o egreso (el cliente solo fija `tipo`); el pago de tarjeta es otra acción de la pantalla (CU-18 «Registrar pago» dentro de la tarjeta), con otros datos (la tarjeta de la ruta, sin categoría) y el mismo precedente que el avance (5.2.3 D2, `POST /tarjetas/:tarjetaId/avances`). Con B habría que hacer opcional la categoría solo para ciertas clasificaciones, validar `tarjetaId` y dejar que `PATCH /transacciones` cambie el `tipo` o la categoría de un pago (rompe ADR-014). Con C el balance y los reportes tendrían que leer dos colecciones (ADR-014 y CU-18 dicen «transacción»). **Sobre la categoría:** el esquema **no** exige categoría a un `PAGO_TARJETA` (`categoriaId` es opcional, `null` por defecto: «los pagos de tarjeta y abonos no cuentan por categoría») y la transacción del avance de 5.2.3 (D11) ya va con `categoriaId` `null`; recomendado seguir ese precedente. Asignarle la categoría de respaldo (como la **compra** del avance, que sí la necesita) no tiene fuente y dejaría un dato que solo evita, sin garantía, que un reporte futuro lo cuente dos veces. Efecto: `GET /transacciones` muestra el pago con `categoriaId` y `categoria` en `null`.

> Decisión D2 — **cuerpo y validaciones.** Recomendado: `{ valor, fecha?, metodoPago?, descripcion? }`. **`valor`** (nombre que usan cargos, compras y avances de la misma ruta; la transacción lo guarda como `monto`): número mayor que 0, **con máximo 2 decimales** (es dinero que salió de verdad, igual que `monto` en `POST /transacciones`) y a lo sumo `MONTO_MAXIMO` (999.999.999.999). Como el total estimado llega sin redondear, el cliente redondea la propuesta al presentarla (RNF-11) y el usuario confirma o ajusta ese valor. **`fecha`:** opcional, `YYYY-MM-DD` real, pasada o futura (como una transacción); sin ella es **hoy** en la zona de `X-Zona-Horaria` (UTC sin el header, `400` si es inválida), como en 5.2.3 D6; se guarda a las 00:00 UTC. **`metodoPago`:** opcional, uno de `EFECTIVO`, `DEBITO`, `TRANSFERENCIA` (los de una transacción; `TARJETA_CREDITO` no sirve para pagar una tarjeta), **por defecto `TRANSFERENCIA`** (CU-18 pide solo valor y fecha; pagar una tarjeta suele ser por transferencia o PSE). **`descripcion`:** opcional, de 1 a 200 caracteres con recorte de espacios; sin ella es `Pago de tarjeta` (como el avance, 5.2.3 D10). `tipo`, `monto`, `clasificacionFlujo`, `tarjetaId`, `usuarioId`, `categoriaId`, `deudaId` y cualquier otro campo son `400`; `null` en un campo opcional también. Alternativas: `monto` en lugar de `valor` (coincide con `/transacciones`, pero no con las demás rutas de la tarjeta); `metodoPago` obligatorio (obliga al cliente a preguntar algo que CU-18 no menciona); aceptar decimales sin límite (como `valor` de una compra: un pago real no tiene fracciones de centavo). **Por confirmar:** el valor por defecto de `metodoPago` y los 2 decimales.

> Decisión D3 — **cómo se «compara con el total estimado del mes».** Opciones: (A) el `POST` devuelve la `comparacion` del mes del pago (`mes`, `estimado`, `pagado`, `diferencia`) **y** `GET /proyeccion` agrega `pagado` y `diferencia` al mes de referencia (campos nuevos, sin cambiar los existentes); (B) solo el `POST`; (C) un `GET /tarjetas/:tarjetaId/pagos/comparacion?mes` aparte; (D) agregar `pagado` y `diferencia` a **cada** mes de `proyeccion`. **Recomendado: A**, con estas definiciones: `estimado` = el `total` de la proyección de ese mes (cuotas vigentes + cargos fijos activos, sin redondear: **se reutiliza** `proyectarPagos`, no se calcula otra vez); `pagado` = la suma del `valor` de **todos** los `PAGO_TARJETA` de **esa** tarjeta y de ese usuario cuya `fecha` cae en ese mes (con el pago nuevo incluido en el `POST`; no cuentan los avances `DINERO_RECIBIDO`, las transacciones ordinarias, los abonos ni los pagos de otras tarjetas); `diferencia = pagado − estimado` (**negativa**: falta por pagar; **positiva**: pagó de más; **0**: exacto; sigue el orden de CU-18 «la diferencia entre lo pagado y lo estimado»). **El mes de la comparación es el de la `fecha` del pago** (CU-18: «el balance del mes en que se hizo»), no el mes de hoy. Razones de A: CU-18 paso 5 pide mostrar la diferencia al registrar (una sola llamada); 5.3.3 muestra «la comparación con lo pagado» en la vista de la tarjeta, que ya consume `GET /proyeccion` (una sola llamada); el contrato de 5.3.1 (`coordinacion/contratos/proyeccion.md`) ya anticipa que los pagos llegan «como campos nuevos, sin cambiar estos»; y se parte de un solo cálculo. **Cuidado:** agregar dos claves al nivel superior **modifica CA-RF30-18 (aprobado en 5.3.1: «exactamente las claves…»)** y su prueba (`CLAVES_NIVEL_SUPERIOR` en `proyeccion-consulta.integration.spec.ts`): necesita aprobación explícita del desarrollador (ver CA-RF32-34). Alternativas: B (el front tendría que sumar los pagos o pedirlos aparte, contra RNF-11); C (una ruta más y dos viajes en la vista); D (todos los meses futuros mostrarían una diferencia negativa que no es una deuda vencida, y cambia también la forma de las filas). Con B se eliminan CA-RF32-29 a 34 y con C pasan a esa ruta; en ambos casos no se toca ninguna prueba aprobada.

> Decisión D4 — **qué otras operaciones entran.** Opciones: (A) listar y eliminar desde la tarjeta (`GET` y `DELETE …/pagos`); un pago equivocado se corrige eliminándolo y registrándolo de nuevo; `/transacciones` sigue respondiendo `409` a `PATCH` y `DELETE` de un pago; (B) lo anterior más `PATCH …/pagos/:id`; (C) gestionar los pagos desde `/transacciones` (quitar el `409` a `PAGO_TARJETA`). **Recomendado: A.** Razones: sin `DELETE` desde la tarjeta, una tarjeta con un pago quedaría **imposible de eliminar** (la regla de 5.1.2, CA-RF33-19 a 21, exige borrar primero sus pagos, y hoy `/transacciones` lo prohíbe: es el mismo callejón que D12 de 5.2.3 cerró para los avances); sin listar, el cliente no tiene los ids de los pagos viejos (`GET /transacciones` no trae `tarjetaId`). Editar no lo pide ningún RF (RF-33 nombra tarjetas, compras y cargos) y eliminar y volver a registrar da el mismo resultado; con C, `PATCH /transacciones` podría cambiar el `tipo` o la categoría de un pago. `GET` de un solo pago no se agrega (nadie lo necesita). Alternativa B: costo pequeño (misma validación y recalcular la comparación); se agrega cuando el frontend lo pida. El listado: sin paginación (como compras y cargos), más reciente primero (`fecha` descendente y, a igual fecha, creación descendente), filtro opcional `mes` (`YYYY-MM`, el mes de la `fecha`); sin `mes`, todos los pagos de la tarjeta; otro parámetro o un `mes` repetido o inválido es `400`.

> Decisión D5 — **el pago no descuenta el saldo pendiente ni se bloquea.** Recomendado: (a) `saldoPendiente`, `cuotas`, `cargosFijos` y `total` de la proyección **no** cambian con los pagos (se mantiene D8 de 5.3.1 y CA-RF30-16): el saldo es la suma de las cuotas de los meses siguientes y un pago no se asigna a una cuota concreta; lo pagado se compara en su mes (`pagado`, `diferencia`); (b) no se restringe el valor: se puede pagar menos o más que el estimado, en un mes sin estimado (tarjeta vacía) o con una fecha pasada o futura; (c) tampoco se exige que la tarjeta tenga compras. Fuente: RF-32 no pide limitar; ADR-014 trata el pago como dinero que sale. Alternativa a (a): descontar los pagos del saldo (obliga a decidir cómo se asigna un pago a los meses y a cuotas con intereses distintos; sin fuente en la hoja del promotor).

> Decisión D6 — **orden de las comprobaciones y mensajes.** Recomendado: `401` sin sesión antes que todo; luego el formato de `tarjetaId`, de `id` y del cuerpo o la query y de `X-Zona-Horaria` (`400`); luego la tarjeta (`404 Tarjeta no encontrada`, igual para ajena e inexistente, nunca `403`); luego el pago (`404 Pago no encontrado`: inexistente, de otro usuario, de otra tarjeta o una transacción que no es un `PAGO_TARJETA`) y solo entonces se guarda o se borra. Una tarjeta ajena con un cuerpo inválido responde `400` (no revela si existe). Fuente: D19 de 5.2.3 y D8 de 5.3.1.

> Decisión D7 — **efectos sobre eliminar la tarjeta y la cuenta.** Recomendado: sin cambios de código en la regla de eliminar tarjeta: con pagos responde `409` (CA-RF33-19) y, con compras o avances, el mensaje de compras tiene prioridad (5.2.3 D17); tras eliminar sus pagos con `DELETE …/pagos/:id` se puede eliminar (CA-RF33-21, ahora de punta a punta). Eliminar compras, avances o cargos no toca los pagos, y los pagos no tocan compras ni cargos. Eliminar la cuenta borra los pagos del usuario (la transacción lleva `usuarioId`, RF-04); no se agrega ningún campo de usuario con otro nombre. Fuente: 5.1.2 D4, `CLAUDE.md` sección 5.

> Decisión D8 — **reportes: sin cambios de código, con pruebas por HTTP.** Recomendado: no se toca `ReportesService`; los criterios CA-RF32-48 a 54 verifican por HTTP lo que exige la EDT: el pago cuenta en `pagosTarjeta` y en el `balance` del mes de su `fecha` (UTC, igual que cualquier transacción: un pago del 2026-12-31 es de diciembre y uno del 2027-01-01 de enero), no suma a `egresos` ni aparece en `GET /reportes/categorias`, y eliminarlo revierte todo. La compra con tarjeta, en cambio, no mueve el balance. `GET /ahorro/progreso` ya resta `pagosTarjeta` a lo ahorrado; no se prueba aquí (es de 4.x). Alternativa: no probar los reportes en este paquete (deja sin verificar el criterio de la EDT).

> Decisión D9 — **idempotencia, zona horaria y atomicidad.** Recomendado: `POST …/pagos` con `@Idempotente()` (misma clave y misma petición: misma respuesta con `Idempotent-Replayed: true` y una sola transacción; otra petición con la misma clave `422`; si la primera falla la clave se libera); dos pagos iguales con claves distintas son legítimos (dos pagos parciales del mismo valor; no se deduplica por contenido); con `IDEMPOTENCIA_OBLIGATORIA=true` el header es obligatorio. `X-Zona-Horaria` solo decide la `fecha` por defecto. La escritura es **una sola** (la transacción): no hay nada que compensar; si falla, `500` y no queda nada. `GET` y `DELETE` no usan ni exigen `Idempotency-Key`. Fuente: `CLAUDE.md` sección 6.

> Decisión D10 — **forma de la respuesta y precisión.** Recomendado: la del contrato de arriba; el `POST` trae `comparacion` anidada (el pago de la lista no la lleva: el estimado depende de datos que cambian); montos sin redondear (RNF-11); sin `usuarioId`, `_id` ni `__v`; `creadaEn` en ISO UTC. Alternativa: aplanar `mes`, `estimado`, `pagado` y `diferencia` dentro del pago (mezcla datos del pago con datos del mes).

> Decisión D11 — **sin función pura ni entidad nueva.** Recomendado: no se agrega `calcularComparacion` ni esquema: la lógica nueva es una suma filtrada y una resta (`pagado − total`) sobre lo que ya calcula 5.3.1, y se prueba entera por HTTP (CA-RF32-01 a 54). Alternativa: función pura `compararPago({ estimado, pagos })` con su suite (da medición directa con Stryker sobre la resta; el implementador puede hacerla sin que ninguna prueba la nombre).

> Decisión D12 — **numeración y contrato con el frontend.** No existen criterios `CA-RF32-nn`; se empieza en `01`. Al aprobarse, el arquitecto deja en `../coordinacion/contratos/` el contrato `pagos.md` para la conformidad del frontend (5.3.3, que está en curso y consume `proyeccion.md`); el Swagger de las rutas será la fuente de verdad una vez implementadas. **CA-RF32-34 modifica CA-RF30-18 (D3); requiere aprobación expresa.**

> Decisión D13 — **valores y reglas por confirmar con la hoja.** Ver el apartado final. Recomendado: aprobar los criterios con los valores calculados aquí (verificados de forma independiente) y contrastarlos con la hoja cuando el promotor la entregue; si algo no coincide, se corrige el criterio (con aprobación) antes de implementar.

---

### RF-32 — Registrar el pago de una tarjeta y compararlo con el total estimado del mes

#### Registrar (`POST /tarjetas/:tarjetaId/pagos`)

#### CA-RF32-01 — Registrar el pago base y ver su comparación con el total estimado del mes

- **Dado** la tarjeta «Visa» con el escenario base (total estimado de 2026-12 = `346270.050165`) y sin pagos
- **Cuando** envía `POST /tarjetas/<visa>/pagos` con el pago base ($300.000, `2026-12-05`, `TRANSFERENCIA`, «Pago de diciembre»)
- **Entonces** responde `201` con **exactamente** los campos `id`, `tarjetaId` (el de «Visa»), `valor` 300000, `fecha` `"2026-12-05"`, `metodoPago` `"TRANSFERENCIA"`, `descripcion` `"Pago de diciembre"`, `creadaEn` (ISO UTC) y `comparacion` con `mes` `"2026-12"`, `estimado` `346270.050165`, `pagado` 300000 y `diferencia` `−46270.050165` (6 decimales; negativa: falta por pagar); sin `usuarioId`, `_id`, `__v`, `tipo`, `monto` ni `clasificacionFlujo`

#### CA-RF32-02 — El pago se guarda como una transacción de pago de tarjeta y no toca nada más

- **Dado** la tarjeta «Visa» con el escenario base (una compra, un avance con su transacción y cargos)
- **Cuando** registra el pago base
- **Entonces** hay exactamente **una** transacción nueva, del usuario, con `tipo` `EGRESO`, `monto` 300000, `fecha` 2026-12-05T00:00:00.000Z, `metodoPago` `TRANSFERENCIA`, `descripcion` `"Pago de diciembre"`, `clasificacionFlujo` `PAGO_TARJETA`, `tarjetaId` el de «Visa», `deudaId` `null` y `categoriaId` `null` (D1); su `_id` es el `id` de la respuesta; y la tarjeta, las compras, el avance y los cargos quedan exactamente como estaban (incluida la `actualizadaEn` de la tarjeta)

#### CA-RF32-03 — Pagar exactamente el estimado deja la diferencia en cero

- **Dado** la tarjeta «Cero» (tasa 0) con la compra G (estimado de 2026-12 = `10000`)
- **Cuando** registra un pago de $10.000 con fecha `2026-12-05`
- **Entonces** `comparacion` es `estimado` 10000, `pagado` 10000 y `diferencia` exactamente `0`

#### CA-RF32-04 — Varios pagos del mes se suman: se puede pagar en partes

- **Dado** la tarjeta «Visa» con el escenario base y el pago base ya registrado ($300.000 el `2026-12-05`)
- **Cuando** registra un segundo pago de $46.270,05 con fecha `2026-12-20`
- **Entonces** `comparacion.pagado` es `346270.05` (la suma de los dos pagos del mes), `estimado` `346270.050165` y `diferencia` `−0.000165` (6 decimales); hay dos transacciones de pago

#### CA-RF32-05 — Pagar de más es válido y la diferencia es positiva

- **Dado** la tarjeta «Visa» con el escenario base y sin pagos
- **Cuando** registra un pago de $400.000 con fecha `2026-12-05`
- **Entonces** responde `201` con `pagado` 400000 y `diferencia` `53729.949835` (positiva: pagó de más; D5)

#### CA-RF32-06 — Pagar el valor redondeado al peso deja una diferencia mínima, no cero

- **Dado** la tarjeta «Visa» con el escenario base y sin pagos
- **Cuando** registra un pago de $346.270 (el estimado redondeado al peso que mostraría el cliente) con fecha `2026-12-05`
- **Entonces** `diferencia` es `−0.050165` (6 decimales): el backend no redondea el estimado, no «ajusta» el pago al estimado y no hay error (RNF-11)

#### CA-RF32-07 — Un mes sin estimado: el pago se acepta y la diferencia es el pago completo

- **Dado** la tarjeta «Vacía» (sin compras ni cargos)
- **Cuando** registra un pago de $50.000 con fecha `2026-12-05`
- **Entonces** responde `201` con `comparacion`: `estimado` 0, `pagado` 50000 y `diferencia` 50000 (D5)

#### CA-RF32-08 — La comparación es la del mes de la fecha del pago, no la del mes actual

- **Dado** el reloj en `2026-12-15T12:00:00Z` y la tarjeta «Visa» con el escenario base, con el pago base ya registrado (diciembre)
- **Cuando** registra un pago de $100.000 con fecha `2027-06-15`
- **Entonces** `comparacion` es `mes` `"2027-06"`, `estimado` `174802.133172` (A + los cargos de $55.000), `pagado` 100000 (solo ese pago: el de diciembre no cuenta) y `diferencia` `−74802.133172`

#### CA-RF32-09 — El mes lo decide el día de la fecha, también en los extremos del mes

- **Dado** la tarjeta «Visa» con el escenario base y sin pagos
- **Cuando** registra, en este orden, pagos de $1.000 con fecha `2026-11-30`, de $2.000 con `2026-12-01`, de $3.000 con `2026-12-31` y de $4.000 con `2027-01-01`
- **Entonces** el `comparacion.mes` y el `pagado` de cada respuesta son `2026-11` y 1000, `2026-12` y 2000, `2026-12` y 5000 (2.000 + 3.000) y `2027-01` y 4000 (sin desfase por zona horaria: la fecha es la que se envía)

#### CA-RF32-10 — Solo cuentan como pagado los pagos de esa tarjeta, de ese usuario y de ese mes

- **Dado** la tarjeta «Visa» con el escenario base, y en la base: un pago de «Débito» (otra tarjeta del mismo usuario) de $700.000 el `2026-12-08`; un pago de «Visa» de $40.000 el `2026-11-30` y otro de $50.000 el `2027-01-01`; un avance de «Visa» con fecha `2026-12-10` (transacción `DINERO_RECIBIDO` con el `tarjetaId` de «Visa», $500.000); un egreso ordinario de $20.000 el `2026-12-12`; un abono a una deuda de $30.000 el `2026-12-15` (sin `tarjetaId`); y un pago de $90.000 del usuario B en la «Visa» de B el `2026-12-05`
- **Cuando** el usuario A registra el pago base (en «Visa», `2026-12-05`)
- **Entonces** `comparacion.pagado` es exactamente 300000 y `diferencia` `−46270.050165`: nada de lo demás se suma

#### CA-RF32-11 — Sin `fecha`, el pago es de hoy en la zona del cliente

- **Dado** que en el servidor son las 02:00 UTC del 2026-12-01 (en Bogotá todavía es el 30 de noviembre)
- **Cuando** registra un pago de $1.000 sin `fecha`, una vez sin header y otra con `X-Zona-Horaria: America/Bogota`
- **Entonces** el primero guarda `fecha` `"2026-12-01"` (y `comparacion.mes` `"2026-12"`) y el segundo `"2026-11-30"` (y `"2026-11"`)

#### CA-RF32-12 — La fecha puede ser pasada o futura; debe ser una fecha real

- **Dado** una tarjeta del usuario
- **Cuando** registra pagos con `fecha` `2020-01-15`, `2099-12-31` y `2028-02-29` (año bisiesto)
- **Entonces** los tres responden `201` y guardan esas fechas a las 00:00 UTC

#### CA-RF32-13 — Fecha inválida

- **Dado** una tarjeta del usuario
- **Cuando** envía el pago base con `fecha` `"ayer"`, `"2026-13-01"`, `"2026-02-30"`, `"2027-02-29"`, `"2026/12/05"`, `"2026-12-5"`, `"2026-12-05T10:00:00Z"`, `20261205`, `null` o el texto vacío
- **Entonces** cada una responde `400` con `message` arreglo y un texto que empieza por `fecha`, y no se guarda ninguna transacción

#### CA-RF32-14 — El valor es obligatorio y mayor que cero

- **Dado** una tarjeta del usuario
- **Cuando** envía el pago base sin `valor`, y con `valor` `0`, `-1`, `-0.01`, `"300000"` (texto), `null`, `true`, `[]` y `{}`
- **Entonces** cada una responde `400` con un texto que empieza por `valor` y no se guarda nada

#### CA-RF32-15 — El valor admite hasta dos decimales

- **Dado** una tarjeta del usuario
- **Cuando** envía pagos con `valor` `300000.5`, `0.01` y `1234.56`, y otros con `0.001` y `100.555`
- **Entonces** los tres primeros responden `201` y guardan el valor exacto en la respuesta y en la transacción (`monto`); los dos últimos responden `400` con un texto que empieza por `valor` y no guardan nada (D2)

#### CA-RF32-16 — El valor tiene un tope

- **Dado** una tarjeta del usuario
- **Cuando** envía pagos con `valor` `999999999999` y `1000000000000`
- **Entonces** el primero responde `201` y el segundo `400` con un texto que empieza por `valor` (el mismo `MONTO_MAXIMO` de las transacciones)

#### CA-RF32-17 — El método de pago

- **Dado** una tarjeta del usuario
- **Cuando** envía el pago base sin `metodoPago`, y con `metodoPago` `EFECTIVO`, `DEBITO` y `TRANSFERENCIA`, y otros con `TARJETA_CREDITO`, `PSE`, `transferencia`, el texto vacío, `5` y `null`
- **Entonces** sin `metodoPago` responde `201` con `"TRANSFERENCIA"` (en la respuesta y en la transacción); los tres válidos responden `201` con el método enviado; los demás responden `400` con un texto que empieza por `metodoPago` y no guardan nada (no se paga una tarjeta con otra tarjeta de crédito)

#### CA-RF32-18 — La descripción del pago

- **Dado** una tarjeta del usuario
- **Cuando** registra pagos sin `descripcion`, con `"  Pago de diciembre  "` y con una de 200 caracteres, y otros con `descripcion` vacía, solo espacios, de 201 caracteres, `123` o `null`
- **Entonces** el primero responde `201` con `"Pago de tarjeta"` (en la respuesta y en la transacción); el segundo con `"Pago de diciembre"` (recortada); el tercero con los 200 caracteres; los demás responden `400` con un texto que empieza por `descripcion` y no guardan nada

#### CA-RF32-19 — Campos no declarados y cuerpo vacío

- **Dado** una tarjeta del usuario
- **Cuando** envía el pago base con además `tipo`, `monto`, `clasificacionFlujo`, `tarjetaId`, `usuarioId`, `categoriaId`, `deudaId`, `comparacion` o `foo` (cada uno por separado), y también un cuerpo `{}`
- **Entonces** cada uno responde `400` con un texto que menciona el campo sobrante (el `ValidationPipe` estricto: `property <nombre> should not exist`) y el cuerpo vacío con un texto que empieza por `valor`; no se guarda nada (el cliente no elige el tipo, la clasificación ni la tarjeta)

#### CA-RF32-20 — Tarjeta de otro usuario o inexistente: 404; `tarjetaId` mal formado: 400

- **Dado** la «Visa» del usuario B y un id válido que no existe
- **Cuando** el usuario A envía el pago base a cada una, y a `/tarjetas/no-es-un-id/pagos`
- **Entonces** las dos primeras responden `404` con `Tarjeta no encontrada` (el mismo mensaje, nunca `403`) y no queda ninguna transacción; la tercera `400` con un texto que empieza por `tarjetaId`

#### CA-RF32-21 — Primero se valida el cuerpo y después la tarjeta

- **Dado** la «Visa» del usuario B
- **Cuando** el usuario A envía a esa tarjeta un pago con `valor` `0` y, aparte, el pago base
- **Entonces** el primero responde `400` (texto que empieza por `valor`) y el segundo `404 Tarjeta no encontrada`: un cuerpo inválido no revela si la tarjeta existe (D6)

#### CA-RF32-22 — La ruta exige sesión

- **Dado** una petición sin header `Authorization`, o con un token inválido o vencido
- **Cuando** envía el pago base a `POST /tarjetas/<visa>/pagos`, y también a la tarjeta de otro usuario o con un cuerpo inválido
- **Entonces** todas responden `401` (la sesión se comprueba antes que el cuerpo y que la tarjeta) y no se guarda nada

#### CA-RF32-23 — Repetir con la misma clave de idempotencia no duplica el pago

- **Dado** un pago registrado con `Idempotency-Key` y `201`
- **Cuando** repite la misma petición con la misma clave
- **Entonces** recibe la misma respuesta (mismo `id`) con `Idempotent-Replayed: true` y hay **una sola** transacción de pago (no hay `409`)

#### CA-RF32-24 — La misma clave con otra petición se rechaza

- **Dado** una clave ya usada con el pago base
- **Cuando** se envía con la misma clave un pago con `valor` 1000
- **Entonces** responde `422` y no cambia nada (sigue una sola transacción, la original)

#### CA-RF32-25 — Dos pagos iguales con claves distintas son legítimos

- **Dado** el pago base ya registrado
- **Cuando** envía el mismo pago con otra `Idempotency-Key` (o sin ninguna)
- **Entonces** responde `201` con otro `id`, hay dos transacciones y `comparacion.pagado` es 600000 (no se deduplica por contenido: son dos pagos parciales)

#### CA-RF32-26 — Si falla el guardado, no queda nada y la clave se libera

- **Dado** un entorno en el que el guardado de la transacción falla
- **Cuando** envía el pago base con una `Idempotency-Key`
- **Entonces** responde `500` y no queda ninguna transacción; al repetir la misma petición con la misma clave cuando el fallo desaparece, se registra una sola vez (`201`)

#### CA-RF32-27 — Con `IDEMPOTENCIA_OBLIGATORIA` activada, el header es obligatorio

- **Dado** la variable `IDEMPOTENCIA_OBLIGATORIA=true` y una tarjeta del usuario
- **Cuando** envía el pago base sin `Idempotency-Key`, y otro con una clave
- **Entonces** el primero responde `400` y no guarda nada; el segundo responde `201`

#### CA-RF32-28 — Una zona horaria inválida se rechaza siempre

- **Dado** una tarjeta del usuario
- **Cuando** envía el pago base (con `fecha`) y otro sin `fecha`, ambos con `X-Zona-Horaria: Zona/Invalida`
- **Entonces** ambos responden `400` con un texto que empieza por `X-Zona-Horaria` y no guardan nada

#### Comparar con el total del mes (`GET /tarjetas/:tarjetaId/proyeccion`)

Esta parte **agrega** campos al nivel superior de la respuesta de 5.3.1 (D3); las filas de `proyeccion` no cambian.

#### CA-RF32-29 — La proyección muestra lo pagado y la diferencia, y coincide con la del `POST`

- **Dado** la tarjeta «Visa» con el escenario base y el pago base registrado por la API
- **Cuando** consulta la proyección de `mes=2026-12`
- **Entonces** el nivel superior trae `pagado` 300000 y `diferencia` `−46270.050165` (6 decimales), y esos dos valores son iguales (`toBeCloseTo`, 9 decimales) a `comparacion.pagado` y `comparacion.diferencia` de la respuesta del `POST`; `total` es `346270.050165`: es el `estimado` de `comparacion`

#### CA-RF32-30 — Sin pagos, `pagado` es 0 y la diferencia es el total completo

- **Dado** la tarjeta «Visa» con el escenario base y sin pagos
- **Cuando** consulta `mes=2026-12` y `mes=2099-12`
- **Entonces** en el primero `pagado` es 0 y `diferencia` `−346270.050165`; en el segundo `pagado` 0 y `diferencia` `−55000` (`total` 55.000, solo los cargos activos, D3 de 5.3.1); en ningún caso falta el campo ni es `null`

#### CA-RF32-31 — Solo cuentan los pagos del mes consultado

- **Dado** la tarjeta «Visa» con el escenario base y pagos registrados de $40.000 el `2026-11-30`, de $100.000 el `2026-12-01`, de $200.000 el `2026-12-31` y de $50.000 el `2027-01-01`
- **Cuando** consulta `mes=2026-11`, `mes=2026-12` y `mes=2027-01`
- **Entonces** `pagado` es 40000, 300000 y 50000, y `diferencia` `−15000` (total 55.000), `−46270.050165` y `−214543.218234` (total `264543.218234`)

#### CA-RF32-32 — El dinero recibido de un avance y los pagos de otra tarjeta no cuentan como pagado

- **Dado** la tarjeta «Visa» con el escenario base (con el avance B registrado por `POST …/avances`: su transacción `DINERO_RECIBIDO` lleva el `tarjetaId` de «Visa»), un pago de $700.000 de «Débito» en 2026-12 y ningún pago de «Visa»
- **Cuando** consulta la proyección de «Visa» con `mes=2026-12`
- **Entonces** `pagado` es 0 y `diferencia` `−346270.050165`

#### CA-RF32-33 — Los pagos no cambian el total estimado, el saldo ni las filas de la proyección

- **Dado** la tarjeta «Visa» con el escenario base y la proyección de `mes=2026-12` ya consultada
- **Cuando** registra el pago base y vuelve a consultar
- **Entonces** `cuotas`, `cargosFijos`, `total` y `saldoPendiente` (`1766528.890201`) del nivel superior y **todos** los elementos de `proyeccion` son idénticos a los de antes, y cada fila de `proyeccion` conserva exactamente sus cinco claves (`mes`, `cuotas`, `cargosFijos`, `total`, `saldoPendiente`): el pago no se descuenta del saldo (D5)

#### CA-RF32-34 — La forma del nivel superior de la proyección crece con `pagado` y `diferencia` (modifica CA-RF30-18)

- **Dado** el escenario base
- **Cuando** consulta `GET /tarjetas/<visa>/proyeccion?mes=2026-12`
- **Entonces** el nivel superior trae **exactamente** las claves `tarjetaId`, `mes`, `cuotas`, `cargosFijos`, `total`, `saldoPendiente`, `pagado`, `diferencia` y `proyeccion` (antes, sin `pagado` ni `diferencia`); `pagado` y `diferencia` son números

> Modifica un criterio ya aprobado: CA-RF30-18 (5.3.1) dice «exactamente las claves…» y su prueba compara el nivel superior con siete claves. Con la opción recomendada de D3 esa prueba debe pasar a nueve claves; **requiere la aprobación expresa del desarrollador** (como la de CA-RF26-02 en 5.2.3). Con otra opción de D3 este criterio y CA-RF32-29 a 33 cambian de ruta o se eliminan y no se toca ninguna prueba aprobada.

#### Listar (`GET /tarjetas/:tarjetaId/pagos`)

#### CA-RF32-35 — La lista de pagos: forma y orden

- **Dado** «Visa» con tres pagos creados por la API: $1.000 el `2026-11-30`, $2.000 el `2026-12-05` y $3.000 el `2026-12-05` (este último creado después)
- **Cuando** envía `GET /tarjetas/<visa>/pagos`
- **Entonces** responde `200` con `{ items }` de tres pagos en este orden: $3.000, $2.000 y $1.000 (fecha descendente y, a igual fecha, el creado después primero); cada uno con **exactamente** `id`, `tarjetaId`, `valor`, `fecha`, `metodoPago`, `descripcion` y `creadaEn` (sin `comparacion`, `usuarioId`, `_id` ni `__v`)

#### CA-RF32-36 — Solo los pagos de esa tarjeta

- **Dado** «Visa» con un pago de la API, y en la base: un pago de «Débito» del mismo usuario, un pago del usuario B, el avance de «Visa» (transacción `DINERO_RECIBIDO` con su `tarjetaId`), un egreso ordinario y un abono a una deuda
- **Cuando** lista los pagos de «Visa»
- **Entonces** `items` trae **solo** el pago de «Visa»

#### CA-RF32-37 — Filtro por mes y consulta inválida

- **Dado** «Visa» con pagos el `2026-11-30`, el `2026-12-05` y el `2027-01-01`
- **Cuando** lista con `?mes=2026-12`, con `?mes=2026-13`, `?mes=2026-1`, `?mes=` y `?mes=2026-12&mes=2027-01`, y con `?mes=2026-12&foo=1`
- **Entonces** el primero responde `200` con solo el del `2026-12-05`; los de formato inválido, el repetido y el parámetro no declarado responden `400` con un texto que empieza por `mes` (los cuatro primeros) o por `foo` (el último)

#### CA-RF32-38 — Sin pagos: lista vacía

- **Dado** una tarjeta del usuario sin pagos
- **Cuando** lista sus pagos
- **Entonces** responde `200` con `{ "items": [] }` (no es `404`)

#### CA-RF32-39 — La lista exige sesión y una tarjeta propia

- **Dado** la «Visa» del usuario B y un id válido que no existe
- **Cuando** el usuario A lista los pagos de cada una, lista `/tarjetas/no-es-un-id/pagos`, lista la de B con `mes=2026-13`, y una petición sin sesión lista los de la tarjeta de A
- **Entonces** `404 Tarjeta no encontrada` (ambas, nunca `403`, sin ningún dato de B), `400` (texto que empieza por `tarjetaId`), `400` (texto que empieza por `mes`: la consulta inválida va antes que la tarjeta) y `401`

#### CA-RF32-40 — Listar no guarda nada ni usa la idempotencia

- **Dado** «Visa» con pagos y `IDEMPOTENCIA_OBLIGATORIA=true`
- **Cuando** lista varias veces, con y sin `Idempotency-Key`
- **Entonces** todas responden `200` con el mismo cuerpo, sin `Idempotent-Replayed`, sin guardar ninguna clave, y las colecciones de transacciones, tarjetas, compras y cargos quedan idénticas

#### Eliminar (`DELETE /tarjetas/:tarjetaId/pagos/:id`)

#### CA-RF32-41 — Eliminar un pago elimina su transacción y solo la suya

- **Dado** «Visa» con dos pagos idénticos al pago base (mismo valor, fecha y descripción, con claves distintas: `pagado` de `mes=2026-12` = 600000), el avance B (con su transacción de dinero recibido) y un egreso ordinario
- **Cuando** elimina uno de los pagos con `DELETE`, y luego repite el mismo `DELETE`
- **Entonces** el primero responde `204` sin cuerpo; queda un pago (el otro), el avance con su transacción y el egreso ordinario intactos; la proyección de `mes=2026-12` pasa de `pagado` 600000 a 300000; repetir el `DELETE` responde `404 Pago no encontrado`

#### CA-RF32-42 — Solo se elimina un pago propio de esa tarjeta: 404 en los demás casos

- **Dado** «Visa» y «Débito» del usuario A con un pago cada una; la «Visa» del usuario B con un pago; el avance de «Visa» (su transacción `DINERO_RECIBIDO`) y un egreso ordinario de A
- **Cuando** A envía `DELETE /tarjetas/<visa>/pagos/<id>` con: un id válido que no existe, el id del pago de B, el id del pago de «Débito», el id de la transacción del avance y el id del egreso ordinario
- **Entonces** todos responden `404` con `Pago no encontrado` y ninguna transacción cambia (solo se eliminan pagos de la tarjeta de la ruta)

#### CA-RF32-43 — Tarjeta ajena, ids mal formados y sesión al eliminar

- **Dado** la «Visa» del usuario B con un pago, y un id de tarjeta válido que no existe
- **Cuando** el usuario A envía `DELETE` con la tarjeta de B y el id de su pago, con la tarjeta inexistente, con `tarjetaId` `no-es-un-id` o con `id` `no-es-un-id` (sobre una tarjeta propia), y una petición sin sesión
- **Entonces** `404 Tarjeta no encontrada` (los dos primeros: el pago de B sigue existiendo), `400` con un texto que empieza por `tarjetaId` y otro por `id`, y `401`; el `400` y el `401` van antes que cualquier búsqueda

#### Los pagos entre las demás transacciones y las demás reglas de la tarjeta

#### CA-RF32-44 — El pago aparece en `GET /transacciones` y solo se gestiona desde la tarjeta

- **Dado** el pago base registrado por la API
- **Cuando** el usuario lista `GET /transacciones`, y envía `PATCH` (con `{ "monto": 1 }`) y `DELETE` a `/transacciones/<id del pago>`
- **Entonces** el listado trae el pago con `tipo` `EGRESO`, `monto` 300000, `fecha` `"2026-12-05"`, `clasificacionFlujo` `PAGO_TARJETA`, `metodoPago` `TRANSFERENCIA`, `categoriaId` `null` y `categoria` `null`; el `PATCH` y el `DELETE` responden `409` y el pago no cambia

#### CA-RF32-45 — Una tarjeta con pagos no se elimina hasta eliminarlos desde la tarjeta

- **Dado** una tarjeta «Débito» sin compras con un pago registrado por la API
- **Cuando** envía `DELETE /tarjetas/<débito>`, elimina el pago con `DELETE …/pagos/<id>` y repite el `DELETE` de la tarjeta; y, aparte, lo intenta con una tarjeta que tiene un pago y una compra
- **Entonces** el primero responde `409` con `No se puede eliminar una tarjeta que ya tiene pagos registrados` y no borra nada; después de eliminar el pago, `204`; con pago y compra responde `409` con `No se puede eliminar una tarjeta que ya tiene compras registradas` (prioridad de las compras, 5.2.3 D17)

#### CA-RF32-46 — Al eliminar la cuenta no queda ningún pago del usuario

- **Dado** un usuario con un pago registrado por la API y otro usuario con el suyo
- **Cuando** el primero elimina su cuenta (`DELETE /usuarios/me`, RF-04)
- **Entonces** no queda ninguna transacción con su `usuarioId` y el pago del otro usuario sigue intacto

#### CA-RF32-47 — Eliminar compras, avances o cargos no toca los pagos

- **Dado** «Visa» con la compra C, el avance B (registrado por la API) y un cargo fijo, y el pago base registrado
- **Cuando** elimina la compra C, el avance B y el cargo fijo con sus `DELETE`
- **Entonces** el pago sigue existiendo con los mismos datos, `GET …/pagos` lo sigue listando y la comparación de `mes=2026-12` conserva `pagado` 300000 (solo cambia el estimado, porque cambiaron las cuotas y los cargos)

#### Efecto en los reportes (`/reportes`)

Las consultas usan los endpoints de reportes que ya existen; el pago siempre se registra con `POST …/pagos`.

#### CA-RF32-48 — El pago afecta el balance del mes del pago (criterio de la EDT)

- **Dado** un usuario sin otros movimientos y el pago base registrado el `2026-12-05`
- **Cuando** consulta `GET /reportes/periodo?mes=2026-12`, `?mes=2026-11` y `?mes=2027-01`
- **Entonces** en `2026-12`: `pagosTarjeta` 300000, `egresos` 0, `ingresos` 0, `dineroRecibido` 0 y `balance` −300000; en `2026-11` y `2027-01` todo es 0 (el pago es del mes en que se hizo)

#### CA-RF32-49 — El pago se combina con los demás movimientos del mes

- **Dado** un ingreso de $2.000.000 en «Salario» el `2026-12-01`, un egreso ordinario de $50.000 en «Hogar» el `2026-12-10` y el pago base ($300.000, `2026-12-05`)
- **Cuando** consulta `GET /reportes/periodo?mes=2026-12`
- **Entonces** `ingresos` 2000000, `egresos` 50000, `pagosTarjeta` 300000 y `balance` 1650000 (2.000.000 − 50.000 − 300.000)

#### CA-RF32-50 — El pago no aparece en el gasto por categoría (criterio de la EDT)

- **Dado** el pago base y, en otra corrida, además el egreso ordinario de $50.000 en «Hogar» del `2026-12-10`
- **Cuando** consulta `GET /reportes/categorias?mes=2026-12` en cada corrida
- **Entonces** con solo el pago: `total` 0 y `categorias` `[]`; con el egreso: `total` 50000 y una sola categoría, «Hogar», de 50000 y 100 %: el pago no se cuenta por categoría ni en «Sin categoría» (no se cuenta dos veces, ADR-014)

#### CA-RF32-51 — En los reportes el mes del pago es el de su fecha

- **Dado** pagos de $1.000 el `2026-12-31` y de $2.000 el `2027-01-01`
- **Cuando** consulta `GET /reportes/periodo?mes=2026-12` y `?mes=2027-01`
- **Entonces** `pagosTarjeta` y `balance` son 1000 y −1000 en `2026-12`, y 2000 y −2000 en `2027-01`

#### CA-RF32-52 — La evolución y la comparación del balance incluyen el pago

- **Dado** el pago base registrado el `2026-12-05` y ningún otro movimiento
- **Cuando** consulta `GET /reportes/evolucion?desde=2026-12&hasta=2026-12`, `GET /reportes/comparacion?tipo=balance` y `…?tipo=ingresos-egresos`
- **Entonces** la evolución trae el punto `2026-12` con `balance` −300000; la comparación de balance trae `2026-12` con `balance` −300000; la de ingresos y egresos trae `2026-12` con `ingresos` 0 y `egresos` 0 (el pago no es gasto propio)

#### CA-RF32-53 — La compra con tarjeta no mueve el balance; su pago sí

- **Dado** «Visa» con la compra de referencia registrada por la API (A: $1.254.700 a 12 cuotas, `fecha` `2026-11-10`, `primerPago` `2026-12`) y sin otros movimientos
- **Cuando** consulta `GET /reportes/periodo?mes=2026-11`; luego registra un pago de $119.802,13 el `2026-12-05` y consulta `?mes=2026-11` y `?mes=2026-12`
- **Entonces** `2026-11` queda con `balance` 0 y `egresos` 0 antes y después del pago (la compra no afecta el balance el día de la compra) y `2026-12` queda con `pagosTarjeta` 119802.13 y `balance` −119802.13 (lo afecta el pago de la tarjeta, ADR-014)

#### CA-RF32-54 — Eliminar el pago revierte el balance

- **Dado** el pago base y el ingreso y el egreso de CA-RF32-49
- **Cuando** elimina el pago con `DELETE …/pagos/<id>` y consulta `GET /reportes/periodo?mes=2026-12`
- **Entonces** `pagosTarjeta` es 0 y `balance` 1950000 (2.000.000 − 50.000)

---

### Documentación Swagger

`src/common/swagger.spec.ts` descubre todos los controladores y fallará si alguna de las tres rutas nuevas o sus DTO (de entrada, de salida y de query) no tiene etiqueta (`tarjetas`), resumen, descripción detallada, respuestas de error (`400`, `401`, `404`, `409`, `422` y `500` según apliquen) y `description` + `example` en cada propiedad (incluidas las dos nuevas de la proyección, `pagado` y `diferencia`); además, `POST …/pagos`, que responde `201`, debe documentar el header `Idempotency-Key`, y documenta `X-Zona-Horaria` (`ApiZonaHoraria`) porque decide la `fecha` por defecto. `GET …/pagos` y `DELETE …/pagos/:id` **no** documentan `Idempotency-Key`. La descripción de `POST …/pagos` debe explicar, para que otro desarrollador no tenga que leer el código: que el pago es un egreso guardado como transacción `PAGO_TARJETA` sin categoría; que afecta el balance del mes de su `fecha` y **no** el gasto por categoría (ADR-014); que una compra con tarjeta no es un pago ni mueve el balance; el significado de `comparacion` (`estimado` = total estimado del mes, `pagado` = suma de los pagos de esa tarjeta en el mes, `diferencia = pagado − estimado`: negativa falta, positiva pagó de más) y que el mes es el de la `fecha`; que se puede pagar menos o más y en partes; que no descuenta el `saldoPendiente`; los valores permitidos de `metodoPago` (y su valor por defecto) y por qué no `TARJETA_CREDITO`; el máximo de 2 decimales y el tope de `valor`; la `fecha` por defecto y `X-Zona-Horaria`; que un pago equivocado se elimina y se registra de nuevo; la idempotencia y el orden de las comprobaciones. Deben actualizarse: la descripción de `GET /tarjetas/:tarjetaId/proyeccion` (hoy dice «No considera pagos de la tarjeta… llegan con RF-32») para explicar `pagado` y `diferencia` y que `cuotas`, `total` y `saldoPendiente` siguen sin considerarlos; el esquema `ProyeccionRespuestaDto` (dos propiedades nuevas, solo en el nivel superior); la descripción de `DELETE /tarjetas/:id` («para eliminarla primero hay que eliminar esos pagos»: ahora con `DELETE …/pagos/:id`); y la descripción general de la etiqueta `tarjetas` en `src/common/swagger.ts` para mencionar los pagos, su comparación y que un pago solo se edita o elimina desde la tarjeta (en `/transacciones` responde `409`). Debe existir un esquema de error para `404 Pago no encontrado` en `src/common/dto/error-respuesta.dto.ts`. Los criterios CA-RF32-13 a 22 y 39 a 43 fijan los códigos de error que deben documentarse.

---

## Índice de criterios del paquete 5.3.2

- **RF-32:** CA-RF32-01 a CA-RF32-54. Registrar: 01 a 28 (forma y comparación: 01; transacción guardada: 02; comparación y sumas: 03 a 10; fecha: 11 a 13; valor: 14 a 16; método y descripción: 17 y 18; campos no declarados: 19; tarjeta y orden: 20 y 21; sesión: 22; idempotencia: 23 a 27; zona: 28); comparar en la proyección: 29 a 34; listar: 35 a 40; eliminar: 41 a 43; transacciones y reglas de la tarjeta: 44 a 47; reportes: 48 a 54.
- **Total:** 54 criterios, todos **[HTTP]** (D11). Modifica un criterio ya aprobado: CA-RF30-18 (por CA-RF32-34).

### Criterios con «Pendiente de decisión»

Ninguno de los criterios usa la marca, porque cada regla no definida por un RF o ADR es una decisión de arriba (D1 a D13) que el desarrollador debe aprobar. Reglas que dependen de ellas: D1 (la ruta de todos los criterios y la categoría `null`: CA-RF32-02, 44), D2 (cuerpo y validaciones: CA-RF32-11 a 19, 28), D3 (comparación: CA-RF32-01, 03 a 10, 29 a 34), D4 (listar, eliminar, sin editar: CA-RF32-35 a 45), D5 (CA-RF32-05 a 07, 33), D6 (CA-RF32-20 a 22, 39, 42, 43), D7 (CA-RF32-45 a 47), D8 (CA-RF32-48 a 54), D9 (CA-RF32-23 a 28), D10 (formas), D11 (capas) y D13 (los valores por confirmar).

### Valores y reglas por confirmar con la hoja del promotor

La hoja no está disponible; el único valor verificado contra ella es $1.254.700 a 12 cuotas con E.A. 29,21 % → $119.802,13. Las cifras de este paquete salen de la fórmula de `CLAUDE.md` sección 5 y de restar el pago al total estimado de 5.3.1; **conviene contrastarlas con la hoja** antes de aprobar:

1. **Qué se compara con lo pagado (D3).** El total estimado del mes (cuotas vigentes + cargos fijos activos) frente a la suma de los pagos del mes, o solo las cuotas. RF-32 dice «el total estimado del mes», que es el de RF-30 (con cargos).
2. **Signo y nombre de la diferencia (D3).** `pagado − estimado` (negativa = falta por pagar) frente a «pendiente = estimado − pagado». Cambia el signo de todos los valores de CA-RF32-01 a 10 y 29 a 31.
3. **Si un pago de un mes puede cubrir cuotas de otros meses o descontar el saldo (D5).** Hoy no: se compara solo con el mes de su fecha y el saldo no cambia.
4. **Decimales y redondeo del pago (D2).** 2 decimales para el valor pagado; el estimado llega sin redondear (la diferencia de pagar $346.270 contra el estimado de CA-RF32-06 es `−0.050165`). Si la hoja redondea el estimado al peso antes de comparar, la diferencia sería 0 en ese caso.
5. **Método de pago por defecto (D2).** `TRANSFERENCIA`: sin fuente; si el frontend prefiere pedirlo, pasa a obligatorio y solo cambia CA-RF32-17.
6. **Cargos fijos en meses distintos del actual (D3 de 5.3.1).** El `estimado` de un mes pasado o futuro usa los cargos activos de hoy (no hay historial): lo hereda este paquete.
