# Criterios de aceptación — 8. Despliegue y cierre: formato de errores

Estado: Aprobado (2026-11-27)

## Paquete 8.3.8 — Estandarizar las respuestas de error (backend)

Este paquete no tiene RF: los criterios usan el prefijo `CA-ERR-nn`.

### Fuentes

- Contrato acordado con el frontend: `coordinacion/contratos/errores.md` (opción A, aprobada por el desarrollador el 2026-11-27).
- Los errores que devuelve hoy la API (`develop`, b33278e) y la sección 7 de `CLAUDE.md` (Swagger).

### Forma

Toda respuesta de error es:

```json
{ "statusCode": 404, "error": "Not Found", "message": "Tarjeta no encontrada", "code": "TARJETA_NO_ENCONTRADA", "action": "Actualiza la lista: puede que ya se haya eliminado" }
```

- El cambio es **aditivo**: `statusCode`, `error` y `message` conservan nombre, tipo y texto. `message` sigue siendo un arreglo en las validaciones y un texto en el resto.
- `code` está siempre. `action` solo en los códigos que la tienen; en los demás **la propiedad no aparece** (ni `null` ni vacía).
- No hay más propiedades que esas cinco.

No entra: cambiar mensajes, estados o reglas de negocio, ni nada del Adapter del front.

### Contrato de nombres (D6)

`ErroresModule` en `src/common/errores.module.ts`: al importarlo, la aplicación responde sus errores con esta forma. `AppModule` lo importa y las pruebas de este paquete lo importan en su aplicación de prueba.

### Decisiones aprobadas por el desarrollador (2026-11-27)

Se aprobó la opción recomendada en D1 a D7; los criterios de abajo ya las reflejan.

> Decisión aprobada: **D1 — Mensajes de validación en inglés: no se traducen.** Solo hay dos casos en toda la API: los de `idToken` en `POST /auth/login` y «property X should not exist» (campo no declarado). Son errores de programación del cliente, que el usuario no provoca; `message` queda igual que hoy y el front muestra su texto de `VALIDACION`. La regla 3 del contrato debe mencionar que «property X should not exist» no empieza por el nombre del campo. Descartado: traducirlos.

> Decisión aprobada: **D2 — Textos de `action`: los del contrato**, salvo `DEUDA_CON_ABONOS`, que queda sin `action` hasta 6.2 porque todavía no hay ningún endpoint de abonos.

> Decisión aprobada: **D3 — Un `500` lleva siempre `error` «Internal Server Error» y `message` «Internal server error»** (el texto de hoy). El texto en español para el usuario va en `action`.

> Decisión aprobada: **D4 — Los `413` y `415` ganan `error`** con el nombre del estado («Payload Too Large», «Unsupported Media Type»), con el `message` de hoy.

> Decisión aprobada: **D5 — El JSON mal formado es `ERROR_HTTP`**, sin `action`. `VALIDACION` queda reservado para los `400` con `message` en arreglo.

> Decisión aprobada: **D6 — El enganche es `ErroresModule`** (contrato de nombres), el mismo patrón del guard global (`APP_GUARD`). Descartado: registrarlo en `main.ts`.

> Decisión aprobada: **D7 — No se modifica ninguna prueba existente.** Unos 40 archivos de pruebas comparan el error con `toEqual({ statusCode, message, error })` (también las ayudas `error404` y `error409` de `test/`). Ninguna arma su aplicación con `AppModule` (solo `deuda.modulo.integration.spec.ts` lee sus importaciones) y ningún módulo de funcionalidad necesita importar `ErroresModule`, así que corren sin el enganche. La forma nueva se verifica solo en las pruebas nuevas, que importan `ErroresModule`. Condición: `code` y `action` los agrega **solo** `ErroresModule`; sin él, el cuerpo de error es el de hoy. Consecuencia: las antiguas siguen comparando el cuerpo sin `code` ni `action`, que no es el que responde la aplicación real.

---

## Forma por familia de error

### CA-ERR-01 — Validación (400)

- **Dado** un usuario con sesión
- **Cuando** envía un dato inválido: en el cuerpo (`monto` 0), un campo no declarado, en la query, en un id de la ruta (`abc`), en una cabecera (`X-Zona-Horaria` o `Idempotency-Key` inválidas), una regla que valida el servicio (`PATCH` sin ningún campo; `desde` posterior a `hasta`) o el login sin `idToken`
- **Entonces** cada uno responde `400` con exactamente `statusCode` 400, `error` «Bad Request», `message` (el mismo arreglo de hoy), `code` `VALIDACION` y `action` «Revisa los datos marcados», y no se guarda nada

> Decisiones D1 y D2.

### CA-ERR-02 — Sesión inválida (401)

