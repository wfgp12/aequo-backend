# Criterios de aceptación — 6. Deudas

Estado: 6.1.1 Aprobado (2026-11-26) · 6.1.2 Aprobado (2026-11-27) · 6.1.3 Aprobado (2026-11-28)

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

---

## Paquete 6.1.2 — Registro de préstamos recibidos (RF-34, RF-35, RF-36)

Estado: **Aprobado** por el desarrollador el 2026-11-27, con la opción recomendada en D1 a D11.

### Alcance

Entregable de la EDT: «Endpoints de deudas y préstamos». Criterio de la EDT: «Un préstamo aumenta el dinero disponible sin aumentar el ingreso propio del mes».

Entra: registrar un préstamo (crea la deuda o suma a la que ya existe), indicar su interés, consultar las deudas con sus préstamos y deshacer un préstamo mal registrado.

No entra: cálculo de intereses y saldo (6.1.3), abonos y cambio de `saldada` (6.2.1), montos prestado, abonado, saldo y total adeudado (RF-38) ni pantallas. No hay `PATCH` de deudas ni de préstamos, ni `GET /deudas/:id`.

### Fuentes

- RF-34, RF-35, RF-36; CU-19 (pasos 1 a 4 y alternativo 2a); ADR-014; decisiones D1 a D11 del 6.1.1.
- Convenciones del repo: avances y pagos de tarjeta (transacción sin categoría, compensación si falla la segunda escritura), `POST /transacciones` (montos y fechas), 404 sin distinguir datos ajenos, `@Idempotente()`, contrato estricto (campo desconocido → 400).

### Contrato (aprobado, D11)

Todas las rutas requieren sesión (JWT).

| Acción | Ruta | Éxito | Errores |
|---|---|---|---|
| Registrar préstamo | `POST /deudas/prestamos` (`@Idempotente()`) | `201` | 400, 401, 409, 422, 500 |
| Listar deudas | `GET /deudas` | `200` | 401, 500 |
| Eliminar un préstamo | `DELETE /deudas/:deudaId/prestamos/:prestamoId` | `204` | 400, 401, 404, 409, 500 |

Cuerpo de `POST /deudas/prestamos`:

| Campo | Obligatorio | Reglas |
|---|---|---|
| `acreedor` | sí | texto; se recortan espacios; 1 a 50 |
| `monto` | sí | número mayor que 0, máximo 2 decimales, hasta 999999999999 |
| `fecha` | sí (D8) | `YYYY-MM-DD`, día real; pasada o futura |
| `descripcion` | no (D9) | texto recortado, 1 a 200; sin ella «Préstamo recibido» |
| `tipoInteres` | no (D5) | `SIN_INTERES`, `TASA`, `MONTO_FIJO` |
| `valorInteres` | según el tipo (D5, D10) | `SIN_INTERES`: 0 u omitido. `TASA`: fracción mayor que 0 y hasta 1. `MONTO_FIJO`: pesos mayor que 0, máximo 2 decimales, hasta 999999999999 |

Respuesta `201`:

```json
{
  "deudaCreada": true,
  "deuda": { "id": "…", "acreedor": "Juan Pérez", "tipoInteres": "SIN_INTERES", "valorInteres": 0, "saldada": false, "creadaEn": "2026-11-27T15:00:00.000Z" },
  "prestamo": { "id": "…", "monto": 500000, "fecha": "2026-11-10", "descripcion": "Préstamo recibido", "creadaEn": "2026-11-27T15:00:00.000Z" }
}
```

`deudaCreada` es `false` cuando el monto se sumó a una deuda que ya existía. `prestamo.id` es el id de su transacción.

Respuesta `200` de `GET /deudas`: `{ "items": [ … ] }`, como los demás listados. Cada elemento de `items` es una deuda (los campos de `deuda` de arriba) con `prestamos`: un arreglo con los campos de `prestamo`. Sin deudas, `{ "items": [] }`.

Mensajes: 404 «Deuda no encontrada» o «Préstamo no encontrado». 409 «Ya tienes una deuda activa con esa persona con otro interés: no indiques el interés o envía el mismo», «Ya se está registrando un préstamo de esa persona: vuelve a intentarlo» y «No puedes eliminar el único préstamo de una deuda con abonos». Los mensajes 400 son un arreglo y empiezan por el nombre del campo.

### Decisiones aprobadas por el desarrollador (2026-11-27)

Se aprobó la opción recomendada en D1 a D11. En D10: la tasa es **mensual simple** (`0,02` = 2 % al mes) y el monto fijo es el interés **total** de la deuda, no por mes. D1 incluye ajustar las pruebas ya aprobadas de la forma exacta de `GET /reportes/periodo`. Son tres: CA-RF20-12, los casos «todo en cero» (CA-RF13-02 y CA-RF20-10) y CA-RF20-01, que compara el cuerpo completo.

> Decisión aprobada: **D1 — Qué es «dinero disponible» al recibir un préstamo.** Hoy `GET /reportes/periodo` no suma `DINERO_RECIBIDO` al balance (decisión 1 de `03-reportes.md`) y el disponible de ahorro (RF-22) parte del ingreso propio, pero los abonos sí restan. Ejemplo de un mes: sueldo $3.000.000, préstamo $1.000.000 y gastos $3.500.000 (en el bolsillo quedan $500.000).
> - (a) No cambiar nada: `ingresos` 3.000.000, `dineroRecibido` 1.000.000, `balance` −500.000 y disponible de ahorro −500.000. Cero código, pero ninguna cifra del backend dice que quedan $500.000 y el criterio de la EDT solo se ve en `dineroRecibido`.
> - (b) El balance suma el dinero recibido: `balance` 500.000. Cambian `/reportes/periodo`, `/reportes/evolucion` y `/reportes/comparacion` (balance), ADR-014, CA-RF20-06 y CA-RF28-08; además `ahorroDelMes` del progreso usa el balance, así que la deuda contaría como ahorro salvo que se separe ese cálculo.
> - (c) **Recomendada:** campo nuevo `dineroDisponible = balance + dineroRecibido` en `GET /reportes/periodo`: `balance` −500.000 y `dineroDisponible` 500.000. Es aditivo; balance, evolución, comparación y ahorro no cambian. Consecuencias: hay que **ajustar pruebas ya aprobadas** sobre la forma exacta de la respuesta (CA-RF20-12 y los casos «todo en cero», en `reportes-periodo.integration.spec.ts`); aplica también a los avances en efectivo; es por periodo (no arrastra lo no gastado de meses anteriores, como todo el reporte); y no es lo mismo que el `disponible` de ahorro (RF-22), que no cambia.
>
> Aprobada (c).

