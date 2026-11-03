# Criterios de aceptación — 2 Registro (transacciones y categorías)

Estado: Borrador

> Este archivo contiene los criterios del paquete 2.2.7 (deduplicación de peticiones con `Idempotency-Key`, CA-RF06-01 a CA-RF06-29) y, más abajo, los del paquete 2.2.6 (CRUD de transacciones). Los de 2.2.7 se redactaron **a posteriori**, derivados de las pruebas que ya existían en `src/idempotencia/` (CA-RF06-01 a CA-RF06-20) y de los mutantes sobrevivientes de Stryker (CA-RF06-21 a CA-RF06-29), porque el paquete se implementó sin criterios escritos. Todos están marcados como "Agregado en refuerzo" y necesitan la aprobación del desarrollador.
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

---

## Paquete 2.2.6 — CRUD de transacciones (`POST`, `GET`, `PATCH` y `DELETE /transacciones`)

El CRUD ya está implementado y mezclado (paquetes 2.2.1 a 2.2.3) con 167 pruebas en `src/transacciones/` (incluidas las del esquema y el cursor) que no llevan ID de criterio. Estos criterios se redactaron **a posteriori** para dar trazabilidad: cada uno indica la **prueba existente** que lo cubre, y los que traen **prueba nueva** salen de huecos que dejó Stryker (`transacciones.service.ts` 88,51 %, `cursor.ts` 75 %). Todos están marcados como "Agregado en refuerzo" y necesitan la aprobación del desarrollador. Las pruebas existentes no se renombran ni se tocan.

> Pendiente de decisión (1): **numeración.** Los criterios de registro (RF-06) continúan desde CA-RF06-30 porque CA-RF06-01 a 29 ya son de la deduplicación (2.2.7, anclada a RF-06 de forma provisional). Si se crea un RF propio para la deduplicación y se renumera, estos quedarían de CA-RF06-01 en adelante.

> Pendiente de decisión (2): **el listado y el borrado no tienen RF propio.** RF-08 habla de editar; no hay RF de listar ni de eliminar movimientos. Propongo anclar el borrado a RF-08 (CA-RF08-16 en adelante) y el listado a RF-09 (CA-RF09-02 en adelante, por la consulta según la fecha).

> Pendiente de decisión (3): **trazabilidad de las pruebas existentes.** Propongo no renombrarlas y mantener la tabla de "prueba existente" de estos criterios. Si prefieres que cada `it(...)` empiece por su ID (como exige la regla para las pruebas nuevas), habría que renombrar las pruebas del CRUD en un commit aparte.

### RF-05 — Registrar eligiendo ingreso o egreso

#### CA-RF05-01 — Un solo endpoint registra ingresos y egresos

> Agregado en refuerzo · Prueba existente: «registra un egreso…» y «el mismo endpoint registra ingresos…»

- **Dado** un usuario con sesión
- **Cuando** envía `POST /transacciones` con `tipo` `EGRESO` y, en otra petición, con `tipo` `INGRESO` (cada una con una categoría de su tipo)
- **Entonces** ambas responden 201 con el `tipo` enviado; el tipo lo fija el cliente en el cuerpo y no existen rutas separadas para ingreso y egreso

#### CA-RF05-02 — El tipo es obligatorio y solo admite INGRESO o EGRESO

> Agregado en refuerzo · Prueba existente: «tipo desconocido» y «falta el campo obligatorio tipo»

- **Dado** un registro sin `tipo` o con un `tipo` distinto de `INGRESO` y `EGRESO`
- **Cuando** se envía
- **Entonces** responde 400 con un mensaje que empieza por `tipo` y no se guarda nada

### RF-06 — Registrar un movimiento con descripción, monto, fecha, categoría y método

#### CA-RF06-30 — Registro correcto

> Agregado en refuerzo · Prueba existente: «registra un egreso y devuelve la transacción como quedó guardada…»

- **Dado** un egreso válido de $45.000, fecha 2026-10-20, categoría general "Alimentación", método EFECTIVO y descripción "Mercado de la semana"
- **Cuando** se envía `POST /transacciones`
- **Entonces** responde 201 con exactamente `id`, `tipo`, `monto`, `fecha` (`YYYY-MM-DD`), `categoriaId`, `categoria` (id, nombre, tipo, esPredeterminada), `metodoPago`, `descripcion`, `clasificacionFlujo` `ORDINARIO` y `creadaEn`