- **Dado** una ruta protegida
- **Cuando** se llama sin token, con uno vencido o manipulado, o `GET /usuarios/me` con el token de un usuario que ya no existe
- **Entonces** responde `401` con `error` «Unauthorized», `message` «Sesión inválida o vencida», `code` `SESION_INVALIDA` y `action` «Vuelve a iniciar sesión»

### CA-ERR-03 — Token de Google inválido (401)

- **Dado** `POST /auth/login`
- **Cuando** Firebase rechaza el ID Token, o el token no trae correo
- **Entonces** responde `401` con `error` «Unauthorized», `message` «ID Token inválido o vencido», `code` `TOKEN_GOOGLE_INVALIDO` y `action` «Intenta iniciar sesión de nuevo»

### CA-ERR-04 — Catálogo de no encontrados y reglas de negocio

- **Dado** cada situación de las tablas
- **Cuando** el usuario hace la petición
- **Entonces** responde el estado de la fila con exactamente `statusCode`, `error` (nombre del estado), `message` (el de hoy), `code` y `action` (o sin esa propiedad cuando dice «—»), y los datos no cambian

En los `404`, un dato de otro usuario responde exactamente lo mismo que uno inexistente. Los `message` «Tarjeta no encontrada» y «Categoría no encontrada» no cambian: el front los compara literalmente.

**No encontrados (404).** En todos, `action` es «Actualiza la lista: puede que ya se haya eliminado».

| `code` | Situación | `message` |
|---|---|---|
| `CATEGORIA_NO_ENCONTRADA` | `PATCH` o `DELETE /categorias/:id`; compra con una `categoriaId` inexistente | Categoría no encontrada |
| `TRANSACCION_NO_ENCONTRADA` | `PATCH` o `DELETE /transacciones/:id` | Transacción no encontrada |
| `META_NO_ENCONTRADA` | una meta de ahorro por id | Meta de ahorro no encontrada |
| `TARJETA_NO_ENCONTRADA` | una tarjeta (o cualquier ruta bajo ella) | Tarjeta no encontrada |
| `CARGO_NO_ENCONTRADO` | un cargo fijo por id | Cargo fijo no encontrado |
| `COMPRA_NO_ENCONTRADA` | una compra o avance por id | Compra no encontrada |
| `PAGO_NO_ENCONTRADO` | un pago por id | Pago no encontrado |
| `DEUDA_NO_ENCONTRADA` | eliminar un préstamo de una deuda inexistente | Deuda no encontrada |
| `PRESTAMO_NO_ENCONTRADO` | eliminar un préstamo que no es de la deuda | Préstamo no encontrado |

**Reglas de negocio.**

| `code` | Estado | Situación | `message` | `action` |
|---|---|---|---|---|
| `CATEGORIA_PREDETERMINADA` | 403 | renombrar o eliminar una categoría general | Las categorías generales no se pueden modificar (o eliminar) | Crea una categoría propia si necesitas otra |
| `CATEGORIA_DUPLICADA` | 409 | crear o renombrar con un nombre ya usado | Ya existe una categoría con ese nombre | Usa otro nombre o la categoría que ya existe |
| `META_DUPLICADA` | 409 | segunda meta del mismo mes | Ya existe una meta de ahorro para ese mes | Edita la meta de ese mes |
| `META_CON_AHORRO` | 409 | eliminar una meta con `ahorroReal` distinto de 0 | No se puede eliminar una meta que ya tiene ahorro registrado | Deja el ahorro del mes en 0 antes de eliminarla |
| `TARJETA_DUPLICADA` | 409 | crear o renombrar con un nombre ya usado | Ya existe una tarjeta con ese nombre | Usa otro nombre |
| `TARJETA_CON_COMPRAS` | 409 | eliminar una tarjeta con compras o avances | No se puede eliminar una tarjeta que ya tiene compras registradas | — |
| `TARJETA_CON_PAGOS` | 409 | eliminar una tarjeta con pagos y sin compras | No se puede eliminar una tarjeta que ya tiene pagos registrados | Elimina primero sus pagos |
| `TRANSACCION_DE_OTRO_MODULO` | 409 | `PATCH` o `DELETE /transacciones/:id` de un préstamo, avance, abono o pago | Esta transacción la genera otro módulo (tarjetas o deudas) y no se puede modificar (o eliminar) desde aquí | Gestiónalo desde la tarjeta o la deuda |
| `DEUDA_INTERES_DISTINTO` | 409 | sumar un préstamo con otro interés | Ya tienes una deuda activa con esa persona con otro interés: no indiques el interés o envía el mismo | Deja el interés en blanco para conservar el que ya tiene la deuda |
| `DEUDA_REGISTRO_SIMULTANEO` | 409 | la base responde clave duplicada al crear la deuda | Ya se está registrando un préstamo de esa persona: vuelve a intentarlo | Vuelve a intentarlo |
| `DEUDA_CON_ABONOS` | 409 | eliminar el único préstamo de una deuda con abonos | No puedes eliminar el único préstamo de una deuda con abonos | — (D2; el contrato proponía «Elimina primero los abonos de esa deuda») |
| `IDEMPOTENCIA_EN_PROCESO` | 409 | misma `Idempotency-Key` con la primera petición sin terminar | La petición ya se está procesando: espera su resultado antes de reintentar | Espera un momento antes de reintentar |
| `IDEMPOTENCIA_CLAVE_REUTILIZADA` | 422 | misma `Idempotency-Key` con otra petición | La clave Idempotency-Key ya se usó con otra petición: genera una clave nueva para una acción nueva | — |

