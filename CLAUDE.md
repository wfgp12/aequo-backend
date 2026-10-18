# CLAUDE.md — Aequo Backend

**Nombre del proyecto:** Aequo
**Este repositorio:** `aequo-backend` — API REST del proyecto (NestJS + MongoDB).
**Repositorio hermano:** `aequo-frontend` (React Native con Expo: web, Android e iOS desde una sola base de código). Este backend expone la API que consume ese frontend; no comparten código, solo el contrato de la API.
**Concepto de marca:** del latín *aequus* (equilibrio/equidad). Tagline: *"Aequo — el equilibrio de tus finanzas personales"*.

Este archivo es el contexto de referencia para trabajar en este repositorio con Claude Code. Léelo antes de generar o modificar código. La documentación completa del proyecto (Project Charter, Especificación de Requisitos, Análisis de Viabilidad, Documento de Diseño Técnico, ADR, EDT, Cronograma) vive en `../docs` (fuera de este repo; los ADR están en `../docs/adr`) — consultala para el detalle que no quepa aquí.

## 1. Qué es Aequo

Aequo es una aplicación de gestión financiera personal, simple e intuitiva, dirigida a personas sin conocimientos contables (actor principal) y a personas metódicas que ya llevan control manual en Excel/Numbers (actor secundario). Además de ingresos, egresos, reportes y ahorro, maneja tarjetas de crédito con compras a cuotas e intereses, deudas con personas y presupuesto mensual (versión 2.0 del alcance, ADR-013). Proyecto personal de Wilhen Ferney Gutierrez Pabon, sin presupuesto, con fines de portafolio profesional. El MVP se despliega solo en web; las apps de Android e iOS quedan en desarrollo (ADR-011). Estimación: unas 20 semanas de esfuerzo (ver Cronograma); el avance se lleva en el tablero de Notion "Aequo Finanzas — Seguimiento de la EDT".

**Objetivo general:** desarrollar una app de gestión financiera personal de uso simple e intuitivo, que dé a los usuarios visión clara de sus finanzas y los apoye en el logro de sus metas de ahorro.

## 2. Rol de este repositorio

Contiene **únicamente el backend**: la API REST que gestiona autenticación, movimientos financieros, categorías, reportes, ahorro, tarjetas de crédito, deudas, presupuesto e indicadores. Todos los cálculos financieros viven aquí, no en el frontend (RNF-11). No contiene código de interfaz — eso vive en `aequo-frontend`.

## 3. Stack técnico

| Elemento | Tecnología | Notas |
|---|---|---|
| Framework | **NestJS** | Arquitectura modular alineada con SOLID/Clean Code (RNF-09). |
| Base de datos | **MongoDB Atlas** (capa gratuita) | Ver sección 5, modelo de datos. |
| Autenticación | **Firebase Authentication** (proveedor Google) | El SDK de Firebase en el frontend maneja el login; el backend verifica el ID Token una sola vez con `firebase-admin` y emite su propio JWT de sesión (ver ADR-0007). No usar el ID Token de Firebase como sesión de la app — expira cada 1h y rompería RNF-01. |
| Hosting | **Render** (capa gratuita) | Posible cold start — ver RNF-02 y paquete 8.3.1 de la EDT. |
| Documentación de API | **Swagger/OpenAPI** vía `@nestjs/swagger` | Ver sección 7. No se mantiene un documento estático de endpoints (ADR-005). |
| Contrato con el frontend | API REST consumida vía patrón **Adapter** del lado del cliente | Mantené contratos estables y bien documentados (payloads, códigos de error); el Adapter del frontend se rompe con cambios silenciosos. |

## 4. Arquitectura

Sistema de 3 capas: Cliente React Native + Expo (web en GitHub Pages; Android e iOS en desarrollo) → API REST NestJS (Render) → MongoDB Atlas. Firebase Authentication (proveedor Google) se usa solo para la verificación inicial de identidad: el backend verifica el ID Token de Firebase con `firebase-admin` una única vez, en el login, y a partir de ahí emite y gestiona su propio JWT de sesión (24h, RNF-01) — Firebase no gestiona la sesión de la app (ver ADR-0007). El usuario se identifica por el **UID de Firebase**, no por el correo (ADR-012), para poder agregar Sign in with Apple más adelante sin migrar datos.

Dentro del backend, las clases de **entidad** (Mongoose) son deliberadamente anémicas — solo datos. Todo el comportamiento vive en clases de **servicio**, una por módulo funcional:

- `AuthService` — verificarIdToken(idToken), generarJWT(usuario), obtenerPerfil(usuarioId), eliminarCuenta(usuarioId)
- `TransaccionesService` — crear(dto), listar(filtros), editar(id, dto), eliminar(id), calcularBalancePeriodo(periodo)
- `CategoriasService` — crear(dto), editar(id, dto), eliminar(id), reasignarAOtros(categoriaId)
- `ReportesService` — obtenerPorPeriodo(periodo), compararPeriodos(tipo), obtenerEvolucion(rango)
- `MetasAhorroService` — definirMeta(dto), calcularDisponible(periodo), calcularAcumulado(), generarRecomendaciones()
- `TarjetasService` — crear(dto), actualizarTasa(id, tasaEA), registrarCompra(dto), calcularCuota(compra), proyectarPagos(tarjetaId), registrarPago(dto)
- `DeudasService` — registrarPrestamo(dto), registrarAbono(dto), calcularSaldo(deudaId)
- `PresupuestoService` — definirPresupuesto(dto), registrarObligacion(dto), marcarPagada(id, transaccionId), calcularPendiente(periodo), compararConReal(periodo)
- `IngresosService` — configurarRecurrente(dto), generarDelMes(periodo), configurarAportes(dto), calcularAportes(periodo)
- `IndicadoresService` — calcularIndicadores(periodo)

Los diagramas de clases, servicios, MER, modelo lógico y secuencias están en el Documento de Diseño Técnico v2.0 (`../docs`).

## 5. Modelo de datos (MongoDB)

Doce colecciones: `usuarios`, `transacciones`, `categorias`, `metasahorro`, `tarjetas`, `comprascredito`, `cargosrecurrentes`, `deudas`, `presupuestos`, `obligacionesfijas`, `ingresosrecurrentes`, `configuracionaportes` (campos en el modelo lógico del Documento de Diseño Técnico). Reglas de diseño ya decididas (ver ADR completo en `../docs/adr`):

- **ADR-001:** todas las relaciones se implementan por **referencia** (`ObjectId`), nunca por documentos embebidos.
- **ADR-002:** `categorias.usuarioId` es **opcional** (`null` permitido) — existen categorías generales del sistema (ej. "Otros") no asociadas a ningún usuario, junto con categorías personales. No inferir "es del sistema" por la ausencia de usuario: usar el campo explícito `esPredeterminada`.
- **ADR-003:** todo cambio de esquema sobre una colección con datos reales requiere un script de migración explícito, no solo el cambio en el schema de Mongoose. No aplica retroactivamente antes del primer despliegue con usuarios reales.
- **ADR-004 (pendiente, no implementar):** el ahorro/gasto compartido entre varios usuarios está fuera del alcance del MVP. No introducir un concepto de "Hogar/Grupo" sin que se pida explícitamente.

`TipoTransaccion`, `MetodoPago`, `TipoMeta`, `ClasificacionFlujo`, `TipoCompra` y `TipoInteres` son enumeraciones cerradas — validalas en el esquema de Mongoose, no como texto libre.

**Regla de flujo de caja (ADR-014) — no negociable:**

- `transacciones.clasificacionFlujo` puede ser `ORDINARIO`, `DINERO_RECIBIDO` (préstamo o avance), `ABONO_DEUDA` o `PAGO_TARJETA`.
- **Balance del mes:** cuenta el dinero que entra o sale de verdad (ordinarios, pagos de tarjeta y abonos). Una compra con tarjeta **no** afecta el balance el día de la compra; lo afecta el pago de la tarjeta.
- **Ingreso propio** (base del % ahorrado y del % comprometido): excluye `DINERO_RECIBIDO`.
- **Gasto por categoría:** las compras con tarjeta (`comprascredito`) cuentan por su categoría en el mes de compra; los `PAGO_TARJETA` y `ABONO_DEUDA` se excluyen para no contar dos veces.
- **Cuota de una compra:** tasa mensual `i = (1 + EA)^(1/12) − 1`; cuota `V·i / (1 − (1 + i)^(−n))`, o `V / n` si `i = 0` o si es una sola cuota en una tarjeta con `cuotaUnicaSinInteres`. La tasa se copia en `comprascredito.tasaEAAplicada` al registrar: cambiar la tasa de la tarjeta no recalcula compras anteriores.
- En `deudas` no se guardan el monto prestado ni lo abonado: se calculan a partir de las transacciones con `deudaId`.

`metasahorro` es una instancia **mensual**, no una meta única y permanente: cada periodo tiene su propio documento con su `ahorroReal`. El acumulado histórico se calcula sumando estos valores en `MetasAhorroService.calcularAcumulado()`, no se almacena aparte.

## 6. Flujo de registro de movimientos — importante

La UI expone **dos botones separados** ("Registrar ingreso" / "Registrar egreso"), no un formulario único con selector de tipo. Pero a nivel de API hay **un solo endpoint** `POST /transacciones`: el frontend fija el campo `tipo` en el body según el botón presionado, antes de enviar la solicitud. No dupliques el endpoint en `POST /transacciones/ingreso` y `POST /transacciones/egreso`.

Cuando el método de pago es tarjeta de crédito, el movimiento **no** se guarda como transacción: se registra como compra en `comprascredito` (endpoint del módulo de tarjetas). Préstamos recibidos, avances, abonos y pagos de tarjeta sí son transacciones, con su `clasificacionFlujo` y su `deudaId` o `tarjetaId`.