#### CA-RF06-31 — Categoría personalizada propia

> Agregado en refuerzo · Prueba existente: «acepta una categoría personalizada del propio usuario»

- **Dado** una categoría personalizada del usuario, del mismo tipo que el movimiento
- **Cuando** registra un movimiento con ella
- **Entonces** responde 201 y `categoria.esPredeterminada` es `false`

#### CA-RF06-32 — El movimiento queda a nombre del usuario de la sesión

> Agregado en refuerzo · Prueba existente: «la transacción queda a nombre del usuario del JWT…»

- **Dado** un registro válido
- **Cuando** se guarda
- **Entonces** queda con el `usuarioId` de la sesión, `clasificacionFlujo` `ORDINARIO` y la fecha a medianoche UTC del día indicado

#### CA-RF06-33 — La descripción es opcional

> Agregado en refuerzo · Prueba existente: «sin descripción queda con descripción vacía»

- **Dado** un registro válido sin `descripcion`
- **Cuando** se envía
- **Entonces** responde 201 con `descripcion` igual a `""`

#### CA-RF06-34 — Límite de la descripción

> Agregado en refuerzo · Prueba existente: «descripción de más de 200 caracteres» y «descripción que no es texto» (rechazos) · **Prueba nueva:** el borde exacto

- **Dado** una descripción de exactamente 200 caracteres
- **Cuando** se registra
- **Entonces** responde 201 y la devuelve completa
- **Y cuando** tiene 201 caracteres o no es texto, responde 400 con un mensaje que empieza por `descripcion`

#### CA-RF06-35 — Montos válidos

> Agregado en refuerzo · Prueba existente: «acepta un entero / un decimal de 2 cifras / el monto mínimo» · **Prueba nueva:** el tope exacto

- **Dado** un monto de 45000, de 1234,56, de 0,01 o de exactamente 999.999.999.999 (el tope)
- **Cuando** se registra
- **Entonces** responde 201 y devuelve el mismo monto

#### CA-RF06-36 — Montos inválidos

> Agregado en refuerzo · Prueba existente: «monto en cero / negativo / que no es número / con 3 decimales / sobre el tope»

- **Dado** un monto de 0, negativo, texto, con 3 decimales o de 1.000.000.000.000
- **Cuando** se registra
- **Entonces** responde 400 con un mensaje que empieza por `monto` y no se guarda nada

#### CA-RF06-37 — Fechas inválidas

> Agregado en refuerzo · Prueba existente: «fecha con otro formato / que no existe en el calendario / con hora / vacía»

- **Dado** una fecha `20-10-2026`, `2026-02-30`, `2026-10-20T10:00:00Z` o vacía
- **Cuando** se registra
- **Entonces** responde 400 con un mensaje que empieza por `fecha` y no se guarda nada

#### CA-RF06-38 — Campos obligatorios

> Agregado en refuerzo · Prueba existente: «falta el campo obligatorio %s»

- **Dado** un registro al que le falta `tipo`, `monto`, `fecha`, `categoriaId` o `metodoPago`
- **Cuando** se envía
- **Entonces** responde 400 con un mensaje que empieza por el campo faltante y no se guarda nada

#### CA-RF06-39 — Varios problemas a la vez

> Agregado en refuerzo · Prueba existente: «informa varios problemas a la vez, uno por campo»

- **Dado** un registro con `tipo`, `monto`, `fecha`, `categoriaId` y `metodoPago` inválidos a la vez
- **Cuando** se envía
- **Entonces** responde 400 con un mensaje por cada campo

#### CA-RF06-40 — El cliente no decide los campos del servidor

> Agregado en refuerzo · Prueba existente: «rechaza el campo %s: el cliente no lo decide…»

- **Dado** un registro que incluye `usuarioId`, `clasificacionFlujo`, `tarjetaId`, `deudaId`, `id`, `creadaEn` o `categoria`
- **Cuando** se envía
- **Entonces** responde 400 con un mensaje que menciona el campo (se rechaza, no se ignora) y no se guarda nada

