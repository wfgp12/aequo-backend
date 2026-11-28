import { DocumentBuilder } from '@nestjs/swagger';

const DESCRIPCION = `
API REST de **Aequo**, una aplicación de gestión financiera personal. Todos los cálculos financieros viven en este backend; el cliente (React Native + Expo) solo envía datos y muestra resultados.

## Cómo autenticarse

1. El cliente inicia sesión con Google usando el SDK de Firebase y obtiene un **ID Token** (\`user.getIdToken()\`).
2. Lo envía a \`POST /auth/login\`. El backend lo verifica **una sola vez** y responde con un **JWT propio** (\`accessToken\`) válido 24 horas.
3. En el resto de endpoints se envía el header \`Authorization: Bearer <accessToken>\`.
4. Cuando el JWT expira, el cliente repite el login. El ID Token de Firebase **no** se usa como sesión (expira cada hora).

En esta página: pulsa **Authorize**, pega el \`accessToken\` (sin la palabra Bearer) y las pruebas de "Try it out" irán autenticadas. En desarrollo puedes obtener uno con \`POST /auth/dev-login\`.

## Errores

Toda respuesta de error es \`{ statusCode, error, message, code, action? }\` y no tiene más propiedades:

- \`statusCode\` y \`error\`: el estado HTTP y su nombre.
- \`message\`: el motivo. En los \`400\` de validación (\`VALIDACION\`) es un arreglo con un texto por problema; en el resto es un texto.
- \`code\`: identificador estable, siempre presente. **El cliente decide por \`code\`, nunca por el texto** de \`message\` ni de \`action\`, que pueden cambiar sin aviso. Ante un código desconocido, decide por el estado HTTP.
- \`action\`: qué puede hacer el usuario, en español. Si el código no tiene una, la propiedad no aparece.

Un \`500\` nunca trae detalles del fallo: quedan en el log del servidor.

Catálogo de códigos:

- Generales: \`VALIDACION\` (400, datos o parámetros inválidos), \`SESION_INVALIDA\` (401, sin sesión válida), \`TOKEN_GOOGLE_INVALIDO\` (401, login con un ID Token inválido o sin correo), \`RUTA_NO_ENCONTRADA\` (404, ruta o método que no existe), \`ERROR_HTTP\` (otros 4xx: JSON mal formado, cuerpo de más de 100 KB, juego de caracteres no admitido), \`ERROR_INTERNO\` (5xx).
- No encontrado (404, el dato no existe o es de otro usuario): \`CATEGORIA_NO_ENCONTRADA\`, \`TRANSACCION_NO_ENCONTRADA\`, \`META_NO_ENCONTRADA\`, \`TARJETA_NO_ENCONTRADA\`, \`CARGO_NO_ENCONTRADO\`, \`COMPRA_NO_ENCONTRADA\`, \`PAGO_NO_ENCONTRADO\`, \`DEUDA_NO_ENCONTRADA\`, \`PRESTAMO_NO_ENCONTRADO\`.
- No permitido (403): \`CATEGORIA_PREDETERMINADA\`.
- Conflicto (409): \`CATEGORIA_DUPLICADA\`, \`META_DUPLICADA\`, \`META_CON_AHORRO\`, \`TARJETA_DUPLICADA\`, \`TARJETA_CON_COMPRAS\`, \`TARJETA_CON_PAGOS\`, \`TRANSACCION_DE_OTRO_MODULO\`, \`DEUDA_INTERES_DISTINTO\`, \`DEUDA_REGISTRO_SIMULTANEO\`, \`DEUDA_CON_ABONOS\`, \`IDEMPOTENCIA_EN_PROCESO\`.
- No procesable (422): \`IDEMPOTENCIA_CLAVE_REUTILIZADA\`.

## Convenciones

- Cuerpos y respuestas en JSON.
- **Todas las rutas exigen sesión (JWT) por defecto.** Solo son públicas \`POST /auth/login\` y, en desarrollo, \`POST /auth/dev-login\`. Sin un token válido (ausente, vencido o manipulado) la respuesta es siempre \`401\` con el mensaje \`Sesión inválida o vencida\`: el cliente debe cerrar la sesión local y volver al login.
- **Contrato estricto:** un campo que el endpoint no declara en el body se rechaza con \`400\`; no se ignora.
- El usuario se identifica por el **UID de Firebase**, nunca por el correo.
- Los montos están en pesos colombianos.
- **Zona horaria:** los endpoints de reportes que usan "hoy" (\`GET /reportes/periodo\` y \`GET /reportes/categorias\`) aceptan el header opcional \`X-Zona-Horaria\` con un nombre de zona IANA (ejemplo: \`America/Bogota\`). Solo decide qué mes es el "mes actual" cuando no se envía \`mes\` ni \`desde\`/\`hasta\`; sin el header se usa UTC. Un nombre inválido responde \`400\` aunque se envíe \`mes\` o un rango. En \`GET /deudas\` el mismo header decide hasta qué día corre el interés.
- **Rangos por meses:** \`GET /reportes/evolucion\` recibe \`desde\` y \`hasta\` en \`YYYY-MM\`, opcionales e independientes: sin \`desde\` empieza en el primer mes con movimientos del usuario y sin \`hasta\` termina en el último. El rango no puede abarcar más de 120 meses (también con extremos abiertos), no agrega el mes actual y no usa \`X-Zona-Horaria\`. Un rango sin movimientos responde \`200\` con \`puntos\` vacío. \`GET /reportes/comparacion\` usa los mismos \`desde\` y \`hasta\` con las mismas reglas, pero solo lista los meses que tienen movimientos (los meses vacíos no aparecen) y exige \`tipo\` (\`balance\`, \`ingresos-egresos\` o \`categoria\`).
`.trim();

