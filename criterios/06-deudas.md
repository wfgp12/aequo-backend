# Criterios de aceptación — 6. Deudas

Estado: Aprobado (2026-11-26)

## Paquete 6.1.1 — Modelar entidad Deuda (RF-34, RF-36)

Aprobado por el desarrollador el 2026-11-26.

### Alcance

Entra **solo la entidad** (esquema Mongoose) `Deuda`, colección `deudas`, y su registro en un `DeudasModule` importado por la aplicación. Criterio del tablero: «El monto prestado y lo abonado se obtienen de las transacciones asociadas, no de campos duplicados (ADR-014)».

**No** entran: los endpoints de deudas y el registro de préstamos (6.1.2, incluido sumar montos, RF-35), el cálculo de intereses y saldo (6.1.3) ni los abonos y la consulta del estado (6.2.x, RF-37 y RF-38). Como no hay endpoints, los casos 400, 404 (datos de otro usuario) y 409 son de 6.1.2. Los criterios se prueban sin base de datos (`validateSync()` o `validate()` sobre un modelo creado con el esquema y lectura de `schema.indexes()`, como en 5.1.1 y 5.2.1).

### Fuentes

- RF-34: «registrar un préstamo recibido indicando a quién se le debe, el monto y la fecha, reflejándolo como dinero disponible sin contarlo como ingreso propio». El monto y la fecha son de la transacción, no de la deuda.
- RF-36: «indicar si un préstamo es sin intereses o si genera intereses, ya sea mediante una tasa o un monto fijo».
- RF-35 y CU-19 (paso 2 y alternativo 2a: «Ya existe una deuda con esa persona: el monto se suma a la deuda existente»). CU-20 alternativo 3a: «El abono deja el saldo en cero: el sistema marca la deuda como saldada».
- Modelo lógico y diagrama de clases (Documento de Diseño Técnico): `deudas` = `usuarioId` (FK, index), `acreedor: String`, `tipoInteres: TipoInteres`, `valorInteres: Number`, `saldada: Boolean`. `TipoInteres` = `SIN_INTERES`, `TASA`, `MONTO_FIJO`. `transacciones.deudaId` (FK opcional).
- ADR-014: «acreedor (texto libre), tipo de interés (sin interés, tasa o monto fijo), su valor y estado. El monto prestado y lo abonado no se guardan: se calculan a partir de las transacciones asociadas». Montos en pesos colombianos, precisión completa (RNF-11).
- ADR-001 (referencias por `ObjectId`), `CLAUDE.md` (campo `usuarioId`, entidades anémicas, enumeraciones cerradas en el esquema).

### Contrato de nombres (aprobado, D1)

- Entidad `Deuda` y esquema `DeudaSchema` en `src/deudas/deuda.schema.ts`; colección `deudas`; `timestamps: true`.
- Enumeración `TipoInteres` en `src/deudas/deuda.enums.ts`. Las pruebas usan los textos, no importan la enumeración.
- `DeudasModule` en `src/deudas/deudas.module.ts`, que registra el modelo con el nombre `Deuda` (el mismo `ref` que ya declara `transacciones.deudaId`); `AppModule` lo importa.

| Campo | Tipo | Obligatorio | Por defecto | Reglas |
|---|---|---|---|---|
| `usuarioId` | ObjectId, ref `Usuario` | sí | — | |
| `acreedor` | String | sí | — | recorta espacios, de 1 a 50 (D3) |
| `tipoInteres` | `TipoInteres` | sí | `SIN_INTERES` (D5) | enumeración cerrada |
| `valorInteres` | Number | sí | `0` | depende de `tipoInteres` (D6 a D8) |
| `saldada` | Boolean | sí | `false` (D10) | |

### Decisiones aprobadas por el desarrollador (2026-11-26)

El desarrollador aprobó la opción recomendada en D1 a D11; los criterios de abajo ya la reflejan. Ninguna está definida del todo en un RF ni en un ADR.

> **D7 queda por confirmar con la hoja de cálculo antes del paquete 6.1.3.** No afecta este esquema.