Al eliminar una categoría personalizada, `CategoriasService.reasignarAOtros()` reasigna automáticamente todas las transacciones asociadas a la categoría de respaldo "Otros" — este es un efecto secundario esperado, no un bug (ver diagrama de secuencia correspondiente en el Documento de Diseño Técnico). Una categoría con `esPredeterminada = true` nunca se puede eliminar.

## 7. Documentación de la API

Se genera con `@nestjs/swagger` a partir de decoradores en controladores y DTOs, expuesta en una ruta del propio backend (ej. `/api/docs`). No mantengas ni pidas un documento Word/Excel con la lista de endpoints — la fuente de verdad es el código (ADR-005). Decorá cada controlador y DTO nuevo a medida que lo creás; un endpoint sin decorar no aparece documentado, sin ninguna alerta que lo señale.

**La documentación debe ser muy detallada**, pensada para que un desarrollador que llegue después entienda cómo funciona sin leer el código. Cada endpoint nuevo incluye, en el mismo cambio:

- `@ApiTags` y `@ApiOperation` con `summary` y una `description` extensa (qué hace, flujo, reglas de negocio y efectos secundarios).
- `@ApiProperty` con `description` y `example` en cada campo de los DTO, tanto de entrada como de salida.
- Todas las respuestas posibles con su esquema: la exitosa y los errores que apliquen (400, 401, 404, 409, 500). Los esquemas de error compartidos están en `src/common/dto/error-respuesta.dto.ts`.
- `@ApiBearerAuth()` en las rutas protegidas.
- Si el endpoint tiene reglas que el cliente debe conocer, explicarlas también en la descripción general de `src/common/swagger.ts`.

La prueba `src/common/swagger.spec.ts` descubre todos los controladores y **falla** si un endpoint queda sin etiqueta, resumen, descripción detallada, respuesta de error o si una propiedad de un DTO no tiene descripción y ejemplo. Un paquete con endpoints no se da por terminado hasta que esa prueba pase y el endpoint se vea bien en `/api/docs`.

## 8. Enfoque de pruebas (TDD selectivo + shift-left)

No es TDD estricto en todo el proyecto. Es un híbrido:

- **TDD real** (prueba antes que código) únicamente en la lógica de cálculo/negocio no trivial: agregación de reportes por periodo y por categoría, motor de recomendaciones de ahorro, cálculo de progreso hacia meta, cuota fija y tasa mensual, proyección de tarjetas, saldo de deudas, pendiente por pagar y presupuesto frente a real, aportes e indicadores. Para los cálculos financieros, usar como casos de referencia los valores de la hoja de cálculo del promotor (ej.: $1.254.700 a 12 cuotas con E.A. 29,21% → cuota de $119.802,13).
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

- **Trabajar un paquete de trabajo de la EDT a la vez** (el nivel más atómico, ej. `1.1.1 Configurar proyecto de Firebase y proveedor Google`), nunca un subpaquete completo ni un módulo completo de una sola vez.
- Antes de empezar un paquete nuevo, **esperar confirmación explícita** del desarrollador de que puede avanzar — no encadenar el siguiente paquete automáticamente al terminar el anterior.
- Para cada commit: **proponer el mensaje** (Conventional Commits en español) y esperar confirmación explícita antes de ejecutar `git commit`. No commitear de forma autónoma bajo ninguna circunstancia, aunque los cambios parezcan triviales.
- No incluir el pie "Generated with Claude Code" ni "Co-Authored-By: Claude" en PR, commits ni ningún otro texto.
- Después de cada PR, dejar el repositorio limpio: volver a `develop`, actualizarlo (`git pull` y `git fetch --prune`) y borrar las ramas que ya se mezclaron, locales (`git branch -d`; con merge por squash git no las considera mezcladas y hay que usar `-D`, tras comprobar que su PR está en estado MERGED) y remotas (`git push origin --delete`). Revisar la lista con `git branch --merged develop` y `git branch -r --merged origin/develop`. Nunca borrar la rama de un PR que sigue abierto, ni `main`, `qa` o `develop`.
- La sesión de prueba para desarrollo (paquete 1.1.4) solo puede activarse con la configuración de desarrollo; nunca debe quedar disponible en producción.

## 10. Roadmap (referencia rápida)

Orden de construcción por módulo (EDT v2.0; detalle en el Diccionario de la EDT y en Notion): 0. Gestión y entorno → 1. Autenticación → 2. Registro (transacciones + categorías) → 3. Reportes y visualización → 4. Ahorro → 5. Tarjetas de crédito → 6. Deudas → 7. Presupuesto e indicadores → 8. Despliegue y cierre. Cada módulo cierra con sus propias pruebas antes de avanzar al siguiente (ver sección 8).
