# Criterios de aceptación — 3 Reportes: zona horaria del "mes actual"

Estado: Borrador

## Ajuste a RF-13 — El mes actual según la ubicación del usuario

Resuelve la decisión pendiente (4) del paquete 3.1.1 (`criterios/03-reportes.md`): Aequo es web y se usa desde cualquier lugar, así que "el mes actual" es el del lugar donde está el usuario, no el del servidor (que corre en UTC). Ejemplo del problema: el 31 de octubre a las 8 p. m. en Bogotá ya es 1 de noviembre en UTC, y el reporte "del mes actual" saldría de noviembre, vacío.

Solo afecta al **mes actual por defecto** (consulta sin `mes`, `desde` ni `hasta`). Los movimientos se guardan con el día que el usuario eligió, a medianoche UTC, así que no cambian; y un `mes` o un rango explícitos ya son días de calendario, sin zona.

Aplica a los dos endpoints que hoy usan "hoy": `GET /reportes/periodo` (3.1.1) y `GET /reportes/categorias` (3.1.2). Es un cambio aparte del 3.1.2: las pruebas del 3.1.2 no cambian (usan un instante del mediodía UTC de mitad de mes, que es el mismo día en cualquier zona).

### Contrato propuesto (a aprobar)

- Header opcional `X-Zona-Horaria` con el nombre IANA de la zona del usuario, por ejemplo `America/Bogota`. El navegador la conoce con `Intl.DateTimeFormat().resolvedOptions().timeZone`; el Adapter del frontend la puede enviar en todas las peticiones.
- Con el header, "hoy" es la fecha de ese instante **en esa zona** (con su horario de verano, si lo tiene) y el mes actual es el de esa fecha.
- Sin el header, se mantiene el comportamiento de hoy: "hoy" en UTC.
- Un valor que no es una zona IANA válida responde 400, aunque la petición traiga `mes` o un rango (así un error del cliente no pasa desapercibido hasta el día que dependa de él). No se consulta la base.
- La respuesta no cambia: `desde` y `hasta` ya dicen qué periodo se usó.

### Decisiones que necesito de ti antes de escribir las pruebas

> Pendiente de decisión (1): **header o parámetro de consulta.** Propongo el header porque el frontend lo envía una sola vez en su cliente HTTP y lo aprovechan los módulos que también necesitan "hoy" (ingresos recurrentes del mes, meta de ahorro mensual, presupuesto), sin repetir un parámetro en cada DTO. La alternativa es un parámetro `zona` en la consulta de cada endpoint. Cambia el nombre en todos los criterios, nada más.

> Pendiente de decisión (2): **sin zona, UTC.** Lo propongo para no romper al frontend actual ni a las pruebas existentes. La alternativa es exigir la zona (400 si falta), más estricta pero rompe a quien no la envíe.

> Pendiente de decisión (3): **mensaje de la zona inválida.** Propongo que mencione `X-Zona-Horaria` (por ejemplo, `X-Zona-Horaria debe ser un nombre de zona horaria IANA válido, como America/Bogota`). La prueba solo exige que lo mencione.

> Aviso: es un cambio de contrato visible para el frontend (`aequo-frontend`): su Adapter debe enviar el header. Hay que avisar a esa sesión cuando se apruebe.

---

## CA-RF13 — Mes actual por defecto según la zona del usuario

Todos los casos se prueban en `GET /reportes/periodo` y en `GET /reportes/categorias` (el mismo resultado de periodo en ambos).

### CA-RF13-04 — Zona detrás de UTC: todavía es el mes anterior

- **Dado** que en UTC es el 1 de noviembre de 2026, 01:00 (en Bogotá es el 31 de octubre, 8:00 p. m.), y el usuario tiene movimientos el 20 de octubre y el 5 de noviembre
- **Cuando** consulta sin `mes` ni rango, con `X-Zona-Horaria: America/Bogota`
- **Entonces** responde con `desde` `2026-10-01` y `hasta` `2026-10-31`, y cuenta solo el movimiento del 20 de octubre

### CA-RF13-05 — La misma consulta sin zona usa UTC

- **Dado** el mismo instante y los mismos movimientos del caso anterior
- **Cuando** consulta sin `mes` ni rango y sin el header
- **Entonces** responde con `desde` `2026-11-01` y `hasta` `2026-11-30`, y cuenta solo el movimiento del 5 de noviembre

### CA-RF13-06 — Zona adelantada respecto a UTC: ya es el mes siguiente

- **Dado** que en UTC es el 31 de octubre de 2026, 12:00 (en Auckland, con horario de verano, ya es el 1 de noviembre, 1:00 a. m.), y el usuario tiene movimientos el 20 de octubre y el 5 de noviembre
- **Cuando** consulta sin `mes` ni rango, con `X-Zona-Horaria: Pacific/Auckland`
- **Entonces** responde con `desde` `2026-11-01` y `hasta` `2026-11-30`, y cuenta solo el movimiento del 5 de noviembre

### CA-RF13-07 — El cambio de año también sigue la zona

- **Dado** que en UTC es el 1 de enero de 2027, 02:00 (en Bogotá es el 31 de diciembre de 2026, 9:00 p. m.)
- **Cuando** consulta sin `mes` ni rango, con `X-Zona-Horaria: America/Bogota`
- **Entonces** responde con `desde` `2026-12-01` y `hasta` `2026-12-31`

### CA-RF13-08 — Con un `mes` o un rango, la zona no cambia nada

- **Dado** el instante del caso CA-RF13-04 y movimientos del 20 de octubre y del 5 de noviembre
- **Cuando** consulta `?mes=2026-11`, y por otro lado `?desde=2026-11-01&hasta=2026-11-30`, con `X-Zona-Horaria: America/Bogota` y sin el header
- **Entonces** las cuatro consultas devuelven el mismo periodo (`2026-11-01` a `2026-11-30`) y el mismo total, el del 5 de noviembre

### CA-RF13-09 — Una zona inválida responde 400

- **Dado** un header `X-Zona-Horaria` con `Marte/Olympus`, `UTC+5` o `12345`
- **Cuando** consulta sin parámetros
- **Entonces** responde 400 con un mensaje que menciona `X-Zona-Horaria`, y no consulta la base

### CA-RF13-10 — Una zona inválida también se rechaza si la petición trae `mes` o un rango

- **Dado** un header `X-Zona-Horaria: Marte/Olympus`
- **Cuando** consulta `?mes=2026-10` (o `?desde=2026-10-01&hasta=2026-10-31`)
- **Entonces** responde 400 con el mismo mensaje del caso anterior, y no consulta la base

### CA-RF13-11 — Los nombres IANA válidos se aceptan

- **Dado** un header `X-Zona-Horaria` con `America/Bogota`, `UTC`, `Europe/Madrid` o `America/Argentina/Buenos_Aires`
- **Cuando** consulta `?mes=2026-10`
- **Entonces** responde 200 con el periodo de octubre de 2026

### CA-RF13-12 — La zona sigue el horario de verano

- **Dado** que en UTC es el 1 de abril de 2026, 03:30 (en Madrid, en horario de verano, UTC+2, ya es el 1 de abril, 5:30 a. m.; en Nueva York, UTC−4, todavía es el 31 de marzo, 11:30 p. m.)
- **Cuando** consulta sin `mes` ni rango, con `X-Zona-Horaria: America/New_York` y, en otra consulta, con `Europe/Madrid`
- **Entonces** con Nueva York el periodo es marzo (`2026-03-01` a `2026-03-31`) y con Madrid es abril (`2026-04-01` a `2026-04-30`)