- **D1 — Nombres, archivos y módulo.** (a) **Recomendada:** los del contrato de arriba, un módulo propio `deudas`, como `tarjetas`. (b) Registrar el modelo en `TarjetasModule` o `TransaccionesModule` (mezcla responsabilidades).
- **D2 — Campos.** (a) **Recomendada:** exactamente los cinco del modelo lógico; sin fecha, monto, descripción, saldo ni intereses (la fecha y la descripción están en cada transacción). (b) Agregar `descripcion` o una fecha de la deuda: ningún RF los pide.
- **D3 — `acreedor`.** (a) **Recomendada:** obligatorio, con recorte, máximo 50 (el tope del nombre de la tarjeta). (b) Máximo 100. (c) Sin tope. No hay fuente para el tope.
- **D4 — Deudas repetidas con la misma persona.** (a) **Recomendada:** como máximo **una deuda activa** (`saldada: false`) por usuario y acreedor, sin distinguir mayúsculas, con un índice único parcial; las saldadas no estorban. Cumple CU-19 2a sin ambigüedad. Costo: no permite a la vez dos préstamos de la misma persona con condiciones de interés distintas, y reabrir una saldada cuando ya hay otra activa chocaría con el índice (lo debe resolver 6.1.2 o 6.2.1). (b) Única siempre por usuario y acreedor: un préstamo nuevo reabre la deuda vieja y hereda su interés. (c) Sin unicidad: el usuario elige a qué deuda sumar (CU-19 paso 2) y se permiten condiciones distintas; 2a quedaría como sugerencia de la pantalla. En (a) y (b), «José» y «Jose» siguen siendo distintos (se distinguen tildes, como en las tarjetas).
- **D5 — `tipoInteres` sin indicar.** (a) **Recomendada:** `SIN_INTERES` por defecto; `null` se rechaza. Olvidar copiarlo cuando sí hay interés no pasa en silencio, porque un valor distinto de 0 se rechaza (D8). (b) Obligatorio sin valor por defecto.
- **D6 — Cómo se guarda el valor de una tasa.** (a) **Recomendada:** fracción (2 % = `0,02`), mayor que 0 y hasta 1 inclusive, igual que `tasaEA` de la tarjeta; el tope atrapa el error de enviar `2` por 2 %. La tasa 0 se rechaza: «sin interés» ya tiene su tipo (la tarjeta sí admite 0). (b) Porcentaje de 0 a 100. (c) Igual que (a) pero admitiendo 0.
- **D7 — Qué significa la tasa (periodo y fórmula).** No cambia el esquema con ninguna opción de fracción, pero fija lo que se pide al usuario y bloquea 6.1.3. (a) **Recomendada:** tasa **mensual** simple sobre el saldo de capital, como se suele pactar un préstamo entre personas. (b) Efectiva anual, como las tarjetas (reutiliza `i = (1 + EA)^(1/12) − 1`). (c) Porcentaje único sobre lo prestado, sin tiempo. **El desarrollador debe confirmarlo contra su hoja de cálculo** (no está en `../docs`). Tampoco está definido desde qué fecha corre el interés, si es simple o compuesto, ni si el monto fijo es total o por mes.
- **D8 — `valorInteres` según el tipo.** (a) **Recomendada:** `SIN_INTERES` exige exactamente `0`; `MONTO_FIJO` exige un número finito mayor que 0, en pesos, sin tope y con decimales; `TASA` según D6. Por defecto `0`, `null` se rechaza. (b) `null` cuando no hay interés. (c) Ignorar el valor cuando no hay interés (permite datos basura).
- **D9 — Dónde se valida la relación entre tipo y valor.** (a) **Recomendada:** en el esquema, porque el rango de un campo de dinero depende del otro y así ningún escritor futuro la salta; también al cambiar solo el tipo de una deuda guardada. (b) En el servicio (6.1.2), como las reglas entre campos de `Transaccion`; el esquema solo exigiría `valorInteres >= 0` y los criterios CA-RF36-04 a 07 y 09 pasarían a 6.1.2.
- **D10 — Estado de la deuda.** (a) **Recomendada:** `saldada` lógico guardado (modelo lógico, CU-20 3a), obligatorio, `false` por defecto, `null` rechazado (un `null` se saldría del índice de D4). Quién lo cambia es de 6.1.2 y 6.2.1. (b) No guardarlo y calcularlo del saldo: no puede desincronizarse, pero contradice el modelo lógico y hace imposible el índice parcial de D4 (a).
- **D11 — Índices.** (a) **Recomendada:** en `deudas`, un índice por `usuarioId` (listar todas) y el único parcial de D4; **no** agregar índice a `transacciones.deudaId` (el modelo lógico no lo marca y las consultas ya filtran por usuario). (b) Agregar además `{ deudaId: 1 }` en `transacciones` para el saldo de 6.1.3.

---

## RF-34 — Registrar préstamos recibidos

### CA-RF34-01 — Una deuda válida se acepta y conserva sus valores

