# Criterios de aceptación — 2.3 Categorización

Estado: Borrador

## Paquete 2.3.4 — Pruebas de categorización (`GET`, `POST`, `PATCH` y `DELETE /categorias`)

El CRUD de categorías ya está implementado y mezclado (paquetes 2.3.1 a 2.3.3) con sus pruebas en `src/categorias/` (`categorias.integration.spec.ts`, `categoria.schema.spec.ts` y `categorias-semilla.spec.ts`), que no llevan ID de criterio. Estos criterios se redactaron **a posteriori** para dar trazabilidad: cada uno indica la **prueba existente** que lo cubre, y los que traen **prueba nueva** salen de huecos que dejó Stryker (`categorias.service.ts` 86,96 %, `categorias-semilla.service.ts` 92,31 %). Todos están marcados como "Agregado en refuerzo" y necesitan la aprobación del desarrollador. Las pruebas existentes no se renombran ni se tocan; solo se hace más fiel el modelo `aggregate` del arnés (ver CA-RF10-11).

Este archivo es aparte de `02-registro.md` para no chocar con la sección del paquete 2.2.6 que está en otra rama.

> Pendiente de decisión (1): **el listado de categorías no tiene RF propio.** RF-10 es crear, RF-11 editar y eliminar, RF-12 reasignar. Propongo anclar el listado a RF-10 (el selector de categorías al registrar un movimiento) y la siembra de las generales a RF-12 (la categoría de respaldo "Otros").

> Pendiente de decisión (2): **trazabilidad.** Igual que en el 2.2.6, propongo no renombrar las pruebas existentes y mantener la tabla de "prueba existente" de estos criterios.

### RF-10 — Crear categorías personalizadas y consultar las disponibles

#### CA-RF10-01 — Crear una categoría personalizada

> Agregado en refuerzo · Prueba existente: «crea una categoría personalizada del usuario del JWT, con 0 movimientos (201)»

- **Dado** un usuario con sesión
- **Cuando** envía `POST /categorias` con `nombre` "Mascotas" y `tipo` `EGRESO`
- **Entonces** responde 201 con exactamente `id`, `nombre`, `tipo`, `esPredeterminada` `false` y `movimientos` `0`; la categoría queda a nombre del usuario de la sesión y con `esRespaldo` `false`

#### CA-RF10-02 — Los espacios de los extremos se recortan

> Agregado en refuerzo · Prueba existente: «recorta los espacios del nombre»

- **Dado** un nombre `  Mascotas  `
- **Cuando** se crea
- **Entonces** el nombre queda como "Mascotas"

#### CA-RF10-03 — Un nombre ya usado por una general es 409

> Agregado en refuerzo · Prueba existente: «responde 409 si el nombre repite una general del mismo tipo» y «la misma general sin tilde y en mayúsculas»

- **Dado** la categoría general "Alimentación" de egreso
- **Cuando** el usuario crea un egreso llamado "alimentación" o "ALIMENTACION"
- **Entonces** responde 409 con `message` "Ya existe una categoría con ese nombre" y `error` "Conflict"; los nombres se comparan sin distinguir mayúsculas ni tildes

#### CA-RF10-04 — Un nombre ya usado por una propia es 409

> Agregado en refuerzo · Prueba existente: «responde 409 si el nombre repite una categoría personalizada propia del mismo tipo»

- **Dado** una categoría personalizada propia "Mascotas" de egreso
- **Cuando** crea otra de egreso llamada "mascotas"
- **Entonces** responde 409

#### CA-RF10-05 — El mismo nombre en otro tipo, o el de otro usuario, se permite

> Agregado en refuerzo · Prueba existente: «permite el mismo nombre en otro tipo, y el de una personalizada de otro usuario»

- **Dado** la general "Alimentación" de egreso y una personalizada "Gimnasio" de egreso de otro usuario
- **Cuando** el usuario crea "Alimentación" de **ingreso** y "Gimnasio" de egreso
- **Entonces** ambas responden 201

#### CA-RF10-06 — Datos inválidos