#### CA-RF06-41 — La categoría debe estar disponible y ser del mismo tipo

> Agregado en refuerzo · Prueba existente: «responde 400 … si la categoría no existe / es de otro usuario / es de otro tipo»

- **Dado** una `categoriaId` que no existe, que es personalizada de otro usuario, o cuyo tipo no coincide con el del movimiento
- **Cuando** se registra
- **Entonces** responde 400 con un mensaje que empieza por `categoriaId` y no se guarda nada

#### CA-RF06-42 — Sin sesión válida

> Agregado en refuerzo · Prueba existente: «responde 401 %s y no guarda nada»

- **Dado** una petición sin token o con un token que no emitió este backend
- **Cuando** se envía `POST /transacciones`
- **Entonces** responde 401 con `message` "Sesión inválida o vencida" y no se guarda nada

### RF-07 — Método de pago

#### CA-RF07-01 — Métodos aceptados

> Agregado en refuerzo · **Prueba nueva** (hoy solo se ejercita EFECTIVO y TRANSFERENCIA; DEBITO no)

- **Dado** un registro válido con `metodoPago` `EFECTIVO`, `DEBITO` o `TRANSFERENCIA`
- **Cuando** se envía
- **Entonces** responde 201 con ese método

#### CA-RF07-02 — La tarjeta de crédito no es un método de la transacción

> Agregado en refuerzo · Prueba existente: «método de pago TARJETA_CREDITO» y «el mensaje de TARJETA_CREDITO explica…»

- **Dado** un registro con `metodoPago` `TARJETA_CREDITO`
- **Cuando** se envía
- **Entonces** responde 400 con el mensaje "metodoPago debe ser EFECTIVO, DEBITO o TRANSFERENCIA; las compras con tarjeta de crédito se registran en el módulo de tarjetas" y no se guarda nada

#### CA-RF07-03 — Un método desconocido

> Agregado en refuerzo · Prueba existente: «método de pago desconocido»

- **Dado** un registro con `metodoPago` `CHEQUE`
- **Cuando** se envía
- **Entonces** responde 400 con un mensaje que empieza por `metodoPago`

### RF-08 — Editar un movimiento (`PATCH /transacciones/:id`)

#### CA-RF08-01 — Cambia solo lo que se envía

> Agregado en refuerzo · Prueba existente: «cambia solo lo que se envía y devuelve la transacción completa…»

- **Dado** una transacción propia ordinaria
- **Cuando** se envía `PATCH` con solo `monto`
- **Entonces** responde 200 con la transacción completa y actualizada, con su categoría; los demás campos no cambian

#### CA-RF08-02 — Todos los campos a la vez

> Agregado en refuerzo · Prueba existente: «edita todos los campos a la vez…»

- **Dado** una transacción propia
- **Cuando** se envían `tipo`, `monto`, `fecha`, `categoriaId`, `metodoPago` y `descripcion`
- **Entonces** responde 200 y todos quedan actualizados

#### CA-RF08-03 — Cambiar de egreso a ingreso

> Agregado en refuerzo · Prueba existente: «permite cambiar un egreso a ingreso (RF-08)…»

- **Dado** un egreso propio
- **Cuando** se envía `tipo` `INGRESO` junto con una categoría de ingreso
- **Entonces** responde 200 con el movimiento convertido en ingreso

#### CA-RF08-04 — Cambiar el tipo sin enviar categoría

> Agregado en refuerzo · Prueba existente: «al cambiar el tipo sin enviar categoría responde 400…» (solo comprueba que empiece por `categoriaId`) · **Prueba nueva:** el texto exacto

- **Dado** un egreso propio
- **Cuando** se envía solo `tipo` `INGRESO`
- **Entonces** responde 400 con el mensaje "categoriaId es obligatorio al cambiar el tipo: envía una categoría del nuevo tipo" y el movimiento no cambia

#### CA-RF08-05 — Categoría no disponible o de otro tipo

> Agregado en refuerzo · Prueba existente: «responde 400 si la categoría es de otro tipo / de otro usuario / inexistente / de egreso al cambiar a ingreso» (solo comprueba que empiece por `categoriaId`) · **Prueba nueva:** el texto exacto

