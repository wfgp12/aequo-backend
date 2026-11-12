# Criterios de aceptación — 3 Reportes: comparación entre periodos y evolución

Estado: Aprobado (2026-11-11). La implementación y las pruebas van en dos paquetes: 3.1.3 (evolución, RF-19) primero y 3.1.4 (comparación, RF-15 y RF-16) después.

Cubre RF-15 (comparar entre todos los periodos con movimientos), RF-16 (elegir el tipo de dato de la comparación) y RF-19 (evolución del balance mes a mes). Servicio previsto: `ReportesService.compararPeriodos(tipo)` y `ReportesService.obtenerEvolucion(rango)` (CLAUDE.md §4). Reglas de ADR-014 y RNF-11 (precisión completa; el redondeo es del frontend). Lo consumirán 3.2.4 (gráfica de evolución) y 3.3.1 (dashboard con comparaciones).

Se reutiliza lo que ya existe: los totales de cada mes son **los mismos** de `GET /reportes/periodo` y `GET /reportes/categorias` de ese mes (se exige la coincidencia, para no duplicar ni contradecir reglas). Un «mes» es el mes calendario del día guardado (las fechas se guardan a medianoche UTC del día elegido, así que no hay desfase por zona).

## Contrato propuesto (a aprobar)

Los RF y el Documento de Diseño no fijan los endpoints; las pruebas se escribirán contra este contrato. Ambas rutas requieren sesión (`Authorization: Bearer`) y solo ven los datos del usuario del token. Son solo lectura (sin `@Idempotente()`).

**Parámetros de periodo (en las dos rutas, opcionales e independientes):** `desde` y `hasta` en formato `YYYY-MM` (mes, ambos incluidos). Sin `desde` empieza en el primer mes con movimientos del usuario; sin `hasta` termina en el último mes con movimientos. No se acepta `mes` ni ningún otro parámetro desconocido (400). Máximo 120 meses de rango.

**`GET /reportes/comparacion?tipo=balance|ingresos-egresos|categoria[&desde=YYYY-MM][&hasta=YYYY-MM]`** — `tipo` es obligatorio. Responde `200`:

```json
{
  "tipo": "ingresos-egresos",
  "desde": "2026-07",
  "hasta": "2026-10",
  "periodos": [
    { "periodo": "2026-07", "ingresos": 3000000, "egresos": 1000000 },
    { "periodo": "2026-09", "ingresos": 3000000, "egresos": 900000 }
  ]
}
```

- `periodos`: **solo los meses con al menos un movimiento** (una transacción de cualquier clase), del más antiguo al más reciente. Los meses sin movimientos no aparecen. La lista de meses es la misma para los tres tipos.
- Por `tipo`, cada elemento trae `periodo` y: `balance` (`balance`); `ingresos` y `egresos` (`ingresos-egresos`, con el significado de `ingresos` y `egresos` de `GET /reportes/periodo`); o `total` y `categorias` (`categoria`, con la misma forma y el mismo orden que `GET /reportes/categorias`: `categoriaId`, `nombre`, `total`, `porcentaje`).
- `desde` y `hasta`: el rango efectivo (`YYYY-MM`): lo enviado o, si se omitió, el primer/último mes con movimientos; `null` si se omitió y el usuario no tiene movimientos.

**`GET /reportes/evolucion[?desde=YYYY-MM][&hasta=YYYY-MM]`** — la evolución del **balance** mes a mes. Responde `200`:

```json
{
  "desde": "2026-07",
  "hasta": "2026-10",
  "puntos": [
    { "periodo": "2026-07", "balance": 2000000 },
    { "periodo": "2026-08", "balance": 0 }
  ]
}
```

- `puntos`: **un punto por cada mes del rango**, también los meses sin movimientos (con `balance` 0), del más antiguo al más reciente (para la línea de tiempo del frontend). Si el rango no contiene ningún movimiento, `puntos` es `[]` (estado vacío).
- `balance` de cada mes = el `balance` de `GET /reportes/periodo` de ese mes.

## Decisiones aprobadas (2026-11-11)