> Agregado en refuerzo · Prueba existente: it.each «responde 400 con un mensaje que empieza por el campo»

- **Dado** un nombre vacío, de solo espacios, de más de 40 caracteres o que no es texto; sin nombre; un tipo desconocido o ausente; o los campos `esPredeterminada` o `usuarioId`, que el cliente no decide
- **Cuando** se envía `POST /categorias`
- **Entonces** responde 400 con un mensaje que menciona el campo y no se crea nada

#### CA-RF10-07 — El nombre admite exactamente 40 caracteres

> Agregado en refuerzo · Prueba existente: «nombre de más de 40 caracteres» (el rechazo) · **Prueba nueva:** el borde exacto

- **Dado** un nombre de exactamente 40 caracteres
- **Cuando** se crea
- **Entonces** responde 201 y lo devuelve completo

#### CA-RF10-08 — El usuario ve las generales y las suyas, nunca las de otro

> Agregado en refuerzo · Prueba existente: «devuelve las generales y las del usuario, nunca las de otro, ordenadas…» y «cada item trae id, nombre, tipo, esPredeterminada y movimientos, y nada interno»

- **Dado** categorías generales, propias y de otro usuario
- **Cuando** consulta `GET /categorias`
- **Entonces** responde 200 con `items` que incluyen las generales y las propias, ninguna de otro usuario; cada item trae exactamente `id`, `nombre`, `tipo`, `esPredeterminada` y `movimientos`

#### CA-RF10-09 — Orden del listado

> Agregado en refuerzo · Prueba existente: «…ordenadas por tipo, generales primero y por nombre» (no detecta que se invierta el criterio de generales primero) · **Prueba nueva:** con varias generales y propias insertadas en desorden

- **Dado** varias categorías generales y personalizadas, de egreso y de ingreso, insertadas en cualquier orden
- **Cuando** consulta `GET /categorias`
- **Entonces** salen ordenadas por tipo (`EGRESO` antes que `INGRESO`), dentro de cada tipo las generales antes que las propias, y dentro de cada grupo por nombre ascendente

#### CA-RF10-10 — Filtro por tipo

> Agregado en refuerzo · Prueba existente: «el filtro tipo devuelve solo las de ese tipo» y «responde 400 si tipo no es INGRESO ni EGRESO»

- **Dado** categorías de ambos tipos
- **Cuando** consulta con `tipo=EGRESO` o `tipo=INGRESO`
- **Entonces** salen solo las de ese tipo; con `tipo=OTRO` responde 400 con el mensaje `tipo debe ser INGRESO o EGRESO`

#### CA-RF10-11 — `movimientos` cuenta solo las transacciones del propio usuario

> Agregado en refuerzo · Prueba existente: «movimientos cuenta solo las transacciones del propio usuario»

- **Dado** transacciones propias y de otro usuario en varias categorías
- **Cuando** consulta `GET /categorias`
- **Entonces** cada categoría cuenta solo las transacciones del usuario de la sesión que la usan

> Nota de arnés: hoy el modelo de transacciones en memoria de esa prueba ignora la etapa `$group` de la consulta de agregación, así que la prueba no detecta un `$group` roto. Para esta prueba se hará que el arnés interprete `$group` (agrupa por `$categoriaId` y suma 1) y falle si la consulta es inválida, como haría MongoDB. No cambia lo que espera la prueba.

#### CA-RF10-12 — Sin sesión válida

> Agregado en refuerzo · Prueba existente: «%s responde 401 y no cambia nada» (GET, POST, PATCH y DELETE)

- **Dado** una petición sin sesión válida a cualquiera de los cuatro endpoints
- **Cuando** se envía
- **Entonces** responde 401 con `message` "Sesión inválida o vencida" y no cambia nada

#### CA-RF10-13 — El esquema de la categoría

> Agregado en refuerzo · Prueba existente: `categoria.schema.spec.ts` (dueño opcional, ADR-002; tipo `INGRESO` o `EGRESO`; nombre obligatorio, recortado, de 1 a 40 caracteres; `esPredeterminada` y `esRespaldo` en `false` por defecto; índice por usuario y tipo; colección `categorias`)

