# Criterios de aceptación — 2 Registro (transacciones y categorías)

Estado: Borrador

> Este archivo solo contiene, por ahora, los criterios del paquete 2.2.7 (deduplicación de peticiones con `Idempotency-Key`). Se redactaron **a posteriori**, derivados de las pruebas que ya existían en `src/idempotencia/` (CA-RF06-01 a CA-RF06-20) y de los mutantes sobrevivientes de Stryker (CA-RF06-21 a CA-RF06-29), porque el paquete se implementó sin criterios escritos. Todos están marcados como "Agregado en refuerzo" y necesitan la aprobación del desarrollador.
>
> Pendiente de decisión: el paquete 2.2.7 no aparece en el Diccionario de la EDT (el 2.2 termina en 2.2.6) y la Especificación de Requisitos no tiene un RF de deduplicación. Se ancla a RF-06 (registro de un movimiento) solo para poder numerar los criterios; hay que decidir si se crea un RF propio y se renumeran. Los criterios aplican a toda creación que lleve `@Idempotente()` (hoy `POST /transacciones` y `POST /categorias`).

## RF-06 — Deduplicación de peticiones de creación (paquete 2.2.7)

### CA-RF06-01 — Repetir la misma petición no crea un segundo registro

> Agregado en refuerzo

- **Dado** una creación ya completada con éxito usando un `Idempotency-Key` (UUID)
- **Cuando** el mismo usuario envía la misma petición (mismo método, ruta y cuerpo) con la misma clave
- **Entonces** recibe el mismo código y el mismo cuerpo que la primera respuesta, con la cabecera `Idempotent-Replayed: true`; no se crea ningún registro nuevo, y la primera respuesta no lleva esa cabecera

### CA-RF06-02 — Las repeticiones sucesivas siempre devuelven lo mismo

> Agregado en refuerzo

- **Dado** una creación completada con una clave
- **Cuando** se repite la petición varias veces, incluso a la vez
- **Entonces** todas devuelven el mismo `id` que la primera y sigue habiendo un solo registro

### CA-RF06-03 — El orden de los campos del cuerpo no importa

> Agregado en refuerzo

- **Dado** una creación completada con una clave
- **Cuando** se repite con la misma clave y los mismos campos en otro orden
- **Entonces** se trata como la misma petición: se reenvía la respuesta guardada con `Idempotent-Replayed: true` y no se crea nada

### CA-RF06-04 — El nombre de la cabecera no distingue mayúsculas

> Agregado en refuerzo

- **Dado** una creación hecha con la cabecera escrita `IDEMPOTENCY-KEY`
- **Cuando** se repite con `Idempotency-Key` y la misma clave
- **Entonces** se reconoce como la misma clave: respuesta repetida y un solo registro

### CA-RF06-05 — Claves distintas son acciones distintas

> Agregado en refuerzo

- **Dado** dos peticiones con exactamente el mismo contenido
- **Cuando** cada una lleva un `Idempotency-Key` distinto
- **Entonces** ambas responden 201 con `id` distintos y se crean dos registros

### CA-RF06-06 — Doble toque simultáneo: la segunda recibe 409

> Agregado en refuerzo

- **Dado** dos peticiones iguales con la misma clave que llegan a la vez, mientras la primera sigue ejecutándose
- **Cuando** el servidor las procesa
- **Entonces** una responde 201 y la otra 409 con `message` "La petición ya se está procesando: espera su resultado antes de reintentar" y `error` "Conflict"; solo se crea un registro

### CA-RF06-07 — Terminada la primera, el reintento recibe su respuesta

> Agregado en refuerzo

- **Dado** que la petición que estaba en proceso ya terminó con 201
- **Cuando** llega un reintento con la misma clave
- **Entonces** recibe 201 con el mismo cuerpo, con `Idempotent-Replayed: true`, y no se ejecuta nada

### CA-RF06-08 — Una clave "en proceso" abandonada se puede reclamar

> Agregado en refuerzo

- **Dado** una clave en estado EN_PROCESO con más de 2 minutos de antigüedad (el servidor se cayó a mitad)
- **Cuando** llega una petición igual con esa clave
- **Entonces** se reclama de nuevo, se ejecuta y responde 201; se crea un registro

### CA-RF06-09 — Una clave "en proceso" reciente sigue bloqueando

> Agregado en refuerzo