> Decisión aprobada (1): **método de pago (RF-16).** RF-16 lo lista, pero RF-18 (distribución del gasto por método de pago) quedó como paquete aparte, y el dato real depende del módulo de tarjetas (las compras con tarjeta son `TARJETA_CREDITO` y no son transacciones; además un `PAGO_TARJETA` guarda el método con que se pagó, no el de la compra). Propuesta: `tipo=metodo-pago` **queda fuera** de este paquete y entra junto con el de RF-18, compartiendo su agregación. Mientras tanto, el endpoint rechaza el valor como cualquier tipo no soportado (CA-RF16-06). Hay que avisarle al frontend que el selector de 3.3.1 muestre por ahora tres tipos.

> Decisión aprobada (2): **balance o ahorro (RF-19).** Propuesta: la evolución es solo del **balance**. La evolución del ahorro ya la da `GET /ahorro/acumulado` (ahorro real de cada meta mensual, mes a mes, ya implementado en 4.3.1), así que no se duplica ni se agrega un parámetro `medida`. Alternativa: `medida=balance|ahorro` en `/reportes/evolucion`.

> Decisión aprobada (3): **rutas y nombres.** `/reportes/comparacion` y `/reportes/evolucion`, `tipo` con valores `balance`, `ingresos-egresos`, `categoria` (en minúsculas y exactos) y los nombres de campo de arriba. Cambiarlos solo cambia los criterios.

> Decisión aprobada (4): **meses sin movimientos.** Propuesta: la comparación los omite (RF-15: «los periodos en los que tenga movimientos»); la evolución los rellena con 0 (línea de tiempo continua, «un punto por mes del rango»). El rango sin datos en la evolución devuelve `puntos: []` para el estado vacío.

> Decisión aprobada (5): **extremos abiertos y «mes actual».** Propuesta: `desde`/`hasta` son independientes y, si faltan, se toman del primer/último mes con movimientos; **la serie no se extiende hasta el mes actual**, así que estos endpoints no necesitan `X-Zona-Horaria` (no se usa ni se valida). Alternativa: que sin `hasta` la evolución termine en el mes actual según la zona (agregaría ceros finales).

> Decisión aprobada (6): **tope de rango.** Propuesta: 120 meses (10 años) por el relleno de meses en la evolución; aplica también cuando el rango efectivo (con extremos abiertos) lo supera, y el mensaje pide enviar `desde`. Alternativa: sin tope en la comparación.

> Decisión aprobada (7): **balance acumulado.** Propuesta: cada punto trae solo el balance **del mes**, sin saldo acumulado. Si el front necesita la línea acumulada se agrega un campo `acumulado` (suma corrida; hay que decidir si cuenta los meses anteriores a `desde`).

> Decisión aprobada (8): **mensajes de error.** Se propone `desde debe tener el formato YYYY-MM con un mes del 01 al 12` (ídem `hasta`), `desde no puede ser posterior a hasta`, `tipo debe ser uno de: balance, ingresos-egresos, categoria` y `el rango no puede abarcar más de 120 meses`. Las pruebas exigen que el mensaje empiece por el nombre del parámetro (`desde`, `hasta`, `tipo`, `el rango`) y, para el rango invertido, el texto exacto de `GET /reportes/periodo`.

## Datos base de los ejemplos

Salvo que un criterio diga otra cosa, usuario A con estas transacciones (fechas dentro del mes):

| Mes | Movimiento | Clasificación | Monto | Categoría |
|---|---|---|---|---|
| 2026-07 | Ingreso | `ORDINARIO` | 3.000.000 | — |
| 2026-07 | Egreso | `ORDINARIO` | 1.000.000 | Hogar |
| 2026-08 | (sin movimientos) | | | |
| 2026-09 | Ingresos | `ORDINARIO` | 2.800.000 y 200.000 | — |
| 2026-09 | Egresos | `ORDINARIO` | 600.000 y 300.000 | Alimentación y Transporte |
| 2026-09 | Pago de tarjeta | `PAGO_TARJETA` | 119.802,13 | — |
| 2026-09 | Abono a deuda | `ABONO_DEUDA` | 200.000 | — |
| 2026-09 | Préstamo recibido | `DINERO_RECIBIDO` | 500.000 | — |
| 2026-10 | Ingreso | `ORDINARIO` | 2.500.000 | — |
| 2026-10 | Egreso | `ORDINARIO` | 1.254.700 | Alimentación |

Balance por mes (ADR-014: `ingresos − egresos − pagosTarjeta − abonosDeuda`, el préstamo no suma): julio 2.000.000; agosto 0; septiembre 1.780.197,87 (3.000.000 − 900.000 − 119.802,13 − 200.000); octubre 1.245.300.

