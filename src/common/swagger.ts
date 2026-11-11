import { DocumentBuilder } from '@nestjs/swagger';

const DESCRIPCION = `
API REST de **Aequo**, una aplicación de gestión financiera personal. Todos los cálculos financieros viven en este backend; el cliente (React Native + Expo) solo envía datos y muestra resultados.

## Cómo autenticarse

1. El cliente inicia sesión con Google usando el SDK de Firebase y obtiene un **ID Token** (\`user.getIdToken()\`).
2. Lo envía a \`POST /auth/login\`. El backend lo verifica **una sola vez** y responde con un **JWT propio** (\`accessToken\`) válido 24 horas.
3. En el resto de endpoints se envía el header \`Authorization: Bearer <accessToken>\`.
4. Cuando el JWT expira, el cliente repite el login. El ID Token de Firebase **no** se usa como sesión (expira cada hora).

En esta página: pulsa **Authorize**, pega el \`accessToken\` (sin la palabra Bearer) y las pruebas de "Try it out" irán autenticadas. En desarrollo puedes obtener uno con \`POST /auth/dev-login\`.

## Convenciones

- Cuerpos y respuestas en JSON.
- **Todas las rutas exigen sesión (JWT) por defecto.** Solo son públicas \`POST /auth/login\` y, en desarrollo, \`POST /auth/dev-login\`. Sin un token válido (ausente, vencido o manipulado) la respuesta es siempre \`401\` con el mensaje \`Sesión inválida o vencida\`: el cliente debe cerrar la sesión local y volver al login.
- **Contrato estricto:** un campo que el endpoint no declara en el body se rechaza con \`400\`; no se ignora.
- **Errores:** siempre con la forma \`{ statusCode, message, error }\`. En los \`400\` de validación \`message\` es un arreglo de textos; en el resto es un texto.
- El usuario se identifica por el **UID de Firebase**, nunca por el correo.
- Los montos están en pesos colombianos.
- **Zona horaria:** los endpoints de reportes que usan "hoy" (\`GET /reportes/periodo\` y \`GET /reportes/categorias\`) aceptan el header opcional \`X-Zona-Horaria\` con un nombre de zona IANA (ejemplo: \`America/Bogota\`). Solo decide qué mes es el "mes actual" cuando no se envía \`mes\` ni \`desde\`/\`hasta\`; sin el header se usa UTC. Un nombre inválido responde \`400\` aunque se envíe \`mes\` o un rango.
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
      'Resúmenes calculados al consultar a partir de los movimientos del usuario autenticado: totales del periodo (mes actual por defecto, otro mes o un rango de fechas). Los totales siguen la regla de flujo de caja: el dinero recibido (préstamos y avances) no es ingreso propio y las compras con tarjeta afectan el balance cuando se paga la tarjeta. La distribución del gasto por categoría usa el mismo periodo y solo cuenta el gasto propio (egresos ordinarios), con porcentajes sin redondear. Requieren sesión (JWT).',
    )
    .addTag(
      'ahorro',
      'Metas de ahorro mensuales del usuario autenticado: una meta por usuario y mes, como porcentaje del ingreso propio (0 a 100) o monto fijo en pesos. `periodo` se envía como `YYYY-MM` (o una fecha real `YYYY-MM-DD`, de la que se toma el mes) y siempre se devuelve como `YYYY-MM`. `ahorroReal` es el ahorro efectivo del mes (puede ser negativo); una meta con `ahorroReal` distinto de 0 no se elimina (`409`). `GET /ahorro/progreso` calcula el mes: `ahorroDelMes` = ingreso propio − egresos (egresos ordinarios + pagos de tarjeta + abonos), `disponible` = ingreso propio − egresos − monto de la meta y `porcentajeAvance` = ahorro del mes / monto de la meta × 100, sin tope y sin redondear (`null` sin meta o con monto 0). `GET /ahorro/acumulado` suma el `ahorroReal` guardado en cada meta (no lo recalcula desde las transacciones). Requieren sesión (JWT).',
    )
    .addTag(
      'desarrollo',
      'Rutas que SOLO existen con NODE_ENV=development y DEV_SESSION_ENABLED=true. Nunca disponibles en producción.',
    )
    .build();
