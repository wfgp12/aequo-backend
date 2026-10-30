# Criterios de aceptación — 3 Reportes y visualización

Estado: Borrador

## Paquete 3.1.1 — Agregación por periodo (TDD)

Cubre RF-13, RF-14 y RF-20 (CU-07, "Consultar reporte del periodo"): el resumen numérico de un periodo. Servicio previsto: `ReportesService.obtenerPorPeriodo(periodo)`. Reglas de ADR-014 (CLAUDE.md §5) y RNF-11 (precisión completa, el redondeo al peso es del frontend).

### Contrato propuesto (a aprobar)

Los RF y el Documento de Diseño no fijan el endpoint, así que las pruebas se escribirán contra este contrato. Si lo cambias, cambian los criterios.

- `GET /reportes/periodo`, protegido con la sesión.
- Parámetros de consulta, todos opcionales: `mes` (`YYYY-MM`) **o** el par `desde` + `hasta` (`YYYY-MM-DD`, ambos incluidos). Sin ninguno, se usa el mes actual (RF-13).
- Respuesta 200:
  `{ desde, hasta, ingresos, egresos, pagosTarjeta, abonosDeuda, dineroRecibido, balance }`
  - `desde` y `hasta`: el periodo efectivo, `YYYY-MM-DD`.
  - `ingresos`: suma de las transacciones `INGRESO` con `clasificacionFlujo` `ORDINARIO` (ingreso propio).
  - `egresos`: suma de las transacciones `EGRESO` `ORDINARIO` (gasto propio).
  - `pagosTarjeta`: suma de las `PAGO_TARJETA`, por la fecha del pago.
  - `abonosDeuda`: suma de las `ABONO_DEUDA`.
  - `dineroRecibido`: suma de las `DINERO_RECIBIDO` (préstamos y avances), informada aparte.
  - `balance` = `ingresos − egresos − pagosTarjeta − abonosDeuda`: el dinero que entró o salió de verdad.
- Los totales se calculan al consultar (no se guardan): crear, editar o eliminar un movimiento se refleja de inmediato.
- Las fechas se guardan a medianoche UTC del día indicado, así que un día `YYYY-MM-DD` se compara tal cual (sin desfase por zona horaria).

### Decisiones que necesito de ti antes de escribir las pruebas

> Pendiente de decisión (1): **`dineroRecibido` y el balance.** ADR-014 lista lo que cuenta en el balance (ordinarios, pagos de tarjeta y abonos) y no menciona los préstamos ni los avances, que "se muestran aparte". Lo leí literal: `dineroRecibido` **no** suma al balance. Si prefieres que sí sume (es dinero disponible), el balance pasa a ser `… + dineroRecibido` y cambian CA-RF20-05 y CA-RF20-06.

> Pendiente de decisión (2): **`egresos` frente a `pagosTarjeta` y `abonosDeuda`.** Propongo campos separados para que "egresos" siga siendo gasto propio (simétrico con "ingreso propio") y el balance se pueda explicar sumando los campos. La alternativa es un solo `egresos` que ya incluya pagos y abonos (balance = ingresos − egresos). Cambia CA-RF20-04 a CA-RF20-06.

> Pendiente de decisión (3): **alcance de RF-15, RF-16 y RF-19.** La EDT define el 3.1.1 como "agregación por rangos de fecha" y el 3.1.2 como agregación por categoría. La comparación entre periodos (RF-15/RF-16, `ReportesService.compararPeriodos`) y la evolución (RF-19, `obtenerEvolucion`) no tienen paquete propio en el 3.1. Estos criterios no los cubren; propongo tratarlos como un paquete aparte, o como parte del 3.1.2 si prefieres.

> Pendiente de decisión (4): **zona horaria del "mes actual".** El servidor corre en UTC y el usuario está en Colombia (UTC−5): el 31 de octubre a las 8 p. m. en Bogotá ya es 1 de noviembre en UTC. Los criterios de RF-13 usan una fecha a mitad de mes, donde no hay ambigüedad. No escribiré la prueba del cambio de mes hasta que decidas si "hoy" se calcula en UTC o en `America/Bogota`.

> Pendiente de decisión (5): las **compras con tarjeta** (`comprascredito`, módulo 5) no afectan el balance el día de la compra (ADR-014) y cuentan en el gasto por categoría (3.1.2), así que no aparecen en este resumen. Se anota por si debe mostrarse algún total aparte más adelante.

---

## RF-13 — Reporte del mes actual por defecto

### CA-RF13-01 — Sin parámetros se usa el mes actual

- **Dado** que hoy es el 15 de octubre de 2026 y el usuario tiene movimientos del 1 al 31 de octubre y del mes anterior
- **Cuando** consulta `GET /reportes/periodo` sin parámetros
- **Entonces** responde 200 con `desde` `2026-10-01` y `hasta` `2026-10-31`, y los totales cuentan solo los movimientos de octubre

### CA-RF13-02 — El mes actual sin movimientos es un reporte en cero, no un error