---

## RF-15 — Comparar entre todos los periodos con movimientos

Los casos usan `tipo=balance` salvo que se diga otra cosa.

### CA-RF15-01 — Sin parámetros: todos los meses con movimientos, del más antiguo al más reciente

- **Dado** los datos base
- **Cuando** consulta `GET /reportes/comparacion?tipo=balance`
- **Entonces** responde 200 con `desde` `2026-07`, `hasta` `2026-10` y `periodos` con tres elementos, en este orden: `2026-07` con `balance` 2.000.000, `2026-09` con 1.780.197,87 y `2026-10` con 1.245.300; agosto (sin movimientos) no aparece

### CA-RF15-02 — Usuario sin movimientos

- **Dado** un usuario sin ningún movimiento
- **Cuando** consulta la comparación sin rango
- **Entonces** responde 200 con `periodos` `[]`, `desde` `null` y `hasta` `null` (no un error)

### CA-RF15-03 — Un solo mes con movimientos

- **Dado** un usuario con movimientos solo en `2026-10`
- **Cuando** consulta la comparación sin rango
- **Entonces** `periodos` tiene un solo elemento, `2026-10`, y `desde` y `hasta` son `2026-10`

### CA-RF15-04 — Un mes con cualquier clase de movimiento cuenta como mes con movimientos

- **Dado** un usuario cuyo único movimiento de `2026-11` es un préstamo `DINERO_RECIBIDO` de 500.000 (y otro mes con un ingreso ordinario)
- **Cuando** consulta la comparación
- **Entonces** `2026-11` aparece con `balance` 0 (el préstamo no suma al balance); lo mismo con un mes cuyo único movimiento es un `PAGO_TARJETA` de 100.000 (`balance` −100.000)

### CA-RF15-05 — Un rango con ambos extremos incluidos

- **Dado** los datos base
- **Cuando** consulta `?tipo=balance&desde=2026-09&hasta=2026-10`
- **Entonces** `desde` `2026-09`, `hasta` `2026-10` y `periodos` con `2026-09` y `2026-10` (julio no)

### CA-RF15-06 — Un extremo abierto

- **Dado** los datos base
- **Cuando** consulta solo `desde=2026-09`, y en otra consulta solo `hasta=2026-09`
- **Entonces** la primera devuelve septiembre y octubre (`hasta` efectivo `2026-10`) y la segunda devuelve julio y septiembre (`desde` efectivo `2026-07`)

### CA-RF15-07 — Un rango sin movimientos

- **Dado** los datos base
- **Cuando** consulta `?tipo=balance&desde=2026-11&hasta=2026-12`
- **Entonces** responde 200 con `periodos` `[]`, `desde` `2026-11` y `hasta` `2026-12` (lo enviado)

### CA-RF15-08 — Los meses se separan por el día calendario

- **Dado** movimientos de 1.000 el 31 de agosto y el 1 de septiembre de 2026, el 29 de febrero y el 1 de marzo de 2028, y el 31 de diciembre de 2026 y el 1 de enero de 2027 (ingresos ordinarios)
- **Cuando** consulta `?tipo=balance`
- **Entonces** cada día cae en su mes: `2026-08` y `2026-09`, `2028-02` y `2028-03`, `2026-12` y `2027-01`, cada uno con `balance` 1.000 (febrero bisiesto incluido)

### CA-RF15-09 — Validación del rango

- **Dado** una consulta con `desde=2026-10&hasta=2026-09`, con `desde` `2026-13`, `2026-9`, `octubre` o `2026-10-01`, o con `hasta` con alguno de esos valores inválidos
- **Cuando** se envía
- **Entonces** responde 400: el rango invertido con `desde no puede ser posterior a hasta` y los formatos inválidos con un mensaje que empieza por `desde` (o `hasta`); no consulta la base

### CA-RF15-10 — Un rango demasiado largo

- **Dado** una consulta con `desde=2016-12&hasta=2026-12` (121 meses)
- **Cuando** se envía
- **Entonces** responde 400 con un mensaje que dice que el rango no puede abarcar más de 120 meses; con `desde=2017-01&hasta=2026-12` (120 meses) responde 200

### CA-RF15-11 — Parámetros desconocidos