- **Dado** el esquema de Mongoose de `Categoria`
- **Cuando** se validan documentos
- **Entonces** se cumplen esas reglas: el dueño es opcional y vale `null` por defecto (así se representan las generales), y una categoría nueva es personalizada

### RF-11 — Editar y eliminar las categorías personalizadas propias

#### CA-RF11-01 — Renombrar una personalizada

> Agregado en refuerzo · Prueba existente: «renombra una categoría personalizada y devuelve su conteo de movimientos»

- **Dado** una personalizada propia "Mascotas" con 1 movimiento
- **Cuando** envía `PATCH /categorias/:id` con `nombre` `  Mascotas y veterinario `
- **Entonces** responde 200 con el nombre recortado, el mismo `tipo` y `movimientos` 1

#### CA-RF11-02 — Cambiar solo mayúsculas o tildes del propio nombre

> Agregado en refuerzo · Prueba existente: «permite cambiar solo mayúsculas o tildes del propio nombre»

- **Dado** una personalizada propia "mascotas"
- **Cuando** la renombra a "Mascotas"
- **Entonces** responde 200 (no choca consigo misma)

#### CA-RF11-03 — Renombrar a un nombre ya usado es 409

> Agregado en refuerzo · Prueba existente: «responde 409 si el nuevo nombre choca con otra categoría del mismo tipo»

- **Dado** una personalizada propia y la general "Alimentación" del mismo tipo
- **Cuando** la renombra a "Alimentacion"
- **Entonces** responde 409

#### CA-RF11-04 — Las generales no se modifican ni se eliminan: 403

> Agregado en refuerzo · Prueba existente: «responde 403 si es una categoría general» (PATCH) y «responde 403 si es una general de egreso / la de respaldo / una general de ingreso» (DELETE)

- **Dado** una categoría general, incluida la de respaldo
- **Cuando** el usuario intenta renombrarla o eliminarla
- **Entonces** responde 403 con `message` "Las categorías generales no se pueden modificar" (o "… eliminar") y `error` "Forbidden", y la categoría no cambia

#### CA-RF11-05 — Inexistente o de otro usuario es 404

> Agregado en refuerzo · Prueba existente: «responde 404 con el mismo mensaje si la categoría no existe / es de otro usuario» (PATCH) y «responde 404 si la categoría no existe / es de otro usuario» (DELETE)

- **Dado** un id de una categoría que no existe o es personalizada de otro usuario
- **Cuando** el usuario intenta renombrarla o eliminarla
- **Entonces** responde 404 "Categoría no encontrada" (sin distinguir los dos casos, nunca 403) y no cambia nada

#### CA-RF11-06 — Datos inválidos al renombrar y al eliminar

> Agregado en refuerzo · Prueba existente: «responde 400: id inválido / nombre vacío / intento de cambiar el tipo» y «responde 400 si el id no es válido» (DELETE)

- **Dado** un id que no es válido, un nombre vacío, o un `tipo` en el cuerpo del `PATCH` (el tipo no se cambia)
- **Cuando** se envía
- **Entonces** responde 400 con un mensaje que menciona el campo; para un id inválido en `DELETE`, el mensaje es `["id debe ser un id de categoría válido"]`

### RF-12 — Reasignar los movimientos a "Otros" al eliminar una categoría

#### CA-RF12-01 — Eliminar reasigna a "Otros egresos"

> Agregado en refuerzo · Prueba existente: «elimina la categoría y reasigna sus movimientos a "Otros egresos" del mismo tipo (204)»

- **Dado** una personalizada de egreso con 2 movimientos propios y otra categoría con 1 movimiento
- **Cuando** se envía `DELETE /categorias/:id`
- **Entonces** responde 204 sin cuerpo, la categoría desaparece, los 2 movimientos pasan a "Otros egresos" y el otro no cambia

#### CA-RF12-02 — Una de ingreso reasigna a "Otros ingresos"

> Agregado en refuerzo · Prueba existente: «una categoría de INGRESO reasigna a "Otros ingresos", no a la de egresos»