- **Dado** una clave en estado EN_PROCESO creada hace instantes
- **Cuando** llega una petición igual con esa clave
- **Entonces** responde 409 y no se crea ningún registro

### CA-RF06-10 — La misma clave con otra petición responde 422

> Agregado en refuerzo

- **Dado** una creación completada con una clave
- **Cuando** se usa esa clave con otro monto, con otro campo o en otra ruta
- **Entonces** responde 422 con `message` "La clave Idempotency-Key ya se usó con otra petición: genera una clave nueva para una acción nueva" y `error` "Unprocessable Entity"; no se crea nada

### CA-RF06-11 — Si la primera falla con 400, la clave se libera

> Agregado en refuerzo

- **Dado** una petición con clave que falla por validación (por ejemplo, monto 0)
- **Cuando** se reenvía con la misma clave el cuerpo corregido
- **Entonces** la primera responde 400, la segunda 201 sin `Idempotent-Replayed`, y hay un solo registro

### CA-RF06-12 — Si la primera falla con 500, la clave se libera

> Agregado en refuerzo

- **Dado** una petición con clave que falla por un error inesperado (500)
- **Cuando** se reintenta con la misma clave, y luego otra vez
- **Entonces** el reintento se ejecuta y responde 201, la siguiente repetición responde con `Idempotent-Replayed: true`, y hay un solo registro

### CA-RF06-13 — Una petición fallida no deja la clave guardada

> Agregado en refuerzo

- **Dado** una petición con clave que falla (400)
- **Cuando** termina
- **Entonces** no queda ningún documento de idempotencia guardado

### CA-RF06-14 — La clave es por usuario

> Agregado en refuerzo

- **Dado** un usuario que ya completó una creación con un UUID
- **Cuando** otro usuario envía una petición con el mismo UUID
- **Entonces** la de este se ejecuta normalmente (201, `id` distinto, sin `Idempotent-Replayed`) y no recibe la respuesta ajena

### CA-RF06-15 — Sin cabecera, en modo opcional, la petición se ejecuta normal

> Agregado en refuerzo

- **Dado** que `IDEMPOTENCIA_OBLIGATORIA` no es `true`
- **Cuando** se envían dos peticiones iguales sin `Idempotency-Key`
- **Entonces** ambas responden 201, se crean dos registros y no se guarda ninguna clave

### CA-RF06-16 — Sin cabecera, en modo obligatorio, responde 400

> Agregado en refuerzo

- **Dado** que `IDEMPOTENCIA_OBLIGATORIA` es `true`
- **Cuando** se envía una creación sin `Idempotency-Key`
- **Entonces** responde 400 con `message` `["Idempotency-Key es obligatorio: envía un UUID distinto por cada acción del usuario"]` y no se crea nada; con el header presente, la misma petición responde 201

### CA-RF06-17 — Una clave que no es UUID responde 400

> Agregado en refuerzo

- **Dado** un `Idempotency-Key` que no es un UUID (por ejemplo `abc`, vacío, o con un dígito menos)
- **Cuando** se envía una creación
- **Entonces** responde 400 con `message` `["Idempotency-Key debe ser un UUID (por ejemplo, el de crypto.randomUUID())"]` y no se crea nada

### CA-RF06-18 — Las peticiones que no crean datos ignoran la cabecera

> Agregado en refuerzo

- **Dado** un `GET /transacciones` con un `Idempotency-Key` cualquiera, aunque no sea un UUID
- **Cuando** se envía
- **Entonces** responde 200

### CA-RF06-19 — Sin sesión válida, 401 antes de mirar la clave

> Agregado en refuerzo

- **Dado** una creación con `Idempotency-Key` válido y sin sesión
- **Cuando** se envía
- **Entonces** responde 401 y no se guarda ninguna clave

### CA-RF06-20 — La huella identifica la petición

> Agregado en refuerzo

- **Dado** la huella de una petición (método, ruta y cuerpo)
- **Cuando** se calcula para peticiones equivalentes o distintas
- **Entonces** es un hash hexadecimal de 64 caracteres; es igual si solo cambia el orden de los campos (también anidados), si hay campos `undefined` o si el método difiere en mayúsculas; un cuerpo ausente equivale a `{}`; y cambia si cambia el monto, un campo, la ruta o el método, el orden de los elementos de una lista, o el tipo de un valor (`1` frente a `"1"`)