- **Dado** una consulta con `mes=2026-10`, `zona=UTC` o `foo=1` además de `tipo`
- **Cuando** se envía
- **Entonces** responde 400 (no se ignoran en silencio)

### CA-RF15-12 — Solo cuenta lo del usuario de la sesión

- **Dado** movimientos de otro usuario en los mismos meses y en `2026-05` (mes en que el usuario A no tiene nada), con categorías personales de ese otro usuario
- **Cuando** el usuario A consulta la comparación (de cualquier tipo)
- **Entonces** las cifras no incluyen nada del otro usuario y `2026-05` no aparece

### CA-RF15-13 — Las cifras de cada mes coinciden con los reportes del mes

- **Dado** los datos base
- **Cuando** consulta la comparación de `balance`, `ingresos-egresos` y `categoria`, y luego `GET /reportes/periodo?mes=<mes>` y `GET /reportes/categorias?mes=<mes>` de cada mes
- **Entonces** el `balance`, los `ingresos` y los `egresos`, y el `total` y las entradas de `categorias` de cada mes son iguales a los de esos reportes

### CA-RF15-14 — Precisión completa, sin redondear

- **Dado** egresos ordinarios de 100,10 y 200,20 en `2026-10`, y un ingreso de 1.000
- **Cuando** consulta la comparación de `ingresos-egresos`
- **Entonces** `egresos` de `2026-10` es 300,30 y `balance` (en la de balance) 699,70, sin redondear al peso (RNF-11)

### CA-RF15-15 — Los cambios se reflejan al consultar

- **Dado** un único egreso de 45.000 en `2026-10` y la comparación consultada
- **Cuando** el usuario crea un ingreso de 10.000 en `2026-12`, y luego elimina ese ingreso, y consulta después de cada paso
- **Entonces** `2026-12` aparece con `balance` 10.000 tras crearlo y desaparece tras eliminarlo (con `hasta` de vuelta en `2026-10`), sin datos guardados que se queden viejos

### CA-RF15-16 — Sin sesión válida

- **Dado** una consulta sin sesión, o con una sesión inválida
- **Cuando** se envía
- **Entonces** responde 401

---

## RF-16 — Tipo de dato de la comparación

### CA-RF16-01 — `balance`

- **Dado** los datos base
- **Cuando** consulta `?tipo=balance`
- **Entonces** `tipo` es `balance` y cada elemento tiene exactamente `periodo` y `balance` (2.000.000, 1.780.197,87 y 1.245.300; el pago de tarjeta y el abono restan, el préstamo no suma: ADR-014)

### CA-RF16-02 — `ingresos-egresos`

- **Dado** los datos base
- **Cuando** consulta `?tipo=ingresos-egresos`
- **Entonces** cada elemento tiene exactamente `periodo`, `ingresos` y `egresos`: `2026-07` 3.000.000 y 1.000.000; `2026-09` 3.000.000 (el préstamo no es ingreso propio) y 900.000 (el pago de tarjeta y el abono no son egreso propio); `2026-10` 2.500.000 y 1.254.700

### CA-RF16-03 — `categoria`

- **Dado** los datos base
- **Cuando** consulta `?tipo=categoria`
- **Entonces** cada elemento tiene exactamente `periodo`, `total` y `categorias`: `2026-07` con total 1.000.000 y Hogar 1.000.000 (`porcentaje` 100); `2026-09` con total 900.000, Alimentación 600.000 (`porcentaje` 66,666…) y Transporte 300.000 (33,333…), en ese orden; `2026-10` con total 1.254.700 y Alimentación 1.254.700 (100). Cada entrada trae `categoriaId` y `nombre` actual (como `GET /reportes/categorias`); el pago de tarjeta, el abono y el préstamo no cuentan

### CA-RF16-04 — `categoria` en un mes con movimientos pero sin gastos

- **Dado** un mes (`2026-11`) cuyo único movimiento es un ingreso ordinario de 100.000
- **Cuando** consulta `?tipo=categoria`
- **Entonces** `2026-11` aparece con `total` 0 y `categorias` `[]` (sin dividir entre cero)

### CA-RF16-05 — `categoria`: el gasto sin categoría encontrada no se pierde