> Decisión aprobada: **D2 — Corregir un préstamo mal digitado.** Ningún RF pide editar ni eliminar, y `/transacciones` responde 409 a lo que no es `ORDINARIO`.
> - (a) Nada por ahora: un monto, fecha o nombre equivocado queda para siempre y falsea los reportes y el saldo.
> - (b) **Recomendada:** solo eliminar un préstamo (como los pagos de tarjeta); se corrige borrando y registrando de nuevo. Si era el único de la deuda, se borra también la deuda (así se corrigen nombre e interés). Si es el único y la deuda tiene abonos, `409`. Es un endpoint que ningún RF pide.
> - (c) Eliminar y además `PATCH` de la deuda y del préstamo: más cómodo, bastante más superficie.
>
> Aprobada (b). 6.2.1 debe decidir qué pasa si al borrar un préstamo lo abonado supera lo prestado.

> Decisión aprobada: **D3 — `metodoPago`**, obligatorio en `transacciones` y no pedido por RF-34.
> - (a) **Recomendada:** el servidor guarda `EFECTIVO`, como en los avances, y no se acepta en el cuerpo. Consecuencia: un préstamo recibido por transferencia aparece como efectivo en el listado de movimientos (ningún total depende de ello).
> - (b) Opcional en el cuerpo (`EFECTIVO`, `DEBITO`, `TRANSFERENCIA`), por defecto `EFECTIVO`. Se puede agregar después sin romper a nadie.
> - (c) Obligatorio: un campo más en un formulario para personas sin conocimientos contables.

> Decisión aprobada: **D4 — Cómo se agrega un monto (RF-35).**
> - (a) **Recomendada:** el mismo `POST /deudas/prestamos`: si el usuario tiene una deuda activa con ese `acreedor` (sin distinguir mayúsculas, sí tildes) se suma a ella; si no, se crea. «Elegir una deuda existente» (CU-19, paso 2) es enviar su nombre. La deuda conserva el nombre como se escribió la primera vez y `deudaCreada` avisa lo que pasó. Si dos peticiones distintas crean a la vez la misma deuda, la segunda recibe `409` y se reintenta. Consecuencia: un nombre escrito distinto («Juan» y «Juan P.») crea otra deuda; la pantalla debe sugerir las existentes.
> - (b) `POST /deudas` (crea; `409` si ya existe) y `POST /deudas/:deudaId/prestamos` (suma): más explícito, dos endpoints y el cliente decide cuál usar.

> Decisión aprobada: **D5 — Interés indicado al sumar un monto.** La deuda tiene un solo interés (también el monto fijo es uno por deuda: sumar un préstamo no agrega otro).
> - (a) **Recomendada:** sin `tipoInteres` ni `valorInteres` se conserva el de la deuda; si llegan y coinciden, se acepta; si difieren, `409` y no se guarda nada. Enviar cualquiera de los dos cuenta como indicar el interés (tipo omitido = `SIN_INTERES`, valor omitido = 0) y se valida igual que en una deuda nueva. Consecuencia: no se pueden tener dos préstamos activos de la misma persona con condiciones distintas (ya venía de D4 del 6.1.1).
> - (b) Ignorar el interés nuevo: nunca falla, pero el usuario cree que quedó con otras condiciones.
> - (c) Actualizar el de la deuda: cambia en silencio el interés de lo prestado antes.

> Decisión aprobada: **D6 — La deuda anterior con esa persona está saldada.**
> - (a) **Recomendada:** se crea una deuda nueva, con su propio interés; la saldada queda como historial.
> - (b) Reabrir la saldada: una sola deuda por persona, mezcla préstamos ya pagados con nuevos y obliga a decidir su interés.

> Decisión aprobada: **D7 — Consultar deudas.** RF-38 (montos y total) es de 6.2.
> - (a) **Recomendada:** `GET /deudas` mínimo, que responde `{ "items": [ … ] }`: todas las deudas (activas y saldadas) con sus préstamos, sin cifras calculadas, ordenadas por `acreedor` (sin distinguir mayúsculas, como las tarjetas) y, a igual nombre, la creada más recientemente primero; los préstamos, del más reciente al más antiguo. Permite elegir la deuda (CU-19) y saber qué id eliminar; 6.2 le agrega campos sin romper el contrato.
> - (b) Ningún `GET` hasta 6.2: el front no puede hacer el paso 2 de CU-19 ni eliminar. Se quitan CA-RF34-23 a CA-RF34-25.

> Decisión aprobada: **D8 — `fecha`.** (a) **Recomendada:** obligatoria, como la lista RF-34 y como `POST /transacciones`; así no se necesita `X-Zona-Horaria`. (b) Opcional, por defecto hoy en la zona de `X-Zona-Horaria`, como compras y pagos (un header más y un `400` por zona inválida).

> Decisión aprobada: **D9 — `descripcion`.** (a) **Recomendada:** opcional, por defecto «Préstamo recibido» (como los pagos; así el listado de movimientos no sale en blanco). (b) No aceptarla y usar siempre ese texto.

> Decisión aprobada: **D10 — Significado de la tasa y del monto fijo.** El front necesita saber qué pedir y Swagger qué explicar antes de que existan datos. (a) **Recomendada:** documentar lo que dejó D7 del 6.1.1: tasa **mensual** simple (`0,02` = 2 % al mes); el desarrollador lo confirma ahora contra su hoja, junto con si el monto fijo es total o por mes. (b) Dejarlo sin explicar hasta 6.1.3: los valores digitados antes podrían significar otra cosa.
>
> Aprobada (a), confirmada: tasa **mensual simple** (`0,02` = 2 % al mes) y monto fijo como interés **total** de la deuda (no por mes). Resuelve esa parte de D7 del 6.1.1; Swagger y la pantalla deben decirlo así. Las demás preguntas de D7 (desde cuándo corre el interés y sobre qué saldo) son de 6.1.3.

> Decisión aprobada: **D11 — Nombres de rutas y forma de la respuesta.** (a) **Recomendada:** el contrato de arriba, que el front revisa antes de implementarlo. (b) Otros nombres o formas que pida el front.
>
> Ajuste aprobado por el desarrollador (pedido por el front al revisar el contrato): `GET /deudas` responde `{ "items": [ … ] }` y no un arreglo suelto; sin deudas, `{ "items": [] }`. El resto de la forma y el orden no cambian.

### Escenario base

Usuario A con sesión. **Préstamo base:** `{ "acreedor": "Juan Pérez", "monto": 500000, "fecha": "2026-11-10" }`. Salvo que se diga otra cosa, A no tiene deudas. «No se guarda nada» significa ni deuda ni transacción nuevas, ni cambios en las existentes.

---

## RF-34 — Registrar el préstamo

### CA-RF34-14 — El primer préstamo de una persona crea la deuda

- **Dado** el escenario base
- **Cuando** A envía el préstamo base a `POST /deudas/prestamos`
- **Entonces** responde `201` con `deudaCreada` `true`, `deuda` (`acreedor` «Juan Pérez», `SIN_INTERES`, 0, `saldada` `false`) y `prestamo` (`monto` 500000, `fecha` `2026-11-10`, `descripcion` «Préstamo recibido»), con exactamente las propiedades del contrato; queda una deuda de A