- **Dado** un `usuarioId` válido
- **Cuando** se crea una deuda con `acreedor` «Juan Pérez», sin indicar tipo de interés, valor ni estado
- **Entonces** la validación no reporta errores y el documento tiene ese usuario y acreedor, `tipoInteres` `SIN_INTERES`, `valorInteres` 0 y `saldada` `false`

### CA-RF34-02 — La deuda no guarda montos calculables

- **Dado** el esquema de la deuda
- **Cuando** se listan sus campos y se crea una deuda enviando además `monto`, `montoPrestado`, `abonado`, `saldo`, `intereses` y `fecha`
- **Entonces** los campos son exactamente `usuarioId`, `acreedor`, `tipoInteres`, `valorInteres` y `saldada` (más `_id`, `__v`, `createdAt` y `updatedAt`) y los datos de más no quedan en el documento (ADR-014)

> Decisión aprobada: D2.

### CA-RF34-03 — Colección y fechas de creación y modificación

- **Dado** el esquema de la deuda
- **Cuando** se leen sus opciones
- **Entonces** la colección es `deudas` y `timestamps` está activo

### CA-RF34-04 — `usuarioId` es una referencia a usuario, llamada exactamente así

- **Dado** el esquema de la deuda
- **Cuando** se inspecciona `usuarioId`
- **Entonces** es `ObjectId` con referencia a `Usuario` (ADR-001, RF-04)

### CA-RF34-05 — Sin usuario no hay deuda

- **Dado** una deuda con lo demás válido
- **Cuando** `usuarioId` falta, es `null` o es `no-es-un-id`
- **Entonces** la validación falla solo en `usuarioId`

### CA-RF34-06 — El acreedor es obligatorio y se recorta

- **Dado** una deuda con lo demás válido
- **Cuando** `acreedor` falta, es `null`, vacío o solo espacios
- **Entonces** la validación falla solo en `acreedor`; y con «  Juan Pérez  » se acepta y queda «Juan Pérez»

### CA-RF34-07 — Largo máximo del acreedor

- **Dado** una deuda con lo demás válido
- **Cuando** `acreedor` tiene 50 caracteres, 50 rodeados de espacios, o 51
- **Entonces** los dos primeros se aceptan y el de 51 falla solo en `acreedor`

> Decisión aprobada: D3.

### CA-RF34-08 — Estado saldada

- **Dado** una deuda con lo demás válido
- **Cuando** `saldada` no se indica, es `true`, es `null` o es el texto `quizás`
- **Entonces** sin indicarla vale `false`, `true` se acepta, y `null` y `quizás` fallan solo en `saldada`

> Decisión aprobada: D10.

### CA-RF34-09 — Índice para listar las deudas del usuario

- **Dado** el esquema de la deuda
- **Cuando** se leen sus índices
- **Entonces** hay un índice no único `{ usuarioId: 1 }`

> Decisión aprobada: D11.

### CA-RF34-10 — Una sola deuda activa por persona (RF-35, CU-19 2a)

- **Dado** el esquema de la deuda
- **Cuando** se leen sus índices
- **Entonces** hay un índice único `{ usuarioId: 1, acreedor: 1 }`, con filtro parcial `{ saldada: false }` e intercalación `{ locale: 'es', strength: 2 }`: «juan» y «Juan» son la misma persona, otro usuario puede tener su propio «Juan» y una deuda saldada no impide una nueva

> Decisión aprobada: D4.

### CA-RF34-11 — Los préstamos y abonos se asocian a la deuda desde la transacción

- **Dado** el modelo `Transaccion` que ya existe
- **Cuando** se validan un préstamo (`INGRESO`, `DINERO_RECIBIDO`, $500.000, sin categoría) y un abono (`EGRESO`, `ABONO_DEUDA`, $100.000, sin categoría) con el mismo `deudaId`
- **Entonces** ambos son válidos, conservan `deudaId`, y `deudaId` es un `ObjectId` con referencia a `Deuda`: de ahí salen lo prestado y lo abonado (su cálculo es de 6.1.3)

> Nota: esto ya se cumple en `develop`; la prueba nacerá en verde y protege el criterio del tablero.

### CA-RF34-12 — El módulo registra el modelo y la aplicación lo carga

- **Dado** `DeudasModule`
- **Cuando** se compila el módulo y se revisan las importaciones de `AppModule`
- **Entonces** `DeudasModule` registra el modelo `Deuda` y `AppModule` importa `DeudasModule` (sin esto, eliminar la cuenta dejaría las deudas huérfanas)

> Decisión aprobada: D1.

### CA-RF34-13 — Eliminar la cuenta borra las deudas del usuario (RF-04)