export const construirConfigSwagger = () =>
  new DocumentBuilder()
    .setTitle('Aequo API')
    .setDescription(DESCRIPCION)
    .setVersion('0.0.1')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description:
        'JWT propio de la app, obtenido en `POST /auth/login`. Pegar solo el token, sin el prefijo "Bearer".',
    })
    .addTag('auth', 'Inicio de sesión con Google (Firebase) y emisión del JWT de sesión propio de la app.')
    .addTag('usuarios', 'Perfil y cuenta del usuario autenticado. Requieren sesión (JWT).')
    .addTag(
      'categorias',
      'Categorías con las que se clasifican los movimientos: generales del sistema (las define el administrador; no se editan ni eliminan) y personalizadas del usuario. Al eliminar una personalizada, sus movimientos pasan a la general de respaldo. Requieren sesión (JWT).',
    )
    .addTag(
      'transacciones',
      'Registro y consulta de los ingresos y egresos del usuario autenticado. Un solo endpoint para ingresos y egresos: el cliente fija el campo `tipo`. Requieren sesión (JWT).',
    )
    .addTag(
      'reportes',
      'Resúmenes calculados al consultar a partir de los movimientos del usuario autenticado: totales del periodo (mes actual por defecto, otro mes o un rango de fechas). Los totales siguen la regla de flujo de caja: el dinero recibido (préstamos y avances) no es ingreso propio y las compras con tarjeta afectan el balance cuando se paga la tarjeta. El resumen del periodo trae además `dineroDisponible` = `balance + dineroRecibido`. La distribución del gasto por categoría usa el mismo periodo y solo cuenta el gasto propio (egresos ordinarios), con porcentajes sin redondear. Requieren sesión (JWT).',
    )
    .addTag(
      'ahorro',
      'Metas de ahorro mensuales del usuario autenticado: una meta por usuario y mes, como porcentaje del ingreso propio (0 a 100) o monto fijo en pesos. `periodo` se envía como `YYYY-MM` (o una fecha real `YYYY-MM-DD`, de la que se toma el mes) y siempre se devuelve como `YYYY-MM`. `ahorroReal` es el ahorro efectivo del mes (puede ser negativo); una meta con `ahorroReal` distinto de 0 no se elimina (`409`). `GET /ahorro/progreso` calcula el mes: `ahorroDelMes` = ingreso propio − egresos (egresos ordinarios + pagos de tarjeta + abonos), `disponible` = ingreso propio − egresos − monto de la meta y `porcentajeAvance` = ahorro del mes / monto de la meta × 100, sin tope y sin redondear (`null` sin meta o con monto 0). `GET /ahorro/acumulado` suma el `ahorroReal` guardado en cada meta (no lo recalcula desde las transacciones). Requieren sesión (JWT).',
    )
    .addTag(
      'tarjetas',
      'Tarjetas de crédito del usuario autenticado, sus cargos fijos mensuales (suscripciones, seguros) en `/tarjetas/:tarjetaId/cargos` y sus compras a cuotas y avances en efectivo en `/tarjetas/:tarjetaId/compras` (los avances se registran en `POST /tarjetas/:tarjetaId/avances`). `tasaEA` es la tasa efectiva anual como FRACCIÓN de 0 a 1 (29,21 % = `0.2921`; `29.21` da `400`) y se cambia con `PATCH /tarjetas/:id`: la nueva tasa aplica solo a compras posteriores, porque cada compra copia la tasa y la bandera `cuotaUnicaSinInteres` de la tarjeta al registrarse (`tasaEAAplicada`) y editar la tarjeta no las recalcula. `cuota` y `mesUltimoPago` se calculan al responder y no se guardan; la cuota llega sin redondear. `GET /tarjetas/:tarjetaId/cuota?valor&cuotas&primerPago` es la vista previa de la cuota y del mes del último pago de una compra o avance que aún no se guarda: usa la tasa y la bandera actuales de la tarjeta (las que copiará al guardar), no guarda nada y no lleva `Idempotency-Key` ni `X-Zona-Horaria`. Una compra con tarjeta NO es una transacción: no cambia el balance el día de la compra, lo afecta el pago de la tarjeta. Un avance sí genera una transacción de dinero recibido (`DINERO_RECIBIDO`, `INGRESO` en `EFECTIVO`) que no es ingreso propio y que solo se edita o elimina desde la tarjeta (en `/transacciones` responde `409`); su categoría es siempre la de respaldo de egresos. `fecha` y `primerPago` se envían como `YYYY-MM-DD` y `YYYY-MM` (o una fecha real de la que se toma el mes); sin `fecha`, es hoy en la zona de `X-Zona-Horaria`. El nombre de la tarjeta es único por usuario sin distinguir mayúsculas (`409` si se repite, al crear o renombrar). Activar o desactivar un cargo es un `PATCH` de `activo`. Eliminar una tarjeta borra en cascada sus cargos, pero responde `409` sin borrar nada si tiene compras o avances (primero) o pagos registrados (se eliminan antes con `DELETE /tarjetas/:tarjetaId/pagos/:id`). Un recurso ajeno o inexistente responde `404`. `GET /tarjetas/:tarjetaId/proyeccion?mes=YYYY-MM` calcula el total estimado a pagar en el mes (cuotas vigentes de compras y avances, cada una con su propia tasa, más los cargos fijos activos), el saldo pendiente después de pagarlo (suma de las cuotas, con intereses, de los meses posteriores; sin cargos fijos, incluye compras con primer pago futuro y no es el capital) y la proyección de los meses siguientes hasta la última cuota, uno por mes y sin saltos. Una compra aporta su cuota al mes M si `primerPago ≤ M ≤ mesUltimoPago`; los cargos activos se repiten en cada mes pero no alargan la proyección. `mes` es opcional (sin él, el mes actual según `X-Zona-Horaria`; UTC si no se envía), no guarda nada, no lleva `Idempotency-Key` y los montos llegan sin redondear. En el nivel superior agrega `pagado` (suma de los pagos de la tarjeta con fecha en el mes de referencia) y `diferencia = pagado − total` (negativa falta por pagar, positiva se pagó de más); `cuotas`, `cargosFijos`, `total` y `saldoPendiente` no consideran los pagos. También en el nivel superior agrega `detalle`, el desglose de `cuotas` del mes de referencia por compra o avance vigente (`compraId`, `descripcion`, `tipo`, `numeroCuota` de 1 a `totalCuotas`, `totalCuotas` y `cuota` sin redondear), de la más reciente a la más antigua; los cargos fijos no aparecen ahí (solo en `cargosFijos`) y las filas de `proyeccion` no lo traen. El pago de una tarjeta (RF-32, `POST /tarjetas/:tarjetaId/pagos`, con `Idempotency-Key` y `X-Zona-Horaria`) es un egreso guardado como transacción `PAGO_TARJETA` sin categoría: afecta el balance del mes de su `fecha` y no el gasto por categoría (ADR-014); la respuesta trae `comparacion` (`mes`, `estimado` = total estimado de ese mes, `pagado` = suma de los pagos de la tarjeta en el mes, `diferencia = pagado − estimado`); `valor` admite hasta 2 decimales y `metodoPago` es `EFECTIVO`, `DEBITO` o `TRANSFERENCIA` (por defecto `TRANSFERENCIA`). `GET /tarjetas/:tarjetaId/pagos?mes=YYYY-MM` los lista y `DELETE /tarjetas/:tarjetaId/pagos/:id` elimina uno; no se editan (se eliminan y se registran de nuevo) y en `/transacciones` un pago responde `409`. Un pago ajeno o que no es de esa tarjeta responde `404 Pago no encontrado`. Requieren sesión (JWT).',
    )
    .addTag(
      'deudas',
      'Deudas con personas y los préstamos recibidos de cada una. `POST /deudas/prestamos` (con `Idempotency-Key`) registra un préstamo: si hay una deuda activa con ese `acreedor` (sin distinguir mayúsculas, sí tildes) le suma el monto; si no, la crea (`deudaCreada` avisa cuál de las dos pasó). Un préstamo es una transacción `INGRESO` `DINERO_RECIBIDO` en `EFECTIVO`: aumenta `dineroDisponible` en `GET /reportes/periodo` sin contar como ingreso propio, balance ni ahorro, y en `/transacciones` no se edita ni se elimina (`409`). `tipoInteres` es `SIN_INTERES` (por defecto), `TASA` o `MONTO_FIJO`: la tasa es MENSUAL SIMPLE y va como fracción (`0.02` = 2 % al mes) y el monto fijo es el interés TOTAL de la deuda en pesos, no por mes. Una deuda tiene un solo interés: al sumar un préstamo se omite o se envía el mismo (`409` si difiere). Una deuda saldada no recibe montos: se crea otra. `GET /deudas` las lista con sus préstamos y calcula al consultar (no se guarda; sin redondear) `prestado`, `intereses`, `abonado` y `saldo = prestado + intereses − abonado` de cada una. El interés `TASA` es la tasa mensual simple por meses cumplidos sobre el capital pendiente, desde la fecha de cada préstamo; el `MONTO_FIJO` se debe completo desde que existe la deuda. Cada abono paga primero los intereses y luego el préstamo más antiguo. Un `saldo` negativo es dinero a favor del usuario y `totalAdeudado` suma solo los saldos positivos. «Hoy» es el día en la zona del header opcional `X-Zona-Horaria` (UTC sin él; inválida, `400`). Lo registrado con fecha futura cuenta y `saldada` no cambia el cálculo. `DELETE /deudas/:deudaId/prestamos/:prestamoId` deshace un préstamo mal registrado (si era el único, se borra la deuda; con abonos, `409`); no hay edición. Un recurso ajeno o inexistente responde `404`. Requieren sesión (JWT).',
    )
    .addTag(
      'desarrollo',
      'Rutas que SOLO existen con NODE_ENV=development y DEV_SESSION_ENABLED=true. Nunca disponibles en producción.',
    )
    .build();