> Decisiones D4, D9 y D11.

### CA-RF34-15 — El préstamo se guarda como dinero recibido asociado a la deuda

- **Dado** el préstamo base registrado
- **Cuando** se lee la colección de transacciones
- **Entonces** hay exactamente una, de A, con `tipo` `INGRESO`, `clasificacionFlujo` `DINERO_RECIBIDO`, `monto` 500000, `fecha` 2026-11-10T00:00:00.000Z, `metodoPago` `EFECTIVO`, `categoriaId` `null`, `tarjetaId` `null`, `deudaId` el de la deuda, y su `_id` es `prestamo.id`

> Decisión D3.

### CA-RF34-16 — Aumenta el dinero disponible sin aumentar el ingreso propio (criterio de la EDT)

- **Dado** en noviembre de 2026 un ingreso ordinario de $3.000.000 y un egreso ordinario de $3.500.000
- **Cuando** A registra un préstamo de $1.000.000 con fecha del 10 de noviembre y consulta `GET /reportes/periodo?mes=2026-11` antes y después
- **Entonces** `dineroDisponible` pasa de −500.000 a 500.000 y `dineroRecibido` de 0 a 1.000.000; `ingresos` (3.000.000), `egresos` (3.500.000) y `balance` (−500.000) no cambian; en un mes sin movimientos `dineroDisponible` es 0; y `GET /reportes/categorias?mes=2026-11` no cambia

> Decisión D1.

### CA-RF34-17 — No cuenta para el ahorro

- **Dado** un ingreso ordinario de $3.000.000 en noviembre y una meta `PORCENTAJE` de 20
- **Cuando** A registra el préstamo base y consulta `GET /ahorro/progreso?mes=2026-11`
- **Entonces** `ingresoPropio` es 3.000.000, `meta.montoMeta` 600.000, `ahorroDelMes` 3.000.000 y `disponible` 2.400.000, igual que antes del préstamo

### CA-RF34-18 — Límites del monto

- **Dado** el escenario base
- **Cuando** `monto` es 0,01, 1254700,55 o 999999999999; y aparte falta, es `null`, 0, −1, 10,001, 1000000000000 o el texto `"500000"`
- **Entonces** los tres primeros responden `201` y conservan el valor exacto; los demás `400` con un mensaje que empieza por `monto` y no se guarda nada

### CA-RF34-19 — Fecha del préstamo

- **Dado** el escenario base
- **Cuando** `fecha` es `2020-01-31`, `2028-02-29` o `2030-12-31`; y aparte falta, es `null`, `2026-02-30`, `10-11-2026` o `2026-11-10T15:00:00Z`
- **Entonces** las tres primeras responden `201` y se guardan a medianoche UTC de ese día; las demás `400` con un mensaje que empieza por `fecha` y no se guarda nada

> Decisión D8.

### CA-RF34-20 — El acreedor es obligatorio, se recorta y tiene tope

- **Dado** el escenario base
- **Cuando** `acreedor` falta, es `null`, vacío, solo espacios, un número o tiene 51 caracteres; y aparte tiene 50, o es «  Juan Pérez  »
- **Entonces** los primeros responden `400` con un mensaje que empieza por `acreedor` y no se guarda nada; los dos últimos responden `201`, con el nombre sin espacios en los extremos

### CA-RF34-21 — Descripción opcional

- **Dado** el escenario base
- **Cuando** `descripcion` es «  Para el arriendo  » o de 200 caracteres; y aparte `null`, vacía, solo espacios, un número o de 201
- **Entonces** las dos primeras responden `201` (la primera se guarda «Para el arriendo»); las demás `400` con un mensaje que empieza por `descripcion` y no se guarda nada

> Decisión D9.

### CA-RF34-22 — Lo que fija el servidor no se envía, y sin sesión no hay préstamo

- **Dado** el préstamo base
- **Cuando** se le agrega `metodoPago`, `tipo`, `clasificacionFlujo`, `categoriaId`, `deudaId`, `usuarioId` o `saldada`; y aparte se envía sin sesión o con una inválida
- **Entonces** cada campo de más responde `400` y la falta de sesión `401`; no se guarda nada

> Decisión D3.

### CA-RF34-23 — Listar las deudas con sus préstamos

- **Dado** A con préstamos de «pedro» (uno), de «Ana» (dos: 5 y 20 de noviembre) y una deuda saldada de «Zoe» con un préstamo
- **Cuando** consulta `GET /deudas`
- **Entonces** responde `200` con exactamente la propiedad `items`, y en ella Ana, pedro y Zoe en ese orden, cada una con exactamente las propiedades del contrato (sin montos calculados); los préstamos de Ana salen con el del 20 primero; Zoe tiene `saldada` `true`

> Decisión D7.
>
> Cambiado por la decisión D1 del 6.1.3 (2026-11-28): la respuesta gana `totalAdeudado` y cada deuda `prestado`, `intereses`, `abonado` y `saldo` (CA-RF38-04).

### CA-RF34-24 — Solo se ven las deudas y préstamos propios

- **Dado** el usuario B con una deuda y su préstamo, y A con un préstamo, un abono a la deuda de ese préstamo y un avance en efectivo (`DINERO_RECIBIDO` sin `deudaId`)
- **Cuando** A consulta `GET /deudas`
- **Entonces** en `items` solo aparece la deuda de A, y en `prestamos` solo su préstamo (ni el avance, ni el abono, ni nada de B)

> Decisión D7.

### CA-RF34-25 — Sin deudas, y sin sesión

- **Dado** un usuario sin deudas
- **Cuando** consulta `GET /deudas`; y aparte se consulta sin sesión
- **Entonces** responde `200` con `{ "items": [] }`; sin sesión, `401`

> Decisión D7.
>
> Cambiado por la decisión D1 del 6.1.3 (2026-11-28): sin deudas responde `{ "totalAdeudado": 0, "items": [] }`.

### CA-RF34-26 — El préstamo no se toca desde `/transacciones`

- **Dado** el préstamo base registrado
- **Cuando** A lista `GET /transacciones` y luego intenta `PATCH` y `DELETE /transacciones/<prestamo.id>`
- **Entonces** el listado lo trae con `clasificacionFlujo` `DINERO_RECIBIDO`; ambos responden `409` y nada cambia

### CA-RF34-27 — Eliminar un préstamo de una deuda con varios

- **Dado** una deuda de A con préstamos de $500.000 y $200.000 en noviembre
- **Cuando** A llama `DELETE /deudas/:deudaId/prestamos/:prestamoId` del de $200.000, y repite la petición
- **Entonces** la primera responde `204`, quedan la deuda y el préstamo de $500.000 y `dineroRecibido` de noviembre es 500.000; la repetición responde `404`

