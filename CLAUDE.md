# CLAUDE.md — Aequo Backend

**Nombre del proyecto:** Aequo
**Este repositorio:** `aequo-backend` — API REST del proyecto (NestJS + MongoDB).
**Repositorio hermano:** `aequo-frontend` (Angular). Este backend expone la API que consume ese frontend; no comparten código, solo el contrato de la API.
**Concepto de marca:** del latín *aequus* (equilibrio/equidad). Tagline: *"Aequo — el equilibrio de tus finanzas personales"*.

Este archivo es el contexto de referencia para trabajar en este repositorio con Claude Code. Léelo antes de generar o modificar código. La documentación completa del proyecto (Project Charter, Especificación de Requisitos, Análisis de Viabilidad, Documento de Diseño Técnico, ADR, EDT, Cronograma) vive en `docs/` — consultala para el detalle que no quepa aquí.

## 1. Qué es Aequo

Aequo es una aplicación web de gestión financiera personal, simple e intuitiva, dirigida a personas sin conocimientos contables (actor principal) y a personas metódicas que ya llevan control manual en Excel/Numbers (actor secundario). Proyecto personal de Wilhen Fabián García, sin presupuesto, con fines de portafolio profesional, a construirse en ~9-10 semanas efectivas de tiempo parcial (ver Cronograma).

**Objetivo general:** desarrollar una app de gestión financiera personal de uso simple e intuitivo, que dé a los usuarios visión clara de sus finanzas y los apoye en el logro de sus metas de ahorro.

## 2. Rol de este repositorio

Contiene **únicamente el backend**: la API REST que gestiona autenticación, movimientos financieros, categorías, reportes e indicadores de ahorro. No contiene código de interfaz — eso vive en `aequo-frontend`.

## 3. Stack técnico

| Elemento | Tecnología | Notas |
|---|---|---|
| Framework | **NestJS** | Arquitectura modular alineada con SOLID/Clean Code (RNF-09). |
| Base de datos | **MongoDB Atlas** (capa gratuita) | Ver sección 5, modelo de datos. |
| Autenticación | **Firebase Authentication** (proveedor Google) | El SDK de Firebase en el frontend maneja el login; el backend verifica el ID Token una sola vez con `firebase-admin` y emite su propio JWT de sesión (ver ADR-0007). No usar el ID Token de Firebase como sesión de la app — expira cada 1h y rompería RNF-01. |
| Hosting | **Render** (capa gratuita) | Posible cold start — ver RNF-02 y paquete 5.3.1 de la EDT. |
| Documentación de API | **Swagger/OpenAPI** vía `@nestjs/swagger` | Ver sección 7. No se mantiene un documento estático de endpoints (ADR-005). |
| Contrato con el frontend | API REST consumida vía patrón **Adapter** del lado del cliente | Mantené contratos estables y bien documentados (payloads, códigos de error); el Adapter del frontend se rompe con cambios silenciosos. |

## 4. Arquitectura

Sistema de 3 capas: Cliente Angular (GitHub Pages) → API REST NestJS (Render) → MongoDB Atlas. Firebase Authentication (proveedor Google) se usa solo para la verificación inicial de identidad: el backend verifica el ID Token de Firebase con `firebase-admin` una única vez, en el login, y a partir de ahí emite y gestiona su propio JWT de sesión (24h, RNF-01) — Firebase no gestiona la sesión de la app (ver ADR-0007). El diagrama de secuencia de login en el Documento de Diseño Técnico todavía muestra el flujo de Google OAuth puro anterior a esta decisión, pendiente de actualizar.

Dentro del backend, las clases de **entidad** (Mongoose) son deliberadamente anémicas — solo datos. Todo el comportamiento vive en clases de **servicio**, una por módulo funcional:

- `AuthService` — verificarTokenFirebase(idToken), sincronizarUsuario(perfilFirebase), generarJWT(usuario), obtenerPerfil(usuarioId)
- `TransaccionesService` — crear(dto), listar(filtros), editar(id, dto), eliminar(id), calcularBalancePeriodo(periodo)
- `CategoriasService` — crear(dto), editar(id, dto), eliminar(id), reasignarAOtros(categoriaId)
- `ReportesService` — obtenerPorPeriodo(periodo), compararPeriodos(tipo)
- `MetasAhorroService` — definirMeta(dto), calcularDisponible(periodo), calcularAcumulado(), generarRecomendaciones()

## 5. Modelo de datos (MongoDB)

Cuatro colecciones: `usuarios`, `transacciones`, `categorias`, `metasahorro`. Reglas de diseño ya decididas (ver ADR completo en `docs/ADR_Aequo_Finanzas.docx`):

- **ADR-001:** todas las relaciones se implementan por **referencia** (`ObjectId`), nunca por documentos embebidos.
- **ADR-002:** `categorias.usuarioId` es **opcional** (`null` permitido) — existen categorías generales del sistema (ej. "Otros") no asociadas a ningún usuario, junto con categorías personales. No inferir "es del sistema" por la ausencia de usuario: usar el campo explícito `esPredeterminada`.
- **ADR-003:** todo cambio de esquema sobre una colección con datos reales requiere un script de migración explícito, no solo el cambio en el schema de Mongoose. No aplica retroactivamente antes del primer despliegue con usuarios reales.
- **ADR-004 (pendiente, no implementar):** el ahorro/gasto compartido entre varios usuarios está fuera del alcance del MVP. No introducir un concepto de "Hogar/Grupo" sin que se pida explícitamente.

