# Aequo — Backend

> *"Aequo — el equilibrio de tus finanzas personales"*

API REST del proyecto **Aequo**, una aplicación de gestión financiera personal simple e intuitiva. Este repositorio contiene únicamente el backend; la interfaz vive en el repositorio hermano `aequo-frontend` (React Native con Expo: web, Android e iOS desde una sola base de código), que consume esta API.

## Stack

| Elemento | Tecnología |
|---|---|
| Framework | [NestJS](https://nestjs.com/) 12 (TypeScript) |
| Base de datos | MongoDB Atlas, vía Mongoose (`@nestjs/mongoose`) |
| Autenticación | Firebase Authentication (proveedor Google) — el backend verifica el ID token con `firebase-admin` |
| Validación | `class-validator` / `class-transformer` sobre DTOs |
| Configuración | `@nestjs/config` (variables de entorno) |
| Documentación de API | Swagger/OpenAPI vía `@nestjs/swagger`, expuesta en `/api/docs` |
| Testing | Vitest |
| Lint / formato | oxlint + Prettier |
| Hosting (objetivo) | Render |

## Arquitectura

Cliente React Native + Expo (web en GitHub Pages; Android e iOS en desarrollo) → API REST NestJS (este repo) → MongoDB Atlas. La autenticación se delega a Firebase; el backend no gestiona contraseñas ni credenciales propias de usuario.

Las entidades (Mongoose) son anémicas — solo datos. El comportamiento vive en clases de servicio, una por módulo funcional (autenticación, transacciones, categorías, reportes, ahorro, tarjetas, deudas, presupuesto, ingresos e indicadores; ver la sección 4 de [CLAUDE.md](./CLAUDE.md)).

Documentación completa del proyecto (Charter, Especificación de Requisitos, ADR, EDT, Documento de Diseño Técnico, Cronograma) en `../docs` (fuera de este repo, hermano de `backend/` y `frontend/`).

## Requisitos

- Node.js 22+
- Cuenta de MongoDB Atlas (capa gratuita)
- Proyecto de Firebase con Authentication (proveedor Google) habilitado

## Instalación

```bash
npm install
```

Copiar `.env.example` a `.env` y completar los valores; cada variable está explicada en ese archivo, con un ejemplo de cómo se ve. `MONGODB_URI`, `JWT_SECRET` y las tres variables de Firebase son obligatorias: sin ellas el servidor no arranca.

### Firebase

1. En [Firebase Console](https://console.firebase.google.com/) crear el proyecto, habilitar **Authentication → Google** y registrar las apps web y Android.
2. En *Configuración del proyecto → Cuentas de servicio* generar una clave privada (JSON).
3. Copiar `project_id`, `client_email` y `private_key` del JSON a `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` y `FIREBASE_PRIVATE_KEY` en `.env` (la clave entre comillas, con los saltos de línea como `\n`). En Render se cargan como variables de entorno del servicio.

El `.env` y el JSON de la service account no se versionan.

### Sesión de prueba (solo desarrollo)

Expo Go no permite el inicio de sesión con Google (ADR-011). Para revisar pantallas que requieren sesión existe `POST /auth/dev-login` (sin body), que devuelve la misma respuesta que `/auth/login` para un usuario de prueba fijo (`prueba@aequo.local`).

- Solo existe si `NODE_ENV=development` **y** `DEV_SESSION_ENABLED=true`. En cualquier otro caso la ruta no se registra (404), aunque la bandera esté activa.
- Nunca definir esas variables así en producción (Render): allí `NODE_ENV` debe ser `production` y `DEV_SESSION_ENABLED` no se define.
- Una prueba automatizada (`src/auth/dev-session.spec.ts`) verifica que en producción no está disponible.

## Scripts

```bash
npm run start:dev   # desarrollo con recarga automática
npm run build        # compilación de producción
npm run start:prod   # ejecutar build compilado
npm run lint          # oxlint
npm run test          # pruebas unitarias (Vitest)
npm run test:e2e      # pruebas end-to-end
npm run test:cov      # cobertura
```

## Flujo de trabajo

GitFlow: ramas `feature/`, `fix/`, `release/` desde `develop`; nunca directo sobre `main`. Conventional Commits en español (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).

Ver [CLAUDE.md](./CLAUDE.md) para el contexto completo de desarrollo (reglas de arquitectura, modelo de datos, enfoque de pruebas y flujo de trabajo con Claude Code).