> Decisión D2.

### CA-RF34-28 — Eliminar el único préstamo elimina la deuda

- **Dado** una deuda de A con un solo préstamo y sin abonos, registrada con `TASA` `0,02`
- **Cuando** A elimina ese préstamo y registra otro de la misma persona sin indicar interés
- **Entonces** el borrado responde `204` y no queda la deuda ni la transacción; el nuevo responde `201` con `deudaCreada` `true` y `SIN_INTERES`

> Decisión D2.

### CA-RF34-29 — No se elimina el único préstamo de una deuda con abonos

- **Dado** una deuda de A con un préstamo y un abono (`ABONO_DEUDA` guardado directamente en la base)
- **Cuando** A elimina el préstamo
- **Entonces** responde `409` y no se borra nada

> Decisión D2.

### CA-RF34-30 — Eliminar: datos ajenos, inexistentes o inválidos

- **Dado** una deuda de A con un préstamo, otra de A con préstamo y abono, un egreso ordinario de A y una deuda de B con su préstamo
- **Cuando** A intenta eliminar: el préstamo de B en la deuda de B; el préstamo de B bajo una deuda de A; en una deuda inexistente; bajo la primera deuda el préstamo de la segunda; el id del abono; el id del egreso ordinario; con ids `abc`; y se intenta sin sesión
- **Entonces** deuda ajena o inexistente → `404` «Deuda no encontrada»; lo que no es un préstamo de esa deuda → `404` «Préstamo no encontrado»; ids inválidos → `400`; sin sesión → `401`. No se borra nada

> Decisión D2.

### CA-RF34-31 — El registro no se duplica (idempotencia)

- **Dado** el préstamo base enviado con una `Idempotency-Key`
- **Cuando** se repite con la misma clave y cuerpo; con la misma clave y otro monto; y, con `IDEMPOTENCIA_OBLIGATORIA=true`, sin header
- **Entonces** la repetición devuelve la misma respuesta con `Idempotent-Replayed: true` y sigue habiendo una deuda y una transacción; otro cuerpo → `422`; sin header → `400`

### CA-RF34-32 — Si falla el guardado no queda una deuda a medias

- **Dado** que guardar la transacción falla, una vez para una persona nueva y otra para una con deuda activa
- **Cuando** A registra el préstamo
- **Entonces** responde `500`; en el primer caso no queda ninguna deuda nueva y en el segundo la deuda existente y sus préstamos siguen intactos

### CA-RF34-33 — Los endpoints quedan documentados

- **Dado** la documentación Swagger
- **Cuando** se genera y la revisa `src/common/swagger.spec.ts`
- **Entonces** los tres endpoints cumplen las reglas de la sección 7 de `CLAUDE.md`: etiqueta `deudas`, resumen, descripción detallada, respuestas de éxito y error, ejemplos en cada campo y header de idempotencia en el `POST`

---

## RF-35 — Agregar montos a un préstamo existente

### CA-RF35-01 — Otro préstamo de la misma persona se suma a su deuda

- **Dado** el préstamo base registrado
- **Cuando** A registra otro de $200.000 con `acreedor` «Juan Pérez»
- **Entonces** responde `201` con `deudaCreada` `false` y la misma `deuda.id`; hay una sola deuda y dos transacciones con ese `deudaId`

> Decisión D4.

### CA-RF35-02 — El nombre se compara sin mayúsculas ni espacios de los extremos, y con tildes

- **Dado** el préstamo base registrado
- **Cuando** A registra préstamos con «  JUAN PÉREZ  » y luego con «Juan Perez»
- **Entonces** el primero se suma a la deuda existente, que sigue llamándose «Juan Pérez»; el segundo crea otra deuda

> Decisión D4.

### CA-RF35-03 — La deuda de otro usuario no cuenta

- **Dado** el usuario B con una deuda activa con «Juan Pérez»
- **Cuando** A registra el préstamo base
- **Entonces** responde `201` con `deudaCreada` `true`: A tiene su propia deuda, y la de B y sus préstamos no cambian

### CA-RF35-04 — Una deuda saldada no recibe montos nuevos

- **Dado** una deuda de A con «Juan Pérez» con `saldada` `true` (guardada así en la base)
- **Cuando** A registra el préstamo base y después otro de $200.000
- **Entonces** el primero responde `deudaCreada` `true` con una deuda nueva y `saldada` `false`; el segundo se suma a esa deuda nueva; la saldada no cambia

> Decisión D6.

### CA-RF35-05 — Dos creaciones a la vez de la misma deuda

- **Dado** que al crear la deuda la base responde clave duplicada (código 11000)
- **Cuando** A registra el préstamo
- **Entonces** responde `409` (no `500`) y no se guarda nada

> Decisión D4.

---

## RF-36 — Interés del préstamo

### CA-RF36-10 — Las tres formas de interés al registrar

- **Dado** tres personas sin deuda
- **Cuando** A registra un préstamo de cada una con `SIN_INTERES`, con `TASA` y `0,02`, y con `MONTO_FIJO` y 150000,50
- **Entonces** las tres responden `201` y la deuda guardada y devuelta conserva tipo y valor exactos; el `monto` del préstamo no incluye intereses

> Decisión D10.

### CA-RF36-11 — Sin indicar interés

- **Dado** el escenario base
- **Cuando** A registra sin `tipoInteres` ni `valorInteres`
- **Entonces** la deuda queda `SIN_INTERES` y 0

### CA-RF36-12 — Un interés inválido es 400, nunca 500

- **Dado** el escenario base, y aparte A con una deuda activa de la misma persona
- **Cuando** se envía: `tipoInteres` `PRESTAMO` o `null`; `valorInteres` `null` o texto; `TASA` sin valor, o con 0, −0,02 o 2; `MONTO_FIJO` sin valor, o con 0, −1, 10,001 o 1000000000000; `SIN_INTERES` con 150000; o `valorInteres` 0,02 sin tipo
- **Entonces** cada uno responde `400` con un mensaje que empieza por `tipoInteres` o `valorInteres` y no se guarda nada

### CA-RF36-13 — Al sumar sin indicar interés, o con el mismo, se conserva el de la deuda

- **Dado** una deuda activa de A con «Juan Pérez», `TASA` `0,02`
- **Cuando** A registra un préstamo sin `tipoInteres` ni `valorInteres`, y otro con `TASA` y `0,02`
- **Entonces** ambos responden `201`, se suman a la deuda y esta sigue en `TASA` `0,02`

> Decisión D5.

### CA-RF36-14 — Al sumar con un interés distinto se rechaza

- **Dado** una deuda activa de A con «Juan Pérez», `TASA` `0,02`
- **Cuando** A registra otro préstamo con `TASA` `0,03`, con `MONTO_FIJO` 150000, con `SIN_INTERES`, o solo con `valorInteres` 0
- **Entonces** cada uno responde `409` y no se guarda nada: la deuda conserva `TASA` `0,02` y sus préstamos

