# MotoSpa — Reglas para el agente

La fuente de verdad es [SPEC.md](SPEC.md). Léelo antes de proponer o escribir código y regístrale las decisiones nuevas (sección 15).

## Forma de trabajo

- Trabajar **por fases** (SPEC §13); no adelantar módulos de fases futuras.
- Antes de implementar un módulo: plan corto (tablas, endpoints, pantallas) y esperar aprobación.
- Si algo es ambiguo o contradictorio, preguntar antes de asumir.
- **Base de datos:** Supabase en la nube, sin entorno local. Los cambios de esquema van como SQL en `supabase/migrations/` (crear con `supabase migration new <nombre>`); **el usuario los ejecuta** en el SQL Editor. No aplicar migraciones directamente.
- Idioma: código, tablas y variables en **inglés**; UI, mensajes y documentación en **español (Colombia)**.

## Convenciones (SPEC §2)

- Dinero: enteros COP (`integer`/`bigint`), nunca `float`.
- Fechas: `timestamptz` en UTC; mostrar en `America/Bogota`.
- IDs: UUID. Campos comunes: `id`, `tenant_id`, `created_at`, `updated_at`, `created_by`; operativas además `branch_id`.
- Maestras: borrado lógico (`deleted_at`). Movimientos (pagos, inventario, caja): **inmutables**, se anulan con movimiento inverso + motivo + auditoría.

## Seguridad y datos

- Toda tabla nueva: `tenant_id`, RLS activado, política `to app_api` por `app.current_tenant_id()`, `grant` explícito a `app_api` y nada para `anon`/`authenticated`.
- Todo acceso a datos desde NestJS pasa por `DbService.withTenant()` (asume `app_api` + `set_config`).
- Toda escritura de negocio registra auditoría con `AuditService.log(tx, ...)` en la **misma transacción**.
- Endpoints protegidos por defecto (guard global); usar `@RequirePermission(...)` con códigos de `@motospa/shared`. `@Public()` solo para lo estrictamente público.
- Nunca usar `user_metadata` para autorizar; el `tenant_id` va en `app_metadata`.
- Reglas de dinero e inventario siempre con pruebas unitarias.

## Diseño (SPEC decisión 19: "Espuma")

- Tokens en `apps/web/src/styles/index.css` (colores, `bg-brand-gradient`, `shadow-soft`, `bg-plate`); no usar colores literales en componentes.
- Toda moto se muestra con `<Plate plate="ABC12D" />` (`components/plate.tsx`).
- Una acción principal por pantalla (`<Button size="touch">`); toques ≥ 48 px con 8 px de separación.
- Estados siempre con color **y** texto (`success`/`warning`/`info` + `-soft`).
- Celular: barra inferior (≤ 4 + "Más"); PC: panel lateral. Respetar `prefers-reduced-motion`.

## Estructura

- `apps/web` — Vite + React 19 (SPA), React Router 7, TanStack Query 5, Tailwind 4, shadcn/ui (Base UI), oxlint. Misma organización que GenericSoft:
  - `src/api/` — **único** lugar que habla con Supabase (`supabase.ts`, solo sesión) y con el backend (`client.ts` → `apiFetch`). Las pantallas usan los hooks de `api/`, nunca `fetch` ni `supabase` directo.
  - `src/app/` — `App.tsx` (decide qué ve cada quien según sesión y permisos), `AppShell.tsx` (menú), `currentUser.ts`.
  - `src/features/<módulo>/` — pantallas por módulo, cargadas con `lazy()`.
  - Polling del tablero con `refetchInterval: 10_000` de TanStack Query (decisión 9).
- `apps/api` — NestJS 12 (ESM, imports con `.js`), Drizzle (`src/db/schema.ts` es espejo del SQL), Vitest.
- `packages/shared` — permisos, roles y tipos compartidos.
- `supabase/` — migraciones y `seed.sql`.

## Reglas de negocio y pruebas

- Las reglas puras (parqueo, descuentos, estados de la orden, arqueo, formatos) viven en `packages/shared/src` con pruebas: la API y la UI usan el mismo cálculo.
- Los contratos de entrada son esquemas Zod en `packages/shared/src/schemas.ts`; en NestJS se validan con `ZodPipe`.
- `apps/api/test/db/` prueba con **PGlite** (Postgres embebido) aplicando las migraciones y seeds reales: RLS, restricciones y el flujo completo con los servicios reales (`flow.spec.ts`). Toda migración nueva debe pasar ahí antes de entregarla al usuario.
- Las restricciones que el usuario puede provocar se traducen a 409 con mensaje claro en `common/db-errors.ts`.
- Plan y decisiones de la Fase 1: `docs/FASE-1.md`.

## Comandos

- Puertos locales: web **3100**, API **3101** (el 3000 lo usa otro proyecto del usuario).
- `pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm format`
- `pnpm --filter @motospa/api seed:users` — crea los usuarios demo.