- **Dado** una transacción propia
- **Cuando** se envía `categoriaId` de otro tipo, personalizada de otro usuario o inexistente, con o sin `tipo`; o `tipo` y una categoría que no es del nuevo tipo
- **Entonces** responde 400 con el mensaje "categoriaId debe ser una categoría general o tuya del mismo tipo que el movimiento" (no el de CA-RF08-04) y el movimiento no cambia

#### CA-RF08-06 — Cambiar solo la categoría

> Agregado en refuerzo · Prueba existente: «cambia solo la categoría a otra del mismo tipo»

- **Dado** una transacción propia
- **Cuando** se envía solo una `categoriaId` del mismo tipo
- **Entonces** responde 200 con la nueva categoría

#### CA-RF08-07 — Dejar la descripción vacía

> Agregado en refuerzo · Prueba existente: «permite dejar la descripción vacía»

- **Dado** una transacción con descripción
- **Cuando** se envía `descripcion` igual a `""`
- **Entonces** responde 200 y la descripción queda vacía

#### CA-RF08-08 — Un cuerpo vacío

> Agregado en refuerzo · Prueba existente: «un cuerpo vacío responde 400…»

- **Dado** un `PATCH` con cuerpo `{}`
- **Cuando** se envía
- **Entonces** responde 400 ("Debes enviar al menos un campo para modificar") y no cambia nada

#### CA-RF08-09 — Las mismas validaciones que el registro

> Agregado en refuerzo · Prueba existente: «%s responde 400 con un mensaje que empieza por el campo y no cambia nada»

- **Dado** un `PATCH` con monto 0, monto con 3 decimales, fecha inexistente o con otro formato, tipo desconocido, método `TARJETA_CREDITO`, descripción de más de 200 caracteres o categoría que no es un id
- **Cuando** se envía
- **Entonces** responde 400 con un mensaje que empieza por el campo y no cambia nada

#### CA-RF08-10 — El cliente no decide los campos del servidor

> Agregado en refuerzo · Prueba existente: «rechaza el campo %s…» (en la edición)

- **Dado** un `PATCH` que incluye `usuarioId`, `clasificacionFlujo`, `tarjetaId`, `deudaId`, `id`, `creadaEn` o `categoria`
- **Cuando** se envía
- **Entonces** responde 400 con un mensaje que menciona el campo

#### CA-RF08-11 — Un id que no es válido

> Agregado en refuerzo · Prueba existente: «un id que no es válido responde 400» (edición)

- **Dado** una ruta `PATCH /transacciones/abc`
- **Cuando** se envía
- **Entonces** responde 400

#### CA-RF08-12 — Solo el propietario: ajena o inexistente es 404

> Agregado en refuerzo · Prueba existente: «solo el propietario» (it.each) y «la transacción de otro usuario queda intacta»

- **Dado** una transacción de otro usuario, o un id que no existe
- **Cuando** el usuario intenta editarla
- **Entonces** responde 404 "Transacción no encontrada" (sin distinguir los dos casos, nunca 403) y la transacción ajena queda intacta

#### CA-RF08-13 — Las que genera otro módulo no se editan aquí

> Agregado en refuerzo · Prueba existente: «DINERO_RECIBIDO / ABONO_DEUDA / PAGO_TARJETA» (edición)

- **Dado** una transacción propia con `clasificacionFlujo` `DINERO_RECIBIDO`, `ABONO_DEUDA` o `PAGO_TARJETA`
- **Cuando** se intenta editar
- **Entonces** responde 409 con el mensaje "Esta transacción la genera otro módulo (tarjetas o deudas) y no se puede modificar desde aquí" y no cambia

#### CA-RF08-14 — Sin sesión válida al editar

> Agregado en refuerzo · Prueba existente: «sin sesión válida responde 401 y no cambia nada» (edición)

- **Dado** un `PATCH` sin sesión válida
- **Cuando** se envía
- **Entonces** responde 401 y no cambia nada

#### CA-RF08-15 — Editar una no toca las de nadie más

> Agregado en refuerzo · Prueba existente: «no toca las transacciones de nadie más»

- **Dado** varias transacciones de distintos usuarios
- **Cuando** el usuario edita una suya
- **Entonces** solo esa cambia

### RF-08 — Eliminar un movimiento (`DELETE /transacciones/:id`)