> Decisión D5.

---

## Refuerzo del 6.1.2

> Agregado en refuerzo. Aprobado por el desarrollador el 2026-11-27.

Las pruebas de estos criterios ya están en `develop` y conservan en su nombre el ID del criterio del que nacieron, que se indica en cada uno.

### CA-RF34-34 — Si falla el borrado de la deuda no se pierde el préstamo

- **Dado** una deuda de A con un solo préstamo y sin abonos, y que el borrado de la deuda falla
- **Cuando** A elimina ese préstamo
- **Entonces** responde `500` y la deuda y el préstamo siguen como estaban

Prueba: `deudas-listar-eliminar.integration.spec.ts`, «CA-RF34-28 si falla el borrado de la deuda…».

### CA-RF34-35 — Escrituras simultáneas sobre la misma deuda

- **Dado** una deuda activa de A
- **Cuando** a la vez se le suma un préstamo y se elimina el que tenía (en cualquier orden de llegada), o se eliminan a la vez sus dos préstamos
- **Entonces** ambas peticiones responden con éxito (`201` y `204`, o `204` y `204`) y no queda ningún préstamo sin deuda ni deuda sin préstamos

Prueba: `deudas-concurrencia.integration.spec.ts`, las tres «CA-RF34-28 …».

### CA-RF35-06 — Un fallo al crear la deuda que no es un duplicado

- **Dado** que crear la deuda falla con un error distinto de clave duplicada (por ejemplo, código 121)
- **Cuando** A registra el préstamo
- **Entonces** responde `500` (no `409`) y no se guarda nada

Prueba: `prestamos-acreedor-interes.integration.spec.ts`, «CA-RF35-05 otro error al crear la deuda…».

## Índice de criterios del paquete 6.1.2

- **RF-34:** CA-RF34-14 a CA-RF34-35.
- **RF-35:** CA-RF35-01 a CA-RF35-06.
- **RF-36:** CA-RF36-10 a CA-RF36-14.
- **Total:** 33 criterios.

---

## Paquete 6.1.3 — Cálculo de intereses y saldo (RF-36, RF-38)

Estado: **Aprobado** por el desarrollador el 2026-11-28, con la opción recomendada en D1 a D13.

### Alcance

Criterio de la EDT: «El saldo es igual a prestado más intereses menos abonado en todos los casos de prueba».

Entra: calcular de cada deuda lo prestado, los intereses (sin interés, tasa o monto fijo), lo abonado y el saldo; el total adeudado; y entregarlos en `GET /deudas` (D1).

No entra: registrar o borrar abonos, cambiar `saldada` ni limitar cuánto se abona (6.2.1); número de cuotas o cuota estimada (el frontend confirmó que no hay); consultar el saldo a una fecha elegida; pantallas. Como todavía no hay endpoint de abonos, las pruebas siembran las transacciones directamente.

### Fuentes

- RF-36, RF-38 y CU-21 («El sistema muestra por deuda el monto prestado, los intereses, lo abonado y el saldo» y «el total adeudado»); CU-20 (el abono reduce el saldo; si queda en cero se marca saldada).
- RNF-11: cálculos en el backend con precisión completa; se redondea al peso solo al presentar.
- ADR-014: la deuda no guarda montos. Prestado = transacciones `DINERO_RECIBIDO` con su `deudaId`; abonado = transacciones `ABONO_DEUDA` con su `deudaId`.
- D10 del 6.1.2: la tasa es **mensual simple** (`0,02` = 2 % al mes) y el monto fijo es el interés **total** de la deuda, no por mes.

### Ya decidido (no son decisiones)

- Nada se redondea en el backend.
- Interés simple: los intereses sin pagar no generan más intereses.
- Un solo interés por deuda; sumar montos no agrega otro monto fijo.
- Solo cuentan las transacciones del usuario con el `deudaId` de la deuda: un avance en efectivo (sin `deudaId`) no entra.

### Decisiones aprobadas por el desarrollador (2026-11-28)

Se aprobó la opción (a), la recomendada, en D1 a D13. La aprobación de D1 incluye ajustar las pruebas ya aprobadas que se citan allí, y ninguna otra.

Ejemplo común, salvo que se diga otra cosa: préstamo de $1.000.000 el 10 de enero de 2026 con tasa de 2 % al mes ($20.000 por mes).

> Decisión aprobada: **D1 — ¿Se muestran las cifras en `GET /deudas` o solo se hace el cálculo?** Ningún otro paquete de backend cubre RF-38 (6.2.1 es registrar abonos) y la pantalla 6.2.2 espera el saldo.
> - (a) **Recomendada:** `GET /deudas` agrega a cada deuda `prestado`, `intereses`, `abonado` y `saldo`, y a la respuesta `totalAdeudado` (contrato abajo). La pantalla muestra «Debes $1.020.000» sin calcular nada.
> - (b) Solo el cálculo, sin API: `GET /deudas` sigue igual y habría que abrir otro paquete para RF-38; el frontend no puede mostrar los $1.020.000.
> - Consecuencia de (a): hay que **ajustar pruebas ya aprobadas** que exigen la forma anterior: CA-RF34-23 y CA-RF34-25 (`deudas-listar-eliminar.integration.spec.ts`) y la lista de propiedades de `test/deudas/arnes-deudas.ts`. Además, la descripción de Swagger deja de decir «sin cifras calculadas» y el contrato `contratos/deudas.md` necesita la conformidad del frontend.

> Decisión aprobada: **D2 — ¿Desde qué fecha corre el interés?** Ejemplo: $1.000.000 el 10 de enero, otros $500.000 el 25 de febrero; se consulta el 10 de abril.
> - (a) **Recomendada:** cada monto desde su propia fecha: $60.000 (3 meses) + $10.000 (1 mes) = **$70.000** de interés.
> - (b) Todo desde el primer préstamo: $1.500.000 × 2 % × 3 = **$90.000** (cobra interés de dinero que aún no se había recibido).
> - (c) Desde el día en que se anotó en la app: si ambos se anotan el 10 de abril, **$0**.

> Decisión aprobada: **D3 — ¿Cómo se cuentan los meses?** Ejemplo: préstamo el 25 de enero, se consulta el 10 de marzo (44 días).
> - (a) **Recomendada:** meses **cumplidos**: el interés de un mes se suma el día en que se completa (aquí el 25 de febrero): **$20.000**.
> - (b) Proporcional por días (mes de 30): 44/30 × $20.000 = **$29.333,33**.
> - (c) Cada cambio de mes del calendario (febrero y marzo): **$40.000** (un préstamo del 31 de enero ya cobraría un mes el 1 de febrero).
> - (d) Mes empezado cuenta completo: **$40.000** (y $20.000 desde el mismo día del préstamo).

