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
- Campos, con los nombres del modelo lógico: `usuarioId`, `tarjetaId`, `categoriaId`, `tipo`, `descripcion`, `valor`, `cuotas`, `fecha`, `primerPago`, `tasaEAAplicada` y `cuotaUnicaSinInteres` (decisión D1).
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
14. **Campos que el modelo lógico no trae** (CA-RF26-02). Recomendado: no agregar cuota, interés, saldo, mes del último pago (todo eso se calcula, RNF-11), estado de pagada, ni un `transaccionId` que enlace el avance con su transacción de dinero recibido; ningún RF lo pide. Si 5.2.3 necesita ese enlace para editar o eliminar un avance, se pide como cambio aparte (ADR-003).

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
- **Entonces** son exactamente `usuarioId`, `tarjetaId`, `categoriaId`, `tipo`, `descripcion`, `valor`, `cuotas`, `fecha`, `primerPago`, `tasaEAAplicada` y `cuotaUnicaSinInteres` (más `_id`, `__v`, `createdAt` y `updatedAt`); **no** existe ningún campo de cuota, interés, saldo, mes del último pago, estado de pagada ni de transacción asociada, porque todo eso se calcula (RNF-11) y la entidad es anémica

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