#### CA-RF08-16 — Eliminar una transacción propia

> Agregado en refuerzo · Prueba existente: «elimina la transacción (204, sin cuerpo) y no toca las demás»

- **Dado** una transacción propia ordinaria
- **Cuando** se envía `DELETE /transacciones/:id`
- **Entonces** responde 204 sin cuerpo, la transacción desaparece y las demás quedan intactas

#### CA-RF08-17 — Repetir el borrado

> Agregado en refuerzo · Prueba existente: «repetir la petición con la transacción ya eliminada responde 404»

- **Dado** una transacción ya eliminada
- **Cuando** se repite el `DELETE`
- **Entonces** responde 404

#### CA-RF08-18 — Eliminar una ajena o inexistente es 404

> Agregado en refuerzo · Prueba existente: «it.each» de DELETE (de otro usuario, inexistente)

- **Dado** una transacción de otro usuario, o un id que no existe
- **Cuando** el usuario intenta eliminarla
- **Entonces** responde 404 y la ajena no se elimina

#### CA-RF08-19 — Un id que no es válido al eliminar

> Agregado en refuerzo · Prueba existente: «un id que no es válido responde 400» (DELETE)

- **Dado** una ruta `DELETE /transacciones/abc`
- **Cuando** se envía
- **Entonces** responde 400

#### CA-RF08-20 — Las que genera otro módulo no se eliminan aquí

> Agregado en refuerzo · Prueba existente: «responde 409 si la transacción la genera otro módulo…»

- **Dado** una transacción propia que no es ordinaria
- **Cuando** se intenta eliminar
- **Entonces** responde 409 con el mensaje "… y no se puede eliminar desde aquí" y no se elimina

#### CA-RF08-21 — Sin sesión válida al eliminar

> Agregado en refuerzo · Prueba existente: «sin sesión válida responde 401 y no elimina nada»

- **Dado** un `DELETE` sin sesión válida
- **Cuando** se envía
- **Entonces** responde 401 y no elimina nada

### RF-09 — Fechas pasadas, presentes o futuras, y consulta de movimientos (`GET /transacciones`)

#### CA-RF09-01 — Se acepta cualquier fecha real

> Agregado en refuerzo · Prueba existente: «acepta una fecha pasada / futura / bisiesta»

- **Dado** un registro con fecha `2020-01-31`, `2031-12-31` o `2028-02-29`
- **Cuando** se envía
- **Entonces** responde 201 con esa misma fecha; el balance de cada periodo se calcula con la fecha asignada (verificado en el paquete 3.1.1, CA-RF14 y CA-RF20)

#### CA-RF09-02 — Forma de la respuesta del listado

> Agregado en refuerzo · Prueba existente: «devuelve la forma acordada: items y siguienteCursor…»

- **Dado** una transacción propia con categoría
- **Cuando** se consulta `GET /transacciones`
- **Entonces** responde 200 con exactamente `items` y `siguienteCursor`; cada item trae la categoría completa

#### CA-RF09-03 — Orden del listado

> Agregado en refuerzo · Prueba existente: «ordena por fecha descendente y, a igual fecha, la registrada más recientemente primero»

- **Dado** transacciones con fechas distintas y varias en la misma fecha
- **Cuando** se lista
- **Entonces** salen de la fecha más reciente a la más antigua y, a igual fecha, la registrada más recientemente primero

#### CA-RF09-04 — Solo las del propio usuario

> Agregado en refuerzo · Prueba existente: «solo devuelve las transacciones del propio usuario» y «un filtro no deja ver transacciones de otro usuario»

- **Dado** transacciones de otro usuario
- **Cuando** el usuario lista, con o sin filtros
- **Entonces** no aparece ninguna ajena

#### CA-RF09-05 — Sin categoría y lista vacía

> Agregado en refuerzo · Prueba existente: «una transacción sin categoría trae categoria null» y «sin transacciones devuelve la lista vacía y sin cursor»

- **Dado** una transacción sin categoría, o un usuario sin transacciones
- **Cuando** lista
- **Entonces** el item trae `categoria` `null`; sin transacciones, `items` es `[]` y `siguienteCursor` es `null`

#### CA-RF09-06 — Filtro Desde/Hasta