> Decisión aprobada: **D4 — ¿Cuándo se cumple el mes si el día no existe?** (solo con D3 (a)). Ejemplo: préstamo el 31 de enero de 2026, se consulta el 28 de febrero.
> - (a) **Recomendada:** el último día de ese mes, sin correr el día de los meses siguientes (28 de febrero, 31 de marzo, 30 de abril): **$20.000**.
> - (b) El día siguiente (1 de marzo): **$0**.
> - (c) Cada 30 días (2 de marzo, 1 de abril…): **$0**.

> Decisión aprobada: **D5 — ¿Sobre qué saldo se calcula la tasa?** (parte abierta de D7 del 6.1.1). Ejemplo: se abonan $520.000 el 10 de febrero y se consulta el 10 de agosto.
> - (a) **Recomendada:** sobre el **capital pendiente** (lo prestado que falta por pagar): después del abono quedan $500.000 y el mes cuesta $10.000. Intereses **$80.000**, saldo **$560.000**.
> - (b) Sobre lo prestado originalmente: siempre $20.000 al mes. Intereses **$140.000**, saldo **$620.000**. Es más simple (D6 a D8 desaparecen), pero una deuda ya pagada por completo seguiría generando intereses para siempre.

> Decisión aprobada: **D6 — Si se abona dentro del mes, ¿sobre qué capital se cobra ese mes?** Ejemplo: se abonan $500.000 el 25 de enero y se consulta el 10 de febrero.
> - (a) **Recomendada:** sobre lo que se debe el día en que se cumple el mes: $500.000 × 2 % = **$10.000**, saldo **$510.000**. Y si el abono cae **el mismo día** en que se cumple el mes, primero se suma el interés y luego se aplica el abono (así puede pagarlo).
> - (b) Sobre lo que se debía al empezar el mes: **$20.000**, saldo **$520.000**.
> - Sobre el mismo día: abonando $520.000 el 10 de febrero y consultando el 10 de marzo, con (a) el saldo es **$510.000**; si el abono se aplicara antes de sumar el interés, **$499.200**.

> Decisión aprobada: **D7 — ¿El abono paga primero los intereses o la deuda?** Ejemplo: se abonan $520.000 el 10 de febrero (ya hay $20.000 de interés) y se consulta el 10 de agosto.
> - (a) **Recomendada:** primero los intereses acumulados y lo que sobre al capital: capital $500.000, saldo **$560.000**. Es lo usual (creo que es la regla del artículo 1653 del Código Civil colombiano; no está en `../docs`).
> - (b) Primero al capital: capital $480.000 y quedan $20.000 de interés sin pagar, saldo **$557.600** (favorece al deudor).

> Decisión aprobada: **D8 — Con varios montos, ¿cuál se paga primero?** Importa porque cada uno cumple mes en un día distinto. Ejemplo: $1.000.000 el 10 de enero y $500.000 el 25 de enero; se abonan $500.000 el 28 de enero y se consulta el 10 de marzo.
> - (a) **Recomendada:** el más antiguo: saldo **$1.030.000**.
> - (b) El más reciente: **$1.040.000**.
> - (c) Repartido en proporción: **$1.033.333,33**.

> Decisión aprobada: **D9 — ¿Qué pasa si lo abonado supera lo debido?** Puede ocurrir al borrar un préstamo, aunque 6.2.1 rechace abonar de más. Ejemplo: se deben $1.020.000 el 10 de febrero y se abonan $1.100.000; además se le deben $550.000 a otra persona.
> - (a) **Recomendada:** el saldo queda en **−$80.000** (a favor), así siempre se cumple prestado + intereses − abonado; el total adeudado solo suma saldos positivos: **$550.000**. Si después la misma deuda recibe otro monto, el sobrante lo reduce desde su fecha.
> - (b) El saldo se muestra **$0** y total $550.000: más limpio, pero los $80.000 desaparecen de la vista y no se cumple el criterio de la EDT en ese caso.
> - (c) Saldo negativo y total que también resta: total **$470.000** (lo que me deben unos tapa lo que debo a otros).

> Decisión aprobada: **D10 — Fechas futuras y qué es «hoy».** Ejemplo: préstamo del 10 de enero; el 27 de noviembre se anota un abono de $100.000 con fecha 1 de diciembre.
> - (a) **Recomendada:** cuenta **todo lo registrado**, tenga la fecha que tenga (como los reportes de su mes); el tiempo solo afecta el interés, que corre por meses cumplidos hasta hoy. Saldo: $1.000.000 + $200.000 − $100.000 = **$1.100.000**. «Hoy» es el día en la zona de `X-Zona-Horaria` (UTC sin el header; inválida → `400`). Ejemplo de zona: el 10 de febrero a las 03:00 UTC, en Bogotá es todavía 9 de febrero: interés **$0** en Bogotá y **$20.000** sin el header.
> - (b) Ignorar lo que tiene fecha futura hasta que llegue: saldo **$1.200.000** (lo anotado no se ve).

> Decisión aprobada: **D11 — ¿Una deuda `saldada` sigue generando interés?**
> - (a) **Recomendada:** el cálculo no mira `saldada`: sale solo de las transacciones. Una deuda pagada (abono de $1.020.000 el 10 de febrero) no tiene capital y el 10 de julio sigue con saldo **$0**. Marcarla solo con saldo cero es de 6.2.1. Si en la base hubiera una marcada saldada sin pagar, seguiría mostrando (y sumando) lo que debe.
> - (b) Si está saldada, el saldo se fuerza a **$0** y se congela el interés: una marcada por error con $1.000.000 pendientes mostraría $0.

> Decisión aprobada: **D12 — ¿Cuándo se cobra el monto fijo?** Ejemplo: $1.000.000 prestados hoy con interés fijo de $150.000.
> - (a) **Recomendada:** completo desde que existe la deuda: hoy debes **$1.150.000** (así se pactó; no hay plazo).
> - (b) Al cumplir el primer mes: hoy **$1.000.000** y dentro de un mes $1.150.000.
> - Repartirlo por meses no es posible: no hay número de cuotas.

> Decisión aprobada: **D13 — Dónde vive el cálculo (nombres).**
> - (a) **Recomendada:** una función pura, como `cuota-credito.ts`: `calcularSaldoDeuda(deuda, hoy)` en `src/deudas/saldo-deuda.ts`, donde `deuda` es `{ tipoInteres, valorInteres, prestamos: { monto, fecha: Date }[], abonos: { monto, fecha: Date }[] }` y `hoy` es `YYYY-MM-DD`; devuelve `{ prestado, intereses, abonado, saldo }`. El día de cada `fecha` es el de UTC y el orden de los arreglos no importa. `DeudasService` la usa al listar; el método `calcularSaldo(deudaId)` de `CLAUDE.md` se agrega en 6.2.1, cuando alguien lo necesite.
> - (b) Crear ya `DeudasService.calcularSaldo(usuarioId, deudaId, hoy)`: un método sin quién lo llame. Sería necesario si se elige D1 (b).