- **Dado** una personalizada de ingreso con un movimiento
- **Cuando** se elimina
- **Entonces** el movimiento pasa a "Otros ingresos"

#### CA-RF12-03 — No se tocan los movimientos de otros usuarios

> Agregado en refuerzo · Prueba existente: «no toca los movimientos de otros usuarios»

- **Dado** un movimiento de otro usuario que usa una categoría (en los datos de prueba)
- **Cuando** el usuario elimina esa categoría de su lista
- **Entonces** el movimiento ajeno conserva su `categoriaId`

#### CA-RF12-04 — Ninguna transacción queda sin categoría

> Agregado en refuerzo · Prueba existente: «ninguna transacción queda sin categoría tras eliminar»

- **Dado** una personalizada con movimientos
- **Cuando** se elimina
- **Entonces** todas las transacciones apuntan a una categoría que existe

#### CA-RF12-05 — Si falla la reasignación, la categoría no se elimina

> Agregado en refuerzo · Prueba existente: «si falla la reasignación no se elimina la categoría, para poder reintentar»

- **Dado** que la base falla al reasignar los movimientos
- **Cuando** se envía `DELETE /categorias/:id`
- **Entonces** responde 500 y la categoría sigue existiendo, para poder repetir la petición

#### CA-RF12-06 — Sin categoría de respaldo no se elimina nada

> Agregado en refuerzo · **Prueba nueva** (hoy esta rama de error no está cubierta)

- **Dado** que no existe la categoría general de respaldo del tipo (error de datos, no del cliente) y una personalizada de egreso con movimientos
- **Cuando** se envía `DELETE /categorias/:id`
- **Entonces** responde 500 con `message` "No existe la categoría general de respaldo de EGRESO", la categoría no se elimina y los movimientos no se tocan

#### CA-RF12-07 — Las categorías generales iniciales

> Agregado en refuerzo · Prueba existente: `categorias-semilla.spec.ts`, bloque «Categorías generales iniciales» (cinco de egreso, "Otros ingresos", una de respaldo por tipo, sin nombres repetidos dentro de un tipo, todas válidas según el esquema)

- **Dado** la lista de categorías generales con las que arranca una base vacía
- **Cuando** se revisa
- **Entonces** hay exactamente una de respaldo por tipo ("Otros egresos" y "Otros ingresos"), ningún nombre se repite dentro de un mismo tipo sin distinguir mayúsculas, y todas cumplen el esquema

#### CA-RF12-08 — La siembra al arrancar

> Agregado en refuerzo · Prueba existente: «siembra las generales cuando la base no tiene ninguna», «las categorías sembradas son generales del sistema…» y «no siembra nada si ya existe alguna general…»

- **Dado** una base sin categorías generales (y, en otro caso, con alguna)
- **Cuando** arranca la aplicación
- **Entonces** siembra las generales sin dueño y predeterminadas; si ya existe alguna general, no siembra nada (repetir el arranque no duplica ni pisa los cambios del administrador)

#### CA-RF12-09 — La siembra deja constancia

> Agregado en refuerzo · **Prueba nueva**

- **Dado** una base sin categorías generales
- **Cuando** arranca y siembra
- **Entonces** deja constancia en el registro con el mensaje "Categorías generales sembradas: <número de categorías sembradas>"

### Mutantes equivalentes (no se persiguen)

- `categorias.service.ts` línea 19 (`.trim()` y `toLocaleLowerCase` → `toLocaleUpperCase` en `normalizar`): los nombres ya llegan recortados (el DTO y el esquema lo hacen) y comparar en mayúsculas o minúsculas da el mismo resultado.
- `categorias.service.ts` línea 56 (`{ sensitivity: 'base' }` → `{}`): solo cambia el orden entre dos nombres que difieran únicamente en mayúsculas o tildes, y la unicidad por nombre normalizado (CA-RF10-03 a CA-RF10-05) impide que coexistan.
- `categorias.service.ts` línea 108 (`obtenerPorIds` pide todas las categorías en vez de las indicadas): solo cambia cuántas trae la base, no el resultado, porque quien llama busca por id.