`transacciones.tipo`, `transacciones.metodoPago` y `metasahorro.tipoMeta` son enumeraciones cerradas (`TipoTransaccion`, `MetodoPago`, `TipoMeta`) — validalas en el esquema de Mongoose, no como texto libre.

`metasahorro` es una instancia **mensual**, no una meta única y permanente: cada periodo tiene su propio documento con su `ahorroReal`. El acumulado histórico se calcula sumando estos valores en `MetasAhorroService.calcularAcumulado()`, no se almacena aparte.

## 6. Flujo de registro de movimientos — importante

La UI expone **dos botones separados** ("Registrar ingreso" / "Registrar egreso"), no un formulario único con selector de tipo. Pero a nivel de API hay **un solo endpoint** `POST /transacciones`: el frontend fija el campo `tipo` en el body según el botón presionado, antes de enviar la solicitud. No dupliques el endpoint en `POST /transacciones/ingreso` y `POST /transacciones/egreso`.

Al eliminar una categoría personalizada, `CategoriasService.reasignarAOtros()` reasigna automáticamente todas las transacciones asociadas a la categoría de respaldo "Otros" — este es un efecto secundario esperado, no un bug (ver diagrama de secuencia correspondiente en el Documento de Diseño Técnico). Una categoría con `esPredeterminada = true` nunca se puede eliminar.

## 7. Documentación de la API

Se genera con `@nestjs/swagger` a partir de decoradores en controladores y DTOs, expuesta en una ruta del propio backend (ej. `/api/docs`). No mantengas ni pidas un documento Word/Excel con la lista de endpoints — la fuente de verdad es el código (ADR-005). Decorá cada controlador y DTO nuevo a medida que lo creás; un endpoint sin decorar no aparece documentado, sin ninguna alerta que lo señale.

## 8. Enfoque de pruebas (TDD selectivo + shift-left)

No es TDD estricto en todo el proyecto. Es un híbrido:

- **TDD real** (prueba antes que código) únicamente en la lógica de cálculo/negocio no trivial: agregación de reportes por periodo y por categoría, motor de recomendaciones de ahorro (análisis estático de reglas), y cálculo de progreso hacia meta.
- **Shift-left sin TDD estricto** en el resto (CRUD, autenticación): escribí las pruebas automatizadas inmediatamente después de terminar cada subpaquete, antes de avanzar al siguiente — nunca dejarlas para el final del módulo o del proyecto.

Cobertura mínima objetivo: 80% en lógica de negocio del backend (servicios). Complejidad ciclomática máxima 10 por función. Duplicación de código menor a 5% (SonarQube). Ver Plan de Gestión de Calidad para el resto de criterios.

## 9. Reglas de desarrollo (no negociables)

- Seguir **SOLID** y **Clean Code**, aprovechando la arquitectura modular e inyección de dependencias de NestJS.
- Aplicar patrones de diseño donde sea pertinente, no forzados.
- Antes de implementar una función nueva no listada en los RF, verificar si está en las exclusiones del alcance (Especificación de Requisitos). Si lo está, señalarlo y preguntar antes de implementarla.
- Priorizar código legible y modular (módulos, servicios, DTOs bien separados) por sobre soluciones ingeniosas pero difíciles de mantener.
- **GitFlow**: ramas `feature/`, `fix/`, `release/` desde `develop`, nunca directo sobre `main`. Ver [CONTRIBUTING.md](./CONTRIBUTING.md) para el flujo completo (incluida `qa`) y convención de nombres.
- **Conventional Commits en español**: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`. Ejemplo: `feat: agregar endpoint de creación de transacciones`.
- Si una alternativa técnica sería claramente mejor que el stack ya decidido, proponerla y preguntar — no cambiarla unilateralmente.

## 9.1 Flujo de trabajo con Claude Code (avance controlado)

- **Trabajar un paquete de trabajo de la EDT a la vez** (el nivel más atómico, ej. `1.1.1 Configurar credenciales OAuth`), nunca un subpaquete completo ni un módulo completo de una sola vez.
- Antes de empezar un paquete nuevo, **esperar confirmación explícita** del desarrollador de que puede avanzar — no encadenar el siguiente paquete automáticamente al terminar el anterior.
- Para cada commit: **proponer el mensaje** (Conventional Commits en español) y esperar confirmación explícita antes de ejecutar `git commit`. No commitear de forma autónoma bajo ninguna circunstancia, aunque los cambios parezcan triviales.
- No agregar co-author tags en commits salvo instrucción explícita.

## 10. Roadmap (referencia rápida)

Orden de construcción por módulo (ver Cronograma para el detalle día a día): 0. Entorno base → 1. Autenticación → 2. Registro (transacciones + categorías) → 3. Reportes y visualización → 4. Ahorro → 5. Despliegue y cierre. Cada módulo cierra con sus propias pruebas antes de avanzar al siguiente (ver sección 8).