### CA-RF06-21 — Un fallo inesperado al reclamar la clave no se disfraza de "en proceso"

> Agregado en refuerzo

- **Dado** que la base de datos falla al guardar la clave con un error que no es de clave duplicada (sin código, o con otro código como 121)
- **Cuando** llega una creación con un `Idempotency-Key` válido
- **Entonces** responde 500, no se ejecuta la creación y no se crea ningún registro (no responde 409)

### CA-RF06-22 — Si la clave se libera entre medias, se reclama de nuevo

> Agregado en refuerzo

- **Dado** que al reclamar la clave la base responde "ya existe", pero al consultarla ya no está (la liberó la petición que la tenía)
- **Cuando** llega la creación
- **Entonces** se vuelve a reclamar (2 intentos en total), se ejecuta y responde 201 con un solo registro

### CA-RF06-23 — El reintento de reclamo está acotado a uno

> Agregado en refuerzo

- **Dado** que la base responde "ya existe" en cada intento de reclamo, y la clave no aparece al consultarla
- **Cuando** llega la creación
- **Entonces** tras 2 intentos en total responde 409 con `message` "La petición ya se está procesando: espera su resultado antes de reintentar", sin ejecutar nada y sin quedarse en un ciclo infinito

> Pendiente de decisión: el número de intentos (2) sale del código, no de un RF. Confirmar que "reintentar una sola vez" es la regla deseada.

### CA-RF06-24 — El límite de abandono es de 2 minutos exactos

> Agregado en refuerzo

- **Dado** una clave EN_PROCESO de la misma petición
- **Cuando** su antigüedad es exactamente 2 minutos (120.000 ms) y llega la petición
- **Entonces** todavía bloquea: responde 409 y no se crea nada
- **Y cuando** su antigüedad es de 2 minutos y 1 ms, se da por abandonada: se reclama de nuevo, se ejecuta y responde 201

### CA-RF06-25 — Si no se puede guardar la respuesta, la creación igual se responde

> Agregado en refuerzo

- **Dado** que la creación se ejecutó bien pero la base falla al guardar la respuesta de la clave
- **Cuando** termina la petición
- **Entonces** el cliente recibe igualmente 201 con el registro creado, se deja constancia en el registro de errores con el mensaje "No se pudo guardar la respuesta de la clave <id de la clave>" y el error original, y la clave queda EN_PROCESO: un reintento inmediato con la misma clave responde 409 y no crea un segundo registro

### CA-RF06-26 — Si no se puede liberar la clave, se responde el error original

> Agregado en refuerzo

- **Dado** una petición con clave que falla (por ejemplo, 400 por monto 0) y la base falla al liberar la clave
- **Cuando** termina la petición
- **Entonces** el cliente recibe el error original (400, no un 500), y se deja constancia con el mensaje "No se pudo liberar la clave <id de la clave>" y el error de la base

### CA-RF06-27 — La huella tiene un formato estable

> Agregado en refuerzo

- **Dado** que las huellas se guardan en la base y se comparan en peticiones posteriores, incluso tras un despliegue nuevo
- **Cuando** se calcula la huella de una petición
- **Entonces** es el SHA-256 hexadecimal del texto `METODO RUTA` (método en mayúsculas), un salto de línea y el cuerpo en JSON canónico sin espacios; por ejemplo `POST /transacciones\n{"monto":45000,"tipo":"EGRESO"}`, y con cuerpo ausente `POST /transacciones\n{}`

### CA-RF06-28 — Los campos del cuerpo se ordenan por código de carácter

> Agregado en refuerzo

- **Dado** un cuerpo con varios campos, en cualquier orden de llegada
- **Cuando** se calcula la huella
- **Entonces** las claves se ordenan de forma ascendente por código de carácter (las mayúsculas van antes que las minúsculas: `{"B":2,"a":1}`), con el mismo resultado para todas las permutaciones de los campos, y se separan por coma

### CA-RF06-29 — Nulos, primitivos y listas en el cuerpo

> Agregado en refuerzo

- **Dado** un cuerpo con valores `null`, texto, booleanos, listas y objetos dentro de listas
- **Cuando** se calcula la huella
- **Entonces** se serializan como JSON (`null`, `"x"`, `true`), las listas conservan su orden y separan los elementos con coma, los objetos dentro de listas también se ordenan, y un `undefined` dentro de una lista cuenta como `null`, igual que en JSON