- **Dado** un egreso ordinario de 30.000 cuyo `categoriaId` no corresponde a ninguna categoría y otro de 70.000 en Hogar, en el mismo mes
- **Cuando** consulta `?tipo=categoria`
- **Entonces** ese mes tiene `total` 100.000 y una entrada con `categoriaId` `null`, `nombre` `Sin categoría` y `total` 30.000, como en `GET /reportes/categorias`

### CA-RF16-06 — Tipo faltante o no soportado

- **Dado** una consulta sin `tipo`, con `tipo` vacío, o con `gastos`, `BALANCE` o `metodo-pago`
- **Cuando** se envía
- **Entonces** responde 400 con `tipo debe ser uno de: balance, ingresos-egresos, categoria` y no consulta la base

> Nota (decisión 1 aprobada): `metodo-pago` queda fuera por ahora; cuando entre, este criterio deja de incluirlo y se agregan los de ese tipo.

### CA-RF16-07 — Cambiar el tipo no cambia los meses comparados

- **Dado** los datos base
- **Cuando** consulta los tres tipos con el mismo rango
- **Entonces** los tres devuelven los mismos `periodos` (`2026-07`, `2026-09`, `2026-10`) en el mismo orden y el mismo `desde` y `hasta`

### CA-RF16-08 — Forma estable de la respuesta

- **Dado** cualquier consulta válida
- **Cuando** responde 200
- **Entonces** el cuerpo tiene exactamente `tipo`, `desde`, `hasta` y `periodos`; `periodo`, `desde` y `hasta` son cadenas `YYYY-MM` (o `null` los dos últimos sin movimientos) y los montos son números (el Adapter del frontend depende de esta forma)

---

## RF-19 — Evolución del balance en el tiempo

### CA-RF19-01 — Un punto por mes del rango, con los meses vacíos en cero

- **Dado** los datos base
- **Cuando** consulta `GET /reportes/evolucion`
- **Entonces** responde 200 con `desde` `2026-07`, `hasta` `2026-10` y cuatro puntos, del más antiguo al más reciente: `2026-07` 2.000.000, `2026-08` 0 (aparece aunque no tenga movimientos), `2026-09` 1.780.197,87 y `2026-10` 1.245.300

### CA-RF19-02 — Un solo mes

- **Dado** un usuario con movimientos solo en `2026-10`
- **Cuando** consulta la evolución sin rango
- **Entonces** `puntos` tiene un solo punto, `2026-10`, y `desde` y `hasta` son `2026-10`

### CA-RF19-03 — Un balance negativo no se trunca

- **Dado** un mes con un ingreso ordinario de 100.000 y un egreso ordinario de 350.000
- **Cuando** consulta la evolución
- **Entonces** el `balance` de ese mes es −250.000

### CA-RF19-04 — La serie cruza el cambio de año

- **Dado** movimientos en `2026-11` y `2027-02` y ninguno en diciembre ni enero
- **Cuando** consulta la evolución
- **Entonces** hay cuatro puntos: `2026-11`, `2026-12` (0), `2027-01` (0) y `2027-02`

### CA-RF19-05 — Un rango explícito más amplio que los datos

- **Dado** los datos base
- **Cuando** consulta `?desde=2026-05&hasta=2026-11`
- **Entonces** hay siete puntos de `2026-05` a `2026-11`, con 0 en mayo, junio, agosto y noviembre

### CA-RF19-06 — Extremos abiertos

- **Dado** los datos base
- **Cuando** consulta solo `desde=2026-09`, y en otra consulta solo `hasta=2026-08`
- **Entonces** la primera devuelve `2026-09` y `2026-10` (`hasta` efectivo `2026-10`) y la segunda devuelve `2026-07` y `2026-08` (`desde` efectivo `2026-07`)

### CA-RF19-07 — Un rango sin movimientos es un estado vacío, no un error

- **Dado** los datos base
- **Cuando** consulta `?desde=2026-11&hasta=2026-12`, o `?desde=2025-01&hasta=2025-06`
- **Entonces** responde 200 con `puntos` `[]` (no seis meses en cero), `desde` y `hasta` los enviados

### CA-RF19-08 — Usuario sin movimientos

- **Dado** un usuario sin ningún movimiento
- **Cuando** consulta la evolución sin rango
- **Entonces** responde 200 con `puntos` `[]`, `desde` `null` y `hasta` `null`

### CA-RF19-09 — El mes actual no se agrega a la serie

