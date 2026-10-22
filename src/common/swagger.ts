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
      'transacciones',
      'Registro y consulta de los ingresos y egresos del usuario autenticado. Un solo endpoint para ingresos y egresos: el cliente fija el campo `tipo`. Requieren sesión (JWT).',
    )
    .addTag(
      'desarrollo',
      'Rutas que SOLO existen con NODE_ENV=development y DEV_SESSION_ENABLED=true. Nunca disponibles en producción.',
    )
    .build();
