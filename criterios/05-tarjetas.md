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