### Contrato (aprobado, D1)

`GET /deudas`, con header opcional `X-Zona-Horaria`. Ejemplo del 10 de abril de 2026 (caso M1). `POST /deudas/prestamos` y el `DELETE` no cambian.

```json
{
  "totalAdeudado": 1570000,
  "items": [
    {
      "id": "…", "acreedor": "Juan Pérez", "tipoInteres": "TASA", "valorInteres": 0.02, "saldada": false, "creadaEn": "…",
      "prestado": 1500000,
      "intereses": 70000,
      "abonado": 0,
      "saldo": 1570000,
      "prestamos": [{ "id": "…", "monto": 500000, "fecha": "2026-02-25", "descripcion": "Préstamo recibido", "creadaEn": "…" }]
    }
  ]
}
```

(El ejemplo muestra solo uno de los dos préstamos.) Los abonos no se listan (6.2.1). No hay errores nuevos: solo el `400` de zona horaria inválida, que ya sale con `code` `VALIDACION` y `action`.

### Casos de referencia

Cifras en pesos, calculadas a mano; se comparan con `toBeCloseTo(valor, 6)`. `TASA` es 0,02 salvo que se indique. Las fechas sin año son de 2026. «—» = no depende de ninguna decisión (fuera de D13, los nombres).

| Caso | Interés | Préstamos | Abonos | Hoy | Prestado | Intereses | Abonado | Saldo | Depende de |
|---|---|---|---|---|---|---|---|---|---|
| S1 | sin interés | 500.000 el 10-ene | — | 27-nov | 500.000 | 0 | 0 | 500.000 | — |
| S2 | sin interés | 500.000 el 10-ene; 200.000 el 25-feb | 150.000 el 10-mar | 27-nov | 700.000 | 0 | 150.000 | 550.000 | — |
| F1 | fijo 150.000 | 1.000.000 el 27-nov | — | 27-nov | 1.000.000 | 150.000 | 0 | 1.150.000 | D12 |
| F2 | fijo 150.000 | 1.000.000 el 10-ene; 500.000 el 25-feb | 400.000 el 10-mar | 27-nov | 1.500.000 | 150.000 | 400.000 | 1.250.000 | — |
| F3 | fijo 150.000,50 | 1.254.700,55 el 10-ene | — | 27-nov | 1.254.700,55 | 150.000,50 | 0 | 1.404.701,05 | — |
| T1 | tasa | 1.000.000 el 10-ene | — | 10-ene | 1.000.000 | 0 | 0 | 1.000.000 | D3 |
| T2 | tasa | igual | — | 9-feb | 1.000.000 | 0 | 0 | 1.000.000 | D3 |
| T3 | tasa | igual | — | 10-feb | 1.000.000 | 20.000 | 0 | 1.020.000 | D3 |
| T4 | tasa | igual | — | 10-abr | 1.000.000 | 60.000 | 0 | 1.060.000 | D3 |
| T5 | tasa | igual | — | 10-ene-2027 | 1.000.000 | 240.000 | 0 | 1.240.000 | D3 (compuesto daría 1.268.241,79) |
| T6 | tasa | 1.254.700 el 15-ene | — | 15-ene-2027 | 1.254.700 | 301.128 | 0 | 1.555.828 | D3 |
| T7 | tasa 0,015 | 333.333 el 15-ene | — | 15-abr | 333.333 | 14.999,985 | 0 | 348.332,985 | D3 (sin redondear) |
| C1 | tasa | 1.000.000 el 31-ene | — | 27-feb / 28-feb | 1.000.000 | 0 / 20.000 | 0 | 1.000.000 / 1.020.000 | D3, D4 |
| C2 | tasa | igual | — | 30-mar / 31-mar / 30-abr | 1.000.000 | 20.000 / 40.000 / 60.000 | 0 | 1.020.000 / 1.040.000 / 1.060.000 | D3, D4 |
| C3 | tasa | 1.000.000 el 31-ene-2028 | — | 28-feb-2028 / 29-feb-2028 | 1.000.000 | 0 / 20.000 | 0 | 1.000.000 / 1.020.000 | D4 (bisiesto) |
| C4 | tasa | 1.000.000 el 28-feb | — | 27-mar / 28-mar | 1.000.000 | 0 / 20.000 | 0 | 1.000.000 / 1.020.000 | D4 |
| C5 | tasa | 1.000.000 el 30-nov | — | 28-feb-2027 | 1.000.000 | 60.000 | 0 | 1.060.000 | D4 (cambio de año) |
| C6 | tasa | 1.000.000 el 29-feb-2028 | — | 28-feb-2029 | 1.000.000 | 240.000 | 0 | 1.240.000 | D4 |
| M1 | tasa | 1.000.000 el 10-ene; 500.000 el 25-feb | — | 10-abr | 1.500.000 | 70.000 | 0 | 1.570.000 | D2, D3 |
| A1 | tasa | 1.000.000 el 10-ene | 520.000 el 10-feb | 10-mar | 1.000.000 | 30.000 | 520.000 | 510.000 | D5, D6, D7 |
| A2 | tasa | igual | igual | 10-ago | 1.000.000 | 80.000 | 520.000 | 560.000 | D5, D6, D7 |
| A3 | tasa | igual | 10.000 el 10-feb | 10-mar | 1.000.000 | 40.000 | 10.000 | 1.030.000 | D5, D6, D7 (el interés sin pagar no genera interés) |
| A4 | tasa | igual | 500.000 el 25-ene | 10-feb | 1.000.000 | 10.000 | 500.000 | 510.000 | D5, D6 |
| A5 | tasa | igual | 1.000.000 el 25-ene | 10-jul | 1.000.000 | 0 | 1.000.000 | 0 | D5, D6 |
| A6 | tasa | igual | 1.020.000 el 10-feb | 10-jul | 1.000.000 | 20.000 | 1.020.000 | 0 | D5, D6, D11 |
| A7 | tasa | 1.000.000 el 10-ene; 500.000 el 25-ene | 500.000 el 28-ene | 10-mar | 1.500.000 | 30.000 | 500.000 | 1.030.000 | D5, D8 |
| A8 | tasa | 1.000.000 el 10-ene; 500.000 el 25-feb | 1.230.000 el 10-abr | 10-may | 1.500.000 | 76.800 | 1.230.000 | 346.800 | D5, D6, D7, D8 |
| E1 | sin interés | 500.000 el 10-ene | 600.000 el 10-feb | 27-nov | 500.000 | 0 | 600.000 | −100.000 | D9 |
| E2 | tasa | 1.000.000 el 10-ene | 1.100.000 el 10-feb | 10-jun | 1.000.000 | 20.000 | 1.100.000 | −80.000 | D5, D6, D9 |
| E3 | tasa | 1.000.000 el 10-ene; 200.000 el 5-mar | 1.100.000 el 10-feb | 5-abr | 1.200.000 | 22.400 | 1.100.000 | 122.400 | D5, D6, D9 |
| V1 | tasa | 1.000.000 el 15-dic | — | 27-nov | 1.000.000 | 0 | 0 | 1.000.000 | D10 |
| V2 | tasa | 1.000.000 el 10-ene | 100.000 el 1-dic | 27-nov | 1.000.000 | 200.000 | 100.000 | 1.100.000 | D10 |