- **Dado** que hoy es el 15 de noviembre de 2026 y el último movimiento del usuario es de octubre
- **Cuando** consulta la evolución sin rango, con `X-Zona-Horaria: America/Bogota` y sin el header
- **Entonces** en ambos casos la serie termina en `2026-10` (`hasta` `2026-10`), sin un punto de noviembre

> Nota: depende de la decisión 5 (aprobada).

### CA-RF19-10 — El balance de cada mes coincide con el resumen del mes

- **Dado** los datos base
- **Cuando** consulta la evolución y `GET /reportes/periodo?mes=<mes>` de cada mes del rango
- **Entonces** el `balance` de cada punto es igual al `balance` de ese reporte (incluido agosto, 0), con las reglas de ADR-014: el pago de tarjeta y el abono restan, el préstamo no suma, y septiembre vale 1.780.197,87

### CA-RF19-11 — Los meses se separan por el día calendario

- **Dado** ingresos de 1.000 el 31 de agosto y el 1 de septiembre de 2026, y el 29 de febrero y el 1 de marzo de 2028
- **Cuando** consulta la evolución de `desde=2026-08&hasta=2026-09` y de `desde=2028-02&hasta=2028-03`
- **Entonces** cada día cuenta en su mes: 1.000 en cada uno de los cuatro meses

### CA-RF19-12 — Precisión completa, sin redondear

- **Dado** un ingreso de 1.000 y egresos ordinarios de 100,10 y 200,20 en el mismo mes
- **Cuando** consulta la evolución
- **Entonces** el `balance` es 699,70, sin redondear al peso (RNF-11)

### CA-RF19-13 — Validación del rango

- **Dado** una consulta con `desde` posterior a `hasta`, con un `desde` o `hasta` con formato inválido (`2026-13`, `2026-9`, `octubre`, `2026-10-01`), con un rango de 121 meses, o con un parámetro desconocido (`mes`, `medida`, `foo`)
- **Cuando** se envía
- **Entonces** responde 400 (los mismos mensajes que CA-RF15-09 y CA-RF15-10); `desde=2017-01&hasta=2026-12` (120 meses) responde 200

### CA-RF19-14 — Solo cuenta lo del usuario de la sesión

- **Dado** movimientos de otro usuario en los mismos meses y en meses en que el usuario A no tiene nada
- **Cuando** el usuario A consulta la evolución
- **Entonces** los balances no incluyen nada del otro usuario y el rango por defecto solo abarca los meses del usuario A

### CA-RF19-15 — Los cambios se reflejan al consultar

- **Dado** un único ingreso de 100.000 en `2026-10` y la evolución consultada (un punto)
- **Cuando** el usuario crea un egreso de 30.000 en `2026-10`, lo edita a 40.000 y crea un ingreso de 5.000 en `2026-12`, y consulta después de cada paso
- **Entonces** el balance de octubre es 70.000, luego 60.000, y aparecen `2026-11` (0) y `2026-12` (5.000), sin datos guardados que se queden viejos

### CA-RF19-16 — Sin sesión válida

- **Dado** una consulta sin sesión, o con una sesión inválida
- **Cuando** se envía
- **Entonces** responde 401

### CA-RF19-17 — Forma estable de la respuesta

- **Dado** cualquier consulta válida
- **Cuando** responde 200
- **Entonces** el cuerpo tiene exactamente `desde`, `hasta` y `puntos`; cada punto tiene exactamente `periodo` (`YYYY-MM`) y `balance` (número)

---

## Partición en paquetes de implementación (propuesta)

Dos paquetes, en este orden (la EDT no tiene paquete para ellos: el número lo asigna el arquitecto, por ejemplo 3.1.3 y 3.1.4):

1. **Evolución (RF-19, CA-RF19-01..17).** Es el más pequeño y lo necesita primero el frontend (3.2.4). Crea las piezas compartidas: el DTO de rango por meses `desde`/`hasta` `YYYY-MM` (validaciones y tope de 120 meses) y el agrupado mensual del balance.
2. **Comparación (RF-15 y RF-16, CA-RF15-01..16 y CA-RF16-01..08).** Reutiliza lo anterior y suma los tres tipos; lo consume 3.3.1. RF-15 y RF-16 van juntos porque el endpoint no tiene sentido sin `tipo`.

El tipo `metodo-pago` va con el paquete de RF-18 (decisión 1).
