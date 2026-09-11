# Convenciones de control de versiones — Aequo

Aplica por igual a `aequo-backend` y `aequo-frontend`. Vigente desde el primer commit de cada repositorio.

## Ramas

| Rama | Rol |
|---|---|
| `main` | Producción. Solo recibe merges desde `release/*` o `qa` ya validados. Nunca se commitea directo. |
| `qa` | Ambiente de control de calidad. Recibe `release/*` para validación antes de promover a `main`. |
| `develop` | Integración. Base de todas las ramas de trabajo; siempre debe quedar en estado desplegable. |
| `feature/<nombre>` | Una funcionalidad o paquete de la EDT. Sale de `develop`, vuelve a `develop`. |
| `fix/<nombre>` | Corrección de bug. Sale de `develop` (o de `main` si es un hotfix urgente de producción), vuelve a donde salió. |
| `release/<version>` | Preparación de una versión (ajustes finales, changelog). Sale de `develop`, se valida en `qa`, se mergea a `main` y de vuelta a `develop`. |

Nombre de rama en minúsculas y guiones: `feature/registro-transacciones`, `fix/reasignacion-categoria-otros`.

Flujo:

```
feature/* ──┐
fix/*      ─┼──► develop ──► release/* ──► qa ──► main
                    ▲                        │
                    └────────────────────────┘
```

## Conventional Commits (en español)

Formato: `<tipo>: <descripción en infinitivo o imperativo>`

| Tipo | Uso |
|---|---|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de bug |
| `refactor` | Cambio de código que no altera comportamiento externo |
| `test` | Agregar o corregir pruebas |
| `docs` | Documentación (README, CLAUDE.md, ADR, comentarios) |
| `chore` | Mantenimiento (dependencias, configuración, build) |
| `style` | Formato/lint, sin cambio de lógica |
| `perf` | Mejora de rendimiento |

Ejemplos:

```
feat: agregar endpoint de creación de transacciones
fix: evitar eliminación de categoría predeterminada
docs: registrar ADR-0007 y actualizar CLAUDE.md con Firebase Auth
chore: instalar dependencias de mongoose y firebase-admin
```

Cuerpo del commit opcional, en viñetas, para detallar el qué cuando el título no alcanza (ver commits de este repo como referencia).

## Pull requests

- Todo `feature/*` y `fix/*` se integra a `develop` vía PR, no vía push directo.
- El título del PR sigue el mismo formato de Conventional Commits que sus commits.
- `release/*` → `qa` → `main` también vía PR, nunca merge directo sin pasar por `qa`.