> Agregado en refuerzo · Prueba existente: «desde y hasta incluyen los dos extremos», «solo desde», «solo hasta» y «desde igual a hasta trae un solo día»

- **Dado** transacciones en varias fechas
- **Cuando** se usa `desde` y `hasta` (ambos incluidos), solo uno de los dos, o los dos iguales
- **Entonces** salen las del rango, sin el límite que falta, o las de un solo día

#### CA-RF09-07 — Filtros por tipo, categoría y método, combinables

> Agregado en refuerzo · Prueba existente: «filtra por tipo», «filtra por categoría», «filtra por método de pago» y «combina varios filtros»

- **Dado** transacciones de distintos tipos, categorías y métodos
- **Cuando** se filtra por uno o varios
- **Entonces** salen solo las que cumplen todos los filtros

#### CA-RF09-08 — La carga progresiva recorre todo una sola vez

> Agregado en refuerzo · Prueba existente: «encadenar los cursores recorre todo una sola vez…» (usa `limite=2`) · **Prueba nueva:** con un límite mayor que 2

- **Dado** 7 transacciones y `limite=3`
- **Cuando** se encadenan los `siguienteCursor` desde la primera página
- **Entonces** se recorren las 7 una sola vez, en orden, en 3 páginas (3, 3 y 1) y la última trae `siguienteCursor` `null` (el cursor se arma con la última transacción entregada de la página, no con otra)

#### CA-RF09-09 — Total múltiplo del límite

> Agregado en refuerzo · Prueba existente: «si el total es múltiplo del límite, la última página ya viene con siguienteCursor null»

- **Dado** 4 transacciones y `limite=2`
- **Cuando** se pide la segunda página
- **Entonces** trae 2 items y `siguienteCursor` `null`

#### CA-RF09-10 — El cursor es estable

> Agregado en refuerzo · Prueba existente: «registrar movimientos mientras se hace scroll no repite ni salta transacciones», «los filtros se mantienen entre páginas» y «con el mismo día en varias transacciones…»

- **Dado** un recorrido por páginas
- **Cuando** se registran movimientos nuevos entre páginas, o hay varias transacciones el mismo día
- **Entonces** no se repiten ni se saltan transacciones, y los filtros se mantienen entre páginas

#### CA-RF09-11 — Límite por defecto

> Agregado en refuerzo · Prueba existente: «el límite por defecto es 20»

- **Dado** más de 20 transacciones
- **Cuando** se lista sin `limite`
- **Entonces** vienen 20 items y un `siguienteCursor`

#### CA-RF09-12 — Parámetros inválidos

> Agregado en refuerzo · Prueba existente: it.each «parámetros inválidos» (desde/hasta mal formados, `desde` posterior a `hasta`, tipo, categoriaId, metodoPago TARJETA_CREDITO, limite 0, 101, texto y decimal, cursor ajeno, parámetro desconocido)

- **Dado** cualquiera de esos parámetros inválidos
- **Cuando** se consulta
- **Entonces** responde 400 con un mensaje que menciona el campo

#### CA-RF09-13 — Un cursor mal formado se rechaza

> Agregado en refuerzo · Prueba existente: «cursor que no es de este endpoint» (`esto-no-es-un-cursor`) · **Prueba nueva:** cursores que contienen uno válido pero con texto de más

- **Dado** el texto de un cursor válido (`<milisegundos>_<id de 24 hex>`) con texto añadido antes o después, antes de codificarlo
- **Cuando** se envía como `cursor`
- **Entonces** responde 400 con el mensaje "cursor no es válido: usa el siguienteCursor de la página anterior"; solo un cursor exacto se acepta

#### CA-RF09-14 — Sin sesión válida al listar

> Agregado en refuerzo · Prueba existente: «sin sesión válida responde 401»

- **Dado** un `GET /transacciones` sin sesión válida
- **Cuando** se envía
- **Entonces** responde 401 con `message` "Sesión inválida o vencida"

### Mutantes equivalentes (no se persiguen)

- `transacciones.service.ts` línea 78 (`Object.values(dto).every(...)`): por HTTP solo llega un cuerpo vacío o con valores definidos, y en ambos casos el resultado es idéntico; solo difiere con claves `undefined`, que JSON no envía.