- **Dado** un usuario que tiene movimientos en meses anteriores pero ninguno en el mes actual
- **Cuando** consulta `GET /reportes/periodo` sin parámetros
- **Entonces** responde 200 con `ingresos`, `egresos`, `pagosTarjeta`, `abonosDeuda`, `dineroRecibido` y `balance` en `0` (CU-07, flujo 3a)

---

## RF-14 — Seleccionar otro periodo

### CA-RF14-01 — Un mes concreto

- **Dado** un usuario con movimientos en septiembre y octubre de 2026
- **Cuando** consulta `GET /reportes/periodo?mes=2026-09`
- **Entonces** responde 200 con `desde` `2026-09-01` y `hasta` `2026-09-30`, y los totales cuentan solo los movimientos de septiembre

### CA-RF14-02 — Los bordes del mes están incluidos y los vecinos no

- **Dado** movimientos de $1.000 el 31 de agosto, el 1 de septiembre, el 30 de septiembre y el 1 de octubre de 2026
- **Cuando** consulta `?mes=2026-09`
- **Entonces** cuenta solo los del 1 y el 30 de septiembre (total $2.000)

### CA-RF14-03 — Febrero de un año común

- **Dado** movimientos de $1.000 el 28 de febrero y el 1 de marzo de 2026
- **Cuando** consulta `?mes=2026-02`
- **Entonces** `hasta` es `2026-02-28` y cuenta solo el del 28 de febrero

### CA-RF14-04 — Febrero de un año bisiesto

- **Dado** movimientos de $1.000 el 29 de febrero y el 1 de marzo de 2028
- **Cuando** consulta `?mes=2028-02`
- **Entonces** `hasta` es `2028-02-29` y cuenta solo el del 29 de febrero

### CA-RF14-05 — Diciembre no se mezcla con enero del año siguiente

- **Dado** movimientos de $1.000 el 1 de diciembre y el 31 de diciembre de 2026, y el 1 de enero de 2027
- **Cuando** consulta `?mes=2026-12`
- **Entonces** `desde` es `2026-12-01`, `hasta` es `2026-12-31` y cuenta solo los dos de diciembre

### CA-RF14-06 — Un rango con `desde` y `hasta`, ambos incluidos

- **Dado** movimientos de $1.000 el 9, el 10, el 15, el 20 y el 21 de octubre de 2026
- **Cuando** consulta `?desde=2026-10-10&hasta=2026-10-20`
- **Entonces** responde con `desde` `2026-10-10` y `hasta` `2026-10-20`, y cuenta los del 10, 15 y 20 (total $3.000)

### CA-RF14-07 — Un rango de un solo día

- **Dado** movimientos de $1.000 el 14, el 15 y el 16 de octubre de 2026
- **Cuando** consulta `?desde=2026-10-15&hasta=2026-10-15`
- **Entonces** cuenta solo el del 15

### CA-RF14-08 — Un rango que cruza meses y años

- **Dado** movimientos de $1.000 el 30 de diciembre de 2026, el 2 de enero de 2027 y el 15 de febrero de 2027
- **Cuando** consulta `?desde=2026-12-15&hasta=2027-01-15`
- **Entonces** cuenta solo los dos primeros

### CA-RF14-09 — `desde` posterior a `hasta`

- **Dado** una consulta con `desde=2026-10-20&hasta=2026-10-10`
- **Cuando** se envía
- **Entonces** responde 400 con el mensaje `desde no puede ser posterior a hasta`

### CA-RF14-10 — `mes` con formato inválido

- **Dado** una consulta con `mes` igual a `2026-13`, `2026-00`, `2026-9`, `octubre` o `2026-10-01`
- **Cuando** se envía
- **Entonces** responde 400 con un mensaje que empieza por `mes` (`mes debe tener el formato YYYY-MM con un mes del 01 al 12`) y no calcula nada

> Pendiente de decisión: el texto exacto del mensaje no está definido; la prueba exigirá que empiece por `mes`, como los demás mensajes de validación.

### CA-RF14-11 — Fechas del rango inválidas

- **Dado** una consulta con `desde=2026-02-30` (día que no existe), o con `desde=20-10-2026` (formato incorrecto)
- **Cuando** se envía
- **Entonces** responde 400 con el mismo mensaje del listado de transacciones (`desde debe ser una fecha real del calendario (YYYY-MM-DD)` o `desde debe tener el formato YYYY-MM-DD`), y lo mismo para `hasta`

### CA-RF14-12 — `mes` no se mezcla con `desde` o `hasta`

- **Dado** una consulta con `mes=2026-10` y además `desde` o `hasta`
- **Cuando** se envía
- **Entonces** responde 400 con un mensaje que explica que se elige un mes o un rango, no ambos

> Pendiente de decisión: confirmar que mezclarlos es un error y no que uno prevalece sobre el otro.

### CA-RF14-13 — `desde` y `hasta` van juntos

- **Dado** una consulta con solo `desde` o solo `hasta`
- **Cuando** se envía
- **Entonces** responde 400 con un mensaje que pide enviar ambos

> Pendiente de decisión: el listado de transacciones sí admite un rango abierto; para el reporte propongo exigir los dos extremos para que el resumen siempre tenga un periodo definido.