### CA-RF36-15 — Sin intereses

- **Dado** una deuda `SIN_INTERES`
- **Cuando** se calcula su saldo (S1, S2)
- **Entonces** `intereses` es 0 sin importar el tiempo transcurrido y el saldo es el de la tabla

### CA-RF36-16 — Monto fijo

- **Dado** una deuda `MONTO_FIJO`
- **Cuando** se calcula su saldo (F1 a F3)
- **Entonces** `intereses` es el monto fijo una sola vez, sin importar cuántos préstamos haya, el tiempo ni los abonos

> Decisión aprobada: D12.

### CA-RF36-17 — Tasa mensual simple por meses cumplidos

- **Dado** una deuda `TASA`
- **Cuando** se calcula su saldo (T1 a T7)
- **Entonces** cada mes cumplido suma capital × tasa, sin interés sobre intereses y sin redondear

> Decisión aprobada: D3.

### CA-RF36-18 — Fin de mes, bisiestos y cambio de año

- **Dado** préstamos de los días 28 a 31
- **Cuando** se calcula su saldo (C1 a C6)
- **Entonces** el mes se cumple el mismo día del mes siguiente o, si no existe, el último día de ese mes, sin correr el día de los meses posteriores

> Decisión aprobada: D4.

### CA-RF36-19 — Cada préstamo corre desde su fecha

- **Dado** una deuda `TASA` con dos préstamos de fechas distintas
- **Cuando** se calcula su saldo (M1)
- **Entonces** cada monto genera interés desde su propia fecha

> Decisión aprobada: D2.

### CA-RF36-20 — Cómo actúan los abonos sobre el interés

- **Dado** una deuda `TASA` con abonos
- **Cuando** se calcula su saldo (A1 a A8)
- **Entonces** cada abono paga primero los intereses acumulados y luego el capital del préstamo más antiguo; cada mes se cobra sobre el capital pendiente el día en que se cumple (el interés de ese día se suma antes de aplicar el abono)

> Decisión aprobada: D5 a D8.

### CA-RF38-01 — El saldo es prestado más intereses menos abonado (criterio de la EDT)

- **Dado** cada caso de la tabla, y A8 con los arreglos de préstamos y abonos en orden inverso
- **Cuando** se calcula su saldo
- **Entonces** `prestado` es la suma de los préstamos, `abonado` la de los abonos, `saldo` = `prestado` + `intereses` − `abonado`, y el orden en que llegan no cambia nada

> Decisión aprobada: D13.

### CA-RF38-02 — Abonado por encima de lo debido

- **Dado** una deuda con más abonado que prestado más intereses
- **Cuando** se calcula su saldo (E1 a E3)
- **Entonces** el saldo es negativo, no genera interés y el sobrante reduce un préstamo posterior desde su fecha

> Decisión aprobada: D9.

### CA-RF38-03 — Movimientos con fecha futura

- **Dado** un préstamo o un abono con fecha posterior a hoy
- **Cuando** se calcula el saldo (V1, V2)
- **Entonces** cuenta en `prestado` o `abonado`, y el interés solo incluye los meses cumplidos hasta hoy

> Decisión aprobada: D10.

### CA-RF38-04 — `GET /deudas` trae las cifras de cada deuda

- **Dado** A con tres deudas, consultadas el 10 de abril de 2026: «Ana» (los préstamos de M1), «Pedro» (los préstamos y el abono de S2) y «Zoe» (los de E2, marcada `saldada`)
- **Cuando** consulta `GET /deudas`
- **Entonces** responde `200` con `totalAdeudado` e `items`; cada deuda tiene las propiedades de antes más `prestado`, `intereses`, `abonado` y `saldo`: Ana 1.500.000 / 70.000 / 0 / 1.570.000, Pedro 700.000 / 0 / 150.000 / 550.000 y Zoe 1.000.000 / 20.000 / 1.100.000 / −80.000. El cálculo no escribe nada en la base (ni cambia `saldada`)

> Decisión aprobada: D1, D9 y D11.

### CA-RF38-05 — Total adeudado

- **Dado** las tres deudas de CA-RF38-04, y aparte un usuario sin deudas
- **Cuando** consulta `GET /deudas`
- **Entonces** `totalAdeudado` es 2.120.000 (suma de los saldos positivos, sin restar el de Zoe); sin deudas la respuesta es `{ "totalAdeudado": 0, "items": [] }`

> Decisión aprobada: D1 y D9.

### CA-RF38-06 — Solo cuentan las transacciones propias de cada deuda

- **Dado** una deuda de A con un préstamo y un abono; además un avance en efectivo de A sin `deudaId`, otra deuda de A, y una transacción de B que (sembrada así en la base) apunta a la primera deuda de A; B tiene su propia deuda
- **Cuando** A consulta `GET /deudas`
- **Entonces** las cifras de la primera deuda salen solo de su préstamo y su abono, `totalAdeudado` suma solo las dos deudas de A y nada de B aparece

### CA-RF38-07 — «Hoy» es el día del cliente

- **Dado** el préstamo de T1 y el instante 2026-02-10T03:00:00Z
- **Cuando** se consulta `GET /deudas` sin header, con `X-Zona-Horaria: America/Bogota` y con `Zona/Invalida`
- **Entonces** sin header `intereses` es 20.000; en Bogotá es 0; la zona inválida responde `400` (`code` `VALIDACION`)

> Decisión aprobada: D10.

### CA-RF38-08 — Documentación

- **Dado** la documentación Swagger
- **Cuando** se genera
- **Entonces** `GET /deudas` documenta el header `X-Zona-Horaria`, la respuesta `400`, y `totalAdeudado`, `prestado`, `intereses`, `abonado` y `saldo` con descripción y ejemplo

> Decisión aprobada: D1.

### Nota para 6.2.1

El saldo no se redondea, así que un abono de la cifra mostrada (al peso) puede dejar centavos: 6.2.1 debe decidir desde qué saldo se considera saldada, si se permite abonar de más y cuándo se reabre.

## Índice de criterios del paquete 6.1.3

- **RF-36:** CA-RF36-15 a CA-RF36-20.
- **RF-38:** CA-RF38-01 a CA-RF38-08.
- **Total:** 14 criterios.