> Decisión D2.

### CA-ERR-05 — Ruta que no existe (404)

- **Dado** la aplicación, con o sin sesión
- **Cuando** se llama una ruta no registrada (`GET /nada`) o un método no registrado en una ruta que sí existe
- **Entonces** responde `404` con `error` «Not Found», `message` «Cannot GET /nada» (como hoy), `code` `RUTA_NO_ENCONTRADA` y sin `action`

### CA-ERR-06 — Otros 4xx: cuerpo que no se puede leer

- **Dado** un `POST` de la API
- **Cuando** el cuerpo es JSON mal formado (`{"a":`), pasa de 100 KB o declara un juego de caracteres no admitido (`charset=latin9`)
- **Entonces** responde `400`, `413` y `415` respectivamente, con `statusCode`, `error` (el nombre del estado), el `message` de hoy, `code` `ERROR_HTTP` y sin `action`; no se guarda nada

> Decisiones D4 y D5.

### CA-ERR-07 — Un fallo inesperado no filtra detalles y queda en el log

- **Dado** que la base de datos (o Firebase, en el login, con un error que no es del token) falla con un error cuyo texto trae un dato interno, por ejemplo `fallo secreto mongodb://usuario:clave@host`
- **Cuando** el usuario hace una petición que pasa por ahí
- **Entonces** responde `500` con exactamente `statusCode` 500, `error` «Internal Server Error», `message` «Internal server error», `code` `ERROR_INTERNO` y `action` «Inténtalo de nuevo en unos minutos»: ni el texto del error, ni la traza ni su tipo aparecen en la respuesta, y el error original queda registrado con el `Logger` de Nest en nivel `error`

> Decisiones D2 y D3.

### CA-ERR-08 — Un 500 lanzado por la aplicación tampoco filtra su mensaje

- **Dado** una base sin la categoría general de respaldo
- **Cuando** el usuario elimina una categoría propia (hoy responde `500` con «No existe la categoría general de respaldo de …» y no deja nada en el log)
- **Entonces** responde el mismo cuerpo genérico de CA-ERR-07, el mensaje interno queda en el log en nivel `error` y la categoría sigue existiendo

---

## Lo que no cambia

### CA-ERR-09 — Respuestas exitosas y repetición idempotente

- **Dado** la aplicación con `ErroresModule`
- **Cuando** se hacen peticiones que terminan bien (`200`, `201`, `204`) y se repite un `POST` con la misma `Idempotency-Key`
- **Entonces** los cuerpos son los de hoy, sin `code` ni `action`; la repetición responde el mismo estado y cuerpo con `Idempotent-Replayed: true`; y una petición que falló sigue liberando su clave

### CA-ERR-10 — La aplicación real usa el formato

- **Dado** `AppModule`
- **Cuando** se revisan sus importaciones
- **Entonces** importa `ErroresModule`

> Decisión D6.

---

## Documentación

### CA-ERR-11 — Cada respuesta de error documenta `code` y `action`

- **Dado** el documento Swagger de todos los controladores
- **Cuando** se revisa el esquema de cada respuesta que no es `2xx`
- **Entonces** tiene `statusCode`, `error`, `message`, `code` (obligatorio) y `action` (opcional), cada una con descripción y ejemplo, también en los `500`

### CA-ERR-12 — La descripción general explica el formato y el catálogo

- **Dado** la descripción general de Swagger (`src/common/swagger.ts`)
- **Cuando** se lee
- **Entonces** menciona `code`, `action` y cada código del catálogo (los de las tablas de CA-ERR-04 más `VALIDACION`, `SESION_INVALIDA`, `TOKEN_GOOGLE_INVALIDO`, `RUTA_NO_ENCONTRADA`, `ERROR_HTTP` y `ERROR_INTERNO`), y que el cliente decide por `code`, no por el texto

---

## Índice de criterios del paquete 8.3.8

- **CA-ERR-01 a CA-ERR-12.** Total: 12 criterios (CA-ERR-04 se prueba con un caso por fila).