- **Dado** dos deudas del usuario (una activa y otra saldada) y una de otro usuario
- **Cuando** el usuario llama `DELETE /usuarios/me`
- **Entonces** responde 204, se borran sus dos deudas y la del otro usuario queda intacta

---

## RF-36 — Tipo de interés de un préstamo

### CA-RF36-01 — Las tres formas de interés se aceptan

- **Dado** una deuda con usuario y acreedor válidos
- **Cuando** se crea con `SIN_INTERES` y 0, con `TASA` y `0,02`, o con `MONTO_FIJO` y 150000
- **Entonces** las tres son válidas y conservan tipo y valor exactos, sin redondear

> Decisión aprobada: D6 y D7 (significado de `0,02`).

### CA-RF36-02 — Sin indicar interés, la deuda es sin intereses

- **Dado** una deuda sin `tipoInteres` ni `valorInteres`
- **Cuando** se crea
- **Entonces** es válida, con `SIN_INTERES` y 0

> Decisión aprobada: D5.

### CA-RF36-03 — `TipoInteres` es una enumeración cerrada

- **Dado** el esquema de la deuda
- **Cuando** se leen los valores permitidos y se prueba `PRESTAMO`, `tasa`, vacío, `null` y el número 1
- **Entonces** los permitidos son exactamente `SIN_INTERES`, `TASA` y `MONTO_FIJO`, y cada caso inválido falla en `tipoInteres`

### CA-RF36-04 — Sin intereses, el valor debe ser 0

- **Dado** una deuda `SIN_INTERES`
- **Cuando** `valorInteres` es `0,02`, 150000 o −1, o no se indica el tipo y el valor es `0,02`
- **Entonces** cada una falla solo en `valorInteres`

> Decisión aprobada: D8 y D9.

### CA-RF36-05 — Límites de la tasa

- **Dado** una deuda `TASA`
- **Cuando** el valor es `0,0001` o 1, y aparte 0, `−0,02`, `1,01` o 2
- **Entonces** `0,0001` y 1 se aceptan; los demás fallan solo en `valorInteres`

> Decisión aprobada: D6.

### CA-RF36-06 — La tasa y el monto fijo exigen un valor

- **Dado** una deuda `TASA` o `MONTO_FIJO`
- **Cuando** no se indica `valorInteres`
- **Entonces** falla solo en `valorInteres`

### CA-RF36-07 — Límites del monto fijo

- **Dado** una deuda `MONTO_FIJO`
- **Cuando** el valor es `0,01`, `150000,50` o 25000000, y aparte 0 o −1
- **Entonces** los tres primeros se aceptan sin redondear y 0 y −1 fallan solo en `valorInteres`

> Decisión aprobada: D8.

### CA-RF36-08 — El valor del interés debe ser un número finito

- **Dado** una deuda de cualquiera de los tres tipos
- **Cuando** `valorInteres` es `null`, el texto `abc` o infinito
- **Entonces** cada una falla solo en `valorInteres`

### CA-RF36-09 — Cambiar el tipo sin ajustar el valor se rechaza

- **Dado** una deuda ya guardada con `TASA` y `0,02`, y otra con `MONTO_FIJO` y 150000
- **Cuando** se cambia solo `tipoInteres` (la primera a `SIN_INTERES`, la segunda a `TASA`) y se valida el documento
- **Entonces** ambas fallan en `valorInteres`

> Decisión aprobada: D9.

---

## Lo que los paquetes siguientes necesitarán del modelo

- **6.1.2 (préstamos):** crear la deuda y su transacción `INGRESO` `DINERO_RECIBIDO` con `deudaId`; buscar la deuda activa del acreedor o elegirla por id (D4); decidir qué pasa si el interés del monto nuevo difiere del guardado y qué se hace al prestar sobre una deuda saldada; verificar dueño (404) y traducir el duplicado a 409; `@Idempotente()`.
- **6.1.3 (saldo):** las transacciones por `usuarioId` y `deudaId` (prestado = suma de `DINERO_RECIBIDO`, abonado = suma de `ABONO_DEUDA`), con sus fechas; D7 resuelta y casos de referencia de la hoja.
- **6.2.1 (abonos):** transacción `EGRESO` `ABONO_DEUDA` sin categoría; marcar `saldada`, y decidir si se puede abonar más que el saldo y cuándo se reabre.

## Índice de criterios del paquete 6.1.1

- **RF-34:** CA-RF34-01 a CA-RF34-13.
- **RF-36:** CA-RF36-01 a CA-RF36-09.
- **Total:** 22 criterios.
