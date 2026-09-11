# Aequo — Backend

> *"Aequo — el equilibrio de tus finanzas personales"*

API REST del proyecto **Aequo**, una aplicación de gestión financiera personal simple e intuitiva. Este repositorio contiene únicamente el backend; la interfaz vive en el repositorio hermano `aequo-frontend` (Angular), que consume esta API.

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

Cliente Angular → API REST NestJS (este repo) → MongoDB Atlas. La autenticación se delega a Firebase; el backend no gestiona contraseñas ni credenciales propias de usuario.

Las entidades (Mongoose) son anémicas — solo datos. El comportamiento vive en clases de servicio, una por módulo funcional: `AuthService`, `TransaccionesService`, `CategoriasService`, `ReportesService`, `MetasAhorroService`.

Documentación completa del proyecto (Charter, Especificación de Requisitos, ADR, EDT, Documento de Diseño Técnico, Cronograma) en `../docs` (fuera de este repo, hermano de `backend/` y `frontend/`).

## Requisitos

- Node.js 22+
- Cuenta de MongoDB Atlas (capa gratuita)
- Proyecto de Firebase con Authentication (proveedor Google) habilitado

## Instalación

```bash
npm install
```

Configurar variables de entorno (ver `.env.example` cuando exista; por ahora: credenciales de MongoDB Atlas y del proyecto de Firebase — service account para `firebase-admin`).

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