### CA-RF14-14 — El reporte es solo del usuario de la sesión

- **Dado** movimientos de otro usuario en el mismo periodo
- **Cuando** el usuario consulta su reporte
- **Entonces** los totales no incluyen nada del otro usuario

### CA-RF14-15 — Sin sesión válida

- **Dado** una consulta sin sesión o con una sesión inválida
- **Cuando** se envía
- **Entonces** responde 401

---

## RF-20 — Resumen numérico del periodo

Todos los casos usan `?mes=2026-10`.

### CA-RF20-01 — Ingresos, egresos y balance

- **Dado** ingresos ordinarios de $2.500.000 y $300.000, y egresos ordinarios de $45.000, $80.000 y $1.254.700, todos en octubre de 2026
- **Cuando** consulta el reporte
- **Entonces** `ingresos` es 2.800.000, `egresos` es 1.379.700 y `balance` es 1.420.300; `pagosTarjeta`, `abonosDeuda` y `dineroRecibido` son 0

### CA-RF20-02 — Balance negativo

- **Dado** un ingreso ordinario de $100.000 y un egreso ordinario de $350.000
- **Cuando** consulta el reporte
- **Entonces** `balance` es −250.000 (no se trunca a cero)

### CA-RF20-03 — Solo ingresos o solo egresos

- **Dado** un periodo con un único ingreso ordinario de $500.000 (y, en otro caso, con un único egreso de $80.000)
- **Cuando** consulta el reporte
- **Entonces** el total que falta es 0 y el balance es 500.000 (o −80.000)

### CA-RF20-04 — Un pago de tarjeta sale del balance y no es un egreso propio

- **Dado** un ingreso ordinario de $3.000.000 y un `PAGO_TARJETA` de $119.802,13 con fecha en octubre
- **Cuando** consulta el reporte
- **Entonces** `pagosTarjeta` es 119.802,13, `egresos` es 0 (no se cuenta dos veces el gasto de la compra) y `balance` es 2.880.197,87

> Pendiente de decisión: depende de las decisiones (1) y (2) de arriba.

### CA-RF20-05 — Un abono a una deuda sale del balance y no es un egreso propio

- **Dado** un ingreso ordinario de $3.000.000 y un `ABONO_DEUDA` de $200.000 en octubre
- **Cuando** consulta el reporte
- **Entonces** `abonosDeuda` es 200.000, `egresos` es 0 y `balance` es 2.800.000

### CA-RF20-06 — El dinero recibido no es ingreso propio

- **Dado** un ingreso ordinario de $3.000.000 y un `DINERO_RECIBIDO` (préstamo) de $1.000.000 en octubre
- **Cuando** consulta el reporte
- **Entonces** `ingresos` es 3.000.000 (excluye el préstamo), `dineroRecibido` es 1.000.000 y `balance` es 3.000.000

> Pendiente de decisión: depende de la decisión (1) de arriba.

### CA-RF20-07 — El pago de tarjeta cuenta en el mes en que se hace, no en el de la compra

- **Dado** un `PAGO_TARJETA` de $100.000 con fecha el 5 de noviembre de 2026
- **Cuando** consulta `?mes=2026-10` y luego `?mes=2026-11`
- **Entonces** `pagosTarjeta` es 0 en octubre y 100.000 en noviembre

### CA-RF20-08 — Los totales no dependen de la categoría ni del método de pago

- **Dado** movimientos de distintas categorías y métodos (efectivo, débito, transferencia) y pagos de tarjeta y abonos sin categoría
- **Cuando** consulta el reporte
- **Entonces** todos cuentan en sus totales

### CA-RF20-09 — Precisión completa, sin redondear

- **Dado** egresos ordinarios de $100,10 y $200,20 en octubre
- **Cuando** consulta el reporte
- **Entonces** `egresos` es 300,30 (con la precisión de la suma, sin redondear al peso; RNF-11)

### CA-RF20-10 — Periodo sin movimientos

- **Dado** un usuario sin movimientos en el periodo consultado, aunque los tenga en otros meses o no tenga ninguno
- **Cuando** consulta el reporte
- **Entonces** responde 200 con todos los totales en `0` y no un error (CU-07, flujo 3a)

### CA-RF20-11 — Los cambios se reflejan al consultar

- **Dado** un único egreso de $45.000 en octubre, y el reporte consultado con `egresos` en 45.000
- **Cuando** el usuario, en este orden, crea otro egreso de $5.000, edita el primero a $40.000 y elimina el segundo, y consulta el reporte después de cada paso
- **Entonces** `egresos` vale 50.000, luego 45.000 y al final 40.000, sin datos guardados que se queden viejos

### CA-RF20-12 — Forma estable de la respuesta

- **Dado** cualquier consulta válida
- **Cuando** responde 200
- **Entonces** el cuerpo tiene exactamente las propiedades `desde`, `hasta`, `ingresos`, `egresos`, `pagosTarjeta`, `abonosDeuda`, `dineroRecibido` y `balance`; las fechas son cadenas `YYYY-MM-DD` y los totales son números (el Adapter del frontend depende de esta forma)
