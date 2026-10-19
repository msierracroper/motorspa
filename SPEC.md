# MotoSpa — Documento Maestro del Proyecto

> Sistema de gestión para lavadero / spa de motos con parqueadero.
> Este documento es la fuente de verdad del proyecto. Claude (VS Code) debe leerlo completo antes de proponer o escribir código, y mantenerlo actualizado cuando se tomen decisiones nuevas (sección 15: Registro de decisiones).

---

## 0. Instrucciones para Claude (agente de código)

1. Lee este documento completo antes de empezar cualquier tarea.
2. Trabaja **por fases** (sección 13). No adelantes módulos de fases futuras salvo que se pida.
3. Antes de implementar un módulo, presenta un plan corto (tablas, endpoints, pantallas) y espera aprobación.
4. Respeta las **reglas de negocio** (sección 6) y la **matriz de permisos** (sección 8). Toda regla de dinero o inventario debe tener pruebas.
5. Toda operación de escritura sobre datos de negocio debe quedar en la **bitácora de auditoría**.
6. Si algo de este documento es ambiguo o contradictorio, pregunta antes de asumir. Si se decide algo nuevo, agrégalo a la sección 15.
7. Idioma: código, nombres de tablas y variables en **inglés**; textos de UI, mensajes y documentación en **español (Colombia)**.

---

## 1. Visión y alcance

**Problema:** Los lavaderos de motos controlan ingresos, cobros, comisiones e insumos en cuaderno o Excel. Esto genera pérdida de dinero (cobros mal calculados, faltantes de caja), desperdicio o robo de insumos, conflictos por comisiones y nula información para decidir.

**Solución:** Una aplicación web (usable desde celular, tablet y PC) que controla:

- Entrada y salida de motos (lavado y/o parqueo).
- Servicios realizados, quién los ejecutó y cuánto tardó.
- Agendamiento de citas.
- Parqueadero por tiempo y mensualidades.
- Inventario de insumos con descuento automático por servicio.
- Caja, cobros, gastos y comisiones.
- Reportes operativos y financieros.
- Roles y permisos con auditoría.

**Modelo:** Diseñado **multi-sede y multi-empresa (multi-tenant) desde el día uno**, aunque se lance primero para un solo negocio. Esto permite venderlo después como SaaS sin rehacer el modelo de datos.

**Fuera de alcance inicial (posibles fases futuras):** app móvil nativa, nómina completa, contabilidad formal, integración con cámaras/lectores de placa (LPR).

---

## 2. Stack tecnológico

| Capa | Tecnología | Notas |
|---|---|---|
| Frontend | Vite + React 19 + TypeScript + React Router 7 + TanStack Query 5 + Tailwind 4 + shadcn/ui | SPA/PWA, mobile-first (decisión 20) |
| Backend | NestJS + TypeScript | API REST, validación con class-validator / zod |
| Base de datos | PostgreSQL (Supabase) | Datos relacionales y transaccionales (dinero, inventario) |
| ORM | Drizzle | Migraciones versionadas (decisión 11) |
| Auth | Supabase Auth | JWT validado en NestJS |
| Archivos | Supabase Storage | Fotos de check-in, soportes de gastos, logos |
| Tiempo real | Polling cada 10 s (decisión 9); Supabase Realtime a futuro | Tablero de órdenes en vivo |
| Deploy | Vercel (frontend y NestJS, dos proyectos), Supabase (DB) | Decisión 16 |
| Repositorio | GitHub, monorepo (pnpm workspaces o Turborepo) | `apps/web`, `apps/api`, `packages/shared` |
| Notificaciones | WhatsApp (Cloud API o proveedor) — Fase 3 | |
| Facturación electrónica | Proveedor DIAN (Alegra, Siigo, Factus u otro) — Fase 4 | |

**Por qué PostgreSQL y no MongoDB:** caja, inventario y comisiones requieren transacciones ACID, integridad referencial y reportes con agregaciones; el modelo relacional encaja mejor.

### Convenciones técnicas
- **Dinero:** enteros en pesos colombianos (COP), tipo `integer`/`bigint`. Nunca `float`.
- **Fechas:** `timestamptz` en UTC en la base de datos; se muestran en `America/Bogota`.
- **IDs:** UUID.
- **Borrado:** lógico (`deleted_at`) para entidades maestras; los movimientos (pagos, inventario, caja) **nunca se borran**, se **anulan** con un movimiento inverso.
- **Multi-tenant:** toda tabla de negocio lleva `tenant_id`; las operativas además `branch_id` (sede). Aislamiento reforzado en el backend y con RLS en Supabase.
- Campos comunes: `id`, `tenant_id`, `created_at`, `updated_at`, `created_by`.

---

## 3. Glosario

| Término | Significado |
|---|---|
| Tenant / Empresa | Negocio cliente del sistema |
| Sede (branch) | Punto físico de una empresa |
| Orden (work order) | Registro de una moto desde que entra hasta que sale |
| Servicio | Trabajo del catálogo (lavado sencillo, polichado, etc.) |
| Receta | Insumos y cantidades que consume un servicio |
| Lavador / Operario | Empleado que ejecuta servicios |
| Turno de caja | Periodo entre apertura y cierre de una caja |
| Arqueo | Comparación entre el dinero esperado y el contado al cerrar caja |
| Mensualidad | Plan de parqueo por periodo fijo |
| Bahía | Puesto de lavado (define capacidad para citas) |
| Cupo | Puesto de parqueo |

---

## 4. Módulos funcionales

### 4.1 Clientes y motos
- La **placa** es el identificador de búsqueda principal (formato colombiano de moto: `ABC12D`; permitir otros formatos).
- Moto: placa, marca, línea, cilindraje (cc), color, año (opcional), notas.
- Cliente: nombre, teléfono (WhatsApp), documento (opcional, obligatorio para factura electrónica), email (opcional).
- Una moto puede tener varios clientes asociados (propietario, quien la trae); una orden registra quién la trajo.
- Historial completo por placa: órdenes, servicios, pagos y observaciones.

### 4.2 Ingreso (check-in)
1. Buscar la placa; si no existe, crear la moto y el cliente rápidamente (mínimo: placa y teléfono).
2. Elegir el tipo de ingreso: **solo lavado / solo parqueo / lavado + parqueo**.
3. Seleccionar los servicios (si aplica).
4. Registrar el estado de la moto: fotos (opcionales, configurables como obligatorias), rayones o golpes observados, kilometraje (opcional) y nivel de combustible (opcional).
5. Registrar las pertenencias dejadas: casco(s), chaqueta, llaves, otros.
6. Asignar el cupo de parqueo (si aplica).
7. Generar un **ticket** con número consecutivo y código QR (impresión térmica de 58/80 mm o envío digital).

### 4.3 Órdenes y ejecución
Estados de la orden (máquina de estados, ver sección 7):
`RECEIVED → QUEUED → IN_PROGRESS → READY → DELIVERED` y además `CANCELLED`.

- Cada **ítem de servicio** de la orden se asigna a uno o varios lavadores (si es compartido, la comisión se reparte según la regla configurada).
- El lavador marca el **inicio** y el **fin** de cada ítem; así se mide la duración real frente al tiempo estimado.
- Tablero en vivo (kanban) por estado para recepción y operarios.
- Se pueden agregar o quitar servicios mientras la orden no esté pagada (quitar requiere permiso si el servicio ya inició).
- Al pasar a `READY`, se notifica al cliente (Fase 3: WhatsApp).

### 4.4 Parqueadero
- Configuración de cupos por sede (cantidad, y opcionalmente cupos identificados).
- **Tarifas** configurables por sede:
  - Tipo: por minuto, por fracción (por ejemplo, cada 15 o 30 minutos), por hora o por día.
  - Tiempo de gracia (por ejemplo, los primeros 10 minutos gratis).
  - Tope diario (valor máximo por 24 horas).
  - Tarifa nocturna y franja horaria.
  - Regla de cortesía: si la moto entra a lavado, parqueo gratis durante el servicio más X minutos (configurable).
- **Mensualidades:** cliente + placa(s), fecha de inicio y fin, valor y estado. Una moto con mensualidad vigente no paga parqueo por tiempo. Alertas de vencimiento.
- Tablero de ocupación: cupos libres/ocupados y motos con más de N horas.

### 4.5 Catálogo de servicios
- Servicio: nombre, descripción, categoría, tiempo estimado (min), activo/inactivo.
- **Precio por rango de cilindraje** (por ejemplo, ≤150cc, 151–400cc, >400cc) o precio único.
- **Combos/paquetes:** agrupan servicios con un precio especial.
- **Receta de insumos:** lista de producto + cantidad consumida por servicio (puede variar por rango de cilindraje).
- **Regla de comisión** por servicio: porcentaje sobre el precio o valor fijo.

### 4.6 Agendamiento de citas
- Capacidad por sede = número de **bahías** activas y horario de atención.
- Una cita incluye cliente, moto, servicios, fecha/hora y duración (suma de los tiempos estimados).
- Validación de disponibilidad por franjas.
- Estados: `SCHEDULED → CONFIRMED → CHECKED_IN` (se convierte en orden) / `NO_SHOW` / `CANCELLED`.
- Canales: interno (recepción) y **link público de reservas** por sede (Fase 3).
- Recordatorios por WhatsApp (Fase 3).

### 4.7 Personal y comisiones
- Empleado: nombre, documento, teléfono, rol, sede(s), activo, esquema de comisión por defecto.
- La comisión se calcula al **pagar** la orden (no antes) por cada ítem ejecutado.
- Si el ítem lo hicieron varios lavadores: reparto en partes iguales o por porcentaje manual (configurable).
- Si el servicio tuvo descuento: configurable si la comisión se calcula sobre el precio lleno o sobre el valor cobrado.
- **Liquidación de comisiones** por periodo (día o semana): genera el detalle, se marca como pagada y puede registrarse como egreso de caja.
- Los adelantos o préstamos a empleados se descuentan en la liquidación.

### 4.8 Inventario de insumos
- Producto: nombre, SKU, categoría, unidad base (ml, g, unidad), unidad de compra con factor de conversión (por ejemplo, galón = 3785 ml), stock mínimo, costo promedio, ¿se vende en mostrador? y precio de venta.
- Stock **por sede**.
- Movimientos (kardex) inmutables:
  - `PURCHASE` (entrada por compra, con proveedor, factura y costo),
  - `CONSUMPTION` (salida automática por receta al **finalizar** un ítem de servicio),
  - `SALE` (venta de mostrador),
  - `ADJUSTMENT` (ajuste positivo/negativo con motivo, requiere permiso),
  - `TRANSFER` (entre sedes).
- Costo con **promedio ponderado**.
- Alertas de stock bajo.
- **Conteo físico** (toma de inventario): se registra lo contado, el sistema calcula la diferencia y genera los ajustes.
- Proveedores: nombre, NIT, contacto.

### 4.9 Caja y cobros
- **Turno de caja**: apertura con base inicial por usuario y caja; solo un turno abierto por caja.
- Cobro de una orden: suma de servicios + parqueo + productos − descuentos.
- **Medios de pago** configurables: efectivo, Nequi, Daviplata, tarjeta débito/crédito, transferencia, otros. Se permiten **pagos mixtos**.
- **Descuentos**: porcentaje o valor; por encima del límite del rol requieren autorización (PIN o aprobación de supervisor).
- **Propinas**: se registran aparte y se asignan al lavador (no son ingreso del negocio).
- **Cuentas por cobrar**: un cliente frecuente o empresa puede quedar debiendo; se registran abonos.
- **Anulación** de un pago: solo con permiso, con motivo, y genera un movimiento inverso.
- **Movimientos manuales de caja**: ingresos y egresos (gastos pagados desde caja, pago de comisiones).
- **Cierre / arqueo**: el sistema muestra lo esperado por medio de pago; el cajero registra lo contado (con conteo por denominación opcional) y se calcula la diferencia (sobrante/faltante), que queda registrada.
- Comprobante de pago (ticket térmico o digital). Factura electrónica DIAN en Fase 4.

### 4.10 Gastos
- Categorías configurables: servicios públicos (agua, energía), arriendo, nómina, insumos, mantenimiento de equipos, publicidad, otros.
- Gasto: fecha, categoría, descripción, valor, proveedor, medio de pago, **origen** (caja del turno o administrativo/banco) y foto del soporte.
- Los gastos pagados desde caja afectan el arqueo del turno.
- Gastos recurrentes (arriendo mensual) con recordatorio.

### 4.11 Fidelización (Fase 3)
- Tarjeta de sellos: cada N lavados, uno gratis (configurable).
- Puntos por valor pagado (opcional).
- Lista de clientes inactivos (sin visitas en X días) para campañas.

### 4.12 Notificaciones (Fase 3)
- "Tu moto está lista" (WhatsApp).
- Recordatorio de cita.
- Vencimiento de mensualidad.
- Alertas internas: stock bajo, diferencia en cierre de caja, moto parqueada por más de N horas.

---

## 5. Modelo de datos (borrador)

> Todas las tablas incluyen `id (uuid)`, `tenant_id`, `created_at`, `updated_at`; las operativas además `branch_id`. Ajustar en Fase 0.

### Organización y seguridad
- `tenants` (name, nit, logo_url, settings jsonb, plan, status)
- `branches` (tenant_id, name, address, phone, opening_hours jsonb, settings jsonb)
- `users` (auth_user_id, tenant_id, full_name, phone, pin_hash, status)
- `roles` (tenant_id, name, is_system)
- `permissions` (code, description) — catálogo fijo
- `role_permissions` (role_id, permission_code)
- `user_branch_roles` (user_id, branch_id, role_id)
- `audit_logs` (user_id, branch_id, entity, entity_id, action, before jsonb, after jsonb, reason, ip, created_at)

### Clientes y motos
- `customers` (full_name, phone, document_type, document_number, email, notes, marketing_opt_in)
- `motorcycles` (plate UNIQUE por tenant, brand, model, cc, color, year, notes)
- `customer_motorcycles` (customer_id, motorcycle_id, relation)

### Catálogo
- `service_categories` (name, sort_order)
- `services` (category_id, name, description, estimated_minutes, commission_type [PERCENT|FIXED], commission_value, active)
- `service_prices` (service_id, branch_id nullable, cc_min, cc_max, price)
- `service_recipes` (service_id, product_id, quantity_base_unit, cc_min, cc_max)
- `packages` (name, price, active) / `package_items` (package_id, service_id)

### Operación
- `work_orders` (branch_id, number consecutivo por sede, motorcycle_id, customer_id, type [WASH|PARKING|WASH_PARKING], status, appointment_id, parking_spot_id, checked_in_at, checked_in_by, ready_at, delivered_at, delivered_by, mileage, fuel_level, notes)
- `work_order_items` (work_order_id, service_id, package_id, unit_price, discount, total, status [PENDING|IN_PROGRESS|DONE|CANCELLED], started_at, finished_at)
- `work_order_item_staff` (item_id, employee_id, share_percent)
- `work_order_photos` (work_order_id, url, kind [CHECK_IN|CHECK_OUT|DAMAGE])
- `work_order_belongings` (work_order_id, item, quantity, returned bool)
- `work_order_status_history` (work_order_id, from_status, to_status, user_id, at)

### Parqueadero
- `parking_spots` (branch_id, code, active)
- `parking_rates` (branch_id, name, mode [MINUTE|FRACTION|HOUR|DAY], fraction_minutes, price_per_unit, grace_minutes, daily_cap, night_start, night_end, night_price, active)
- `parking_sessions` (work_order_id, spot_id, rate_id, entry_at, exit_at, minutes, amount, courtesy_minutes, monthly_plan_id)
- `monthly_plans` (customer_id, branch_id, start_date, end_date, price, status) / `monthly_plan_motorcycles`

### Citas
- `bays` (branch_id, name, active)
- `appointments` (branch_id, customer_id, motorcycle_id, start_at, end_at, bay_id, status, source [INTERNAL|PUBLIC_LINK|WHATSAPP], notes)
- `appointment_items` (appointment_id, service_id)

### Personal
- `employees` (user_id nullable, full_name, document, phone, active, default_commission_rule jsonb)
- `commissions` (employee_id, work_order_item_id, base_amount, rate, amount, status [PENDING|SETTLED], settlement_id)
- `commission_settlements` (employee_id, period_start, period_end, gross, deductions, net, paid_at, cash_movement_id)
- `employee_advances` (employee_id, amount, date, settlement_id)

### Inventario
- `products` (sku, name, category, base_unit, purchase_unit, conversion_factor, min_stock, avg_cost, sellable, sale_price, active)
- `product_stock` (product_id, branch_id, quantity) — calculado/actualizado transaccionalmente
- `inventory_movements` (product_id, branch_id, type, quantity (+/−), unit_cost, reference_type, reference_id, reason, user_id)
- `suppliers` (name, nit, phone, email)
- `purchases` (supplier_id, branch_id, invoice_number, date, total, status) / `purchase_items`
- `stock_counts` / `stock_count_items` (counted_qty, system_qty, difference)

### Caja y finanzas
- `cash_registers` (branch_id, name)
- `cash_shifts` (register_id, opened_by, opened_at, opening_amount, closed_by, closed_at, expected jsonb por medio de pago, counted jsonb, difference, notes, status)
- `payment_methods` (tenant_id, name, type [CASH|DIGITAL|CARD|OTHER], active)
- `payments` (work_order_id nullable, sale_id nullable, shift_id, total, status [PAID|VOIDED], voided_by, void_reason)
- `payment_lines` (payment_id, payment_method_id, amount, reference)
- `tips` (payment_id, employee_id, amount)
- `cash_movements` (shift_id, type [INCOME|EXPENSE], category, amount, description, reference_type, reference_id)
- `receivables` (customer_id, work_order_id, amount, balance, status) / `receivable_payments`
- `expense_categories` / `expenses` (branch_id, category_id, date, description, amount, supplier_id, payment_method_id, source [CASH_SHIFT|ADMIN], shift_id, receipt_url)
- `counter_sales` / `counter_sale_items` (venta de productos sin orden)

### Configuración
- `discount_rules` por rol (max_percent, max_amount)
- `sequences` (branch_id, type, next_value) para consecutivos de órdenes, tickets y recibos

---

## 6. Reglas de negocio clave

1. **Una placa no puede tener dos órdenes activas** (estado distinto de `DELIVERED`/`CANCELLED`) en el mismo tenant.
2. **No se entrega una moto** (`DELIVERED`) sin pago completo, salvo que quede registrada como cuenta por cobrar por un usuario con permiso.
3. **Sin turno de caja abierto no se puede cobrar.**
4. **Consumo de inventario**: al marcar un ítem como `DONE`, se descuentan los insumos según la receta (con el rango de cilindraje de la moto). Si el ítem se cancela después de `DONE`, el consumo **no se revierte** automáticamente (el insumo ya se gastó); se ajusta manualmente si aplica.
5. **El stock puede quedar negativo** (no se bloquea la operación), pero genera una alerta. *Configurable.*
6. **Comisiones** se generan al registrar el pago de la orden; si el pago se anula, las comisiones `PENDING` asociadas se anulan.
7. **Cálculo de parqueo** (orden de aplicación): mensualidad vigente → cortesía por lavado → tiempo de gracia → tarifa (fracción redondeada hacia arriba) → tarifa nocturna → tope diario.
8. **Descuentos** sobre el límite del rol requieren la autorización de un usuario con permiso (registrar quién autorizó).
9. **Movimientos de dinero e inventario son inmutables**: corregir = anular con un movimiento inverso + motivo + auditoría.
10. **Consecutivos** por sede, sin huecos, generados transaccionalmente.
11. Cierre de caja con diferencia mayor que un umbral configurable → alerta al administrador.
12. Todas las consultas del backend filtran por `tenant_id` del usuario autenticado y por las sedes a las que tiene acceso.

---

## 7. Máquinas de estado

### Orden de trabajo
```
RECEIVED ──► QUEUED ──► IN_PROGRESS ──► READY ──► DELIVERED
    │           │            │            │
    └───────────┴────────────┴────────────┴──► CANCELLED (con motivo y permiso)
```
- `RECEIVED → QUEUED`: automático al confirmar el check-in con servicios.
- Solo parqueo: `RECEIVED → READY` directo (lista para retirar).
- `IN_PROGRESS`: cuando inicia el primer ítem.
- `READY`: cuando todos los ítems están en `DONE` o `CANCELLED`.
- `DELIVERED`: requiere pago completo (o cuenta por cobrar autorizada) y la devolución de pertenencias confirmada.

### Cita
`SCHEDULED → CONFIRMED → CHECKED_IN` | `NO_SHOW` | `CANCELLED`

### Turno de caja
`OPEN → CLOSED` (reabrir solo un administrador, con auditoría)

---

## 8. Roles y permisos

Roles predefinidos (el tenant puede crear roles personalizados combinando permisos):

| Permiso | Admin | Supervisor | Cajero/Recepción | Lavador |
|---|:-:|:-:|:-:|:-:|
| Configurar empresa, sedes, tarifas, catálogo | ✅ | ❌ | ❌ | ❌ |
| Gestionar usuarios y roles | ✅ | ❌ | ❌ | ❌ |
| Check-in / check-out de motos | ✅ | ✅ | ✅ | ❌ |
| Ver tablero de órdenes | ✅ | ✅ | ✅ | ✅ (solo las suyas) |
| Iniciar/finalizar servicios asignados | ✅ | ✅ | ✅ | ✅ |
| Reasignar lavador | ✅ | ✅ | ✅ | ❌ |
| Cancelar orden / ítem iniciado | ✅ | ✅ | ❌ | ❌ |
| Abrir/cerrar su turno de caja | ✅ | ✅ | ✅ | ❌ |
| Cobrar | ✅ | ✅ | ✅ | ❌ |
| Descuento dentro del límite del rol | ✅ | ✅ | ✅ (bajo) | ❌ |
| Autorizar descuentos mayores | ✅ | ✅ | ❌ | ❌ |
| Anular pagos | ✅ | ✅ | ❌ | ❌ |
| Registrar gastos de caja | ✅ | ✅ | ✅ | ❌ |
| Gastos administrativos | ✅ | ❌ | ❌ | ❌ |
| Compras / entradas de inventario | ✅ | ✅ | ❌ | ❌ |
| Ajustes y conteos de inventario | ✅ | ✅ | ❌ | ❌ |
| Gestionar citas | ✅ | ✅ | ✅ | ❌ |
| Liquidar comisiones | ✅ | ❌ | ❌ | ❌ |
| Ver sus propias comisiones | — | — | — | ✅ |
| Reportes operativos | ✅ | ✅ | Parcial (su turno) | ❌ |
| Reportes financieros | ✅ | ❌ | ❌ | ❌ |
| Ver bitácora de auditoría | ✅ | ❌ | ❌ | ❌ |

Implementación: permisos como códigos (`orders.checkin`, `payments.void`, `inventory.adjust`, …) verificados con un guard/decorador en NestJS (`@RequirePermission('payments.void')`) y reflejados en la UI.

---

## 9. Reportes

**Operativos**
- Motos atendidas por día/semana/mes, por tipo de servicio y por sede.
- Tiempos promedio: espera, ejecución real frente a estimada, estadía en parqueo.
- Productividad por lavador (servicios, horas, ingresos generados).
- Ocupación del parqueadero por hora (horas pico).
- Citas: cumplidas, no-show, canceladas.

**Financieros**
- Ventas por periodo, por medio de pago, por servicio y por sede.
- Cierres de caja con diferencias (histórico por cajero).
- Gastos por categoría.
- Comisiones por empleado y periodo.
- Estado de resultados simplificado: ingresos − costo de insumos consumidos − gastos − comisiones = utilidad.
- Margen por servicio (precio − costo de la receta − comisión).
- Cuentas por cobrar y antigüedad.

**Inventario**
- Stock actual y valorizado por sede.
- Kardex por producto.
- Consumo teórico (por recetas) frente a consumo real (por conteos): detecta desperdicio o robo.
- Productos bajo mínimo.

**Clientes**
- Clientes frecuentes y ticket promedio.
- Clientes inactivos (sin visita en X días).
- Historial por placa.

**Exportación:** todos los reportes son exportables a Excel/CSV y PDF; con filtros por fecha, sede, empleado y servicio.

---

## 10. Pantallas principales (frontend)

1. Login / selección de sede.
2. **Dashboard** del día: ventas, motos en sede, ocupación, alertas.
3. **Recepción / check-in** rápido (búsqueda por placa, optimizado para celular).
4. **Tablero de órdenes** (kanban en tiempo real).
5. Detalle de orden (servicios, lavadores, fotos, pertenencias, cobro).
6. **Vista del lavador** (mis servicios: iniciar/finalizar, mis comisiones).
7. **Caja**: apertura, cobro, movimientos, cierre/arqueo.
8. Parqueadero: ocupación, tarifas, mensualidades.
9. Agenda (calendario por bahía).
10. Clientes y motos.
11. Catálogo de servicios, combos, precios y recetas.
12. Inventario: productos, compras, ajustes, conteos, proveedores.
13. Gastos.
14. Empleados y comisiones / liquidaciones.
15. Reportes.
16. Configuración: empresa, sedes, usuarios, roles, medios de pago y parámetros.
17. Bitácora de auditoría.

**Principios de UX:** mobile-first, pocos toques para el check-in (meta: menos de 30 segundos), botones grandes, buen contraste para uso en exteriores, impresión térmica de tickets.

---

## 11. API (borrador de recursos REST)

```
/auth/me
/branches
/customers            /motorcycles?plate=
/work-orders          POST /work-orders/check-in
                      POST /work-orders/:id/items
                      PATCH /work-order-items/:id/start | /finish
                      POST /work-orders/:id/ready | /deliver | /cancel
/parking/rates        /parking/sessions   GET /parking/quote?workOrderId=
/monthly-plans
/appointments         GET /appointments/availability?branchId=&date=
/services             /packages   /service-prices   /service-recipes
/employees            /commissions   /commission-settlements
/products             /inventory/movements   /purchases   /stock-counts   /suppliers
/cash-shifts          POST /cash-shifts/open | /:id/close
/payments             POST /payments/:id/void
/cash-movements       /expenses   /receivables
/reports/{sales|cash|inventory|commissions|operations|customers}
/audit-logs
/settings
```

- Documentación con Swagger (OpenAPI) generada desde NestJS.
- Tipos compartidos entre frontend y backend en `packages/shared`.
- Paginación por cursor; filtros por fecha/sede.

---

## 12. Requisitos no funcionales

- **Seguridad:** JWT, permisos por endpoint, RLS en Supabase como segunda barrera, secretos en variables de entorno, rate limiting.
- **Auditoría:** interceptor de NestJS que registra las acciones de escritura sensibles.
- **Transacciones:** cobro, consumo de inventario, comisiones y consecutivos dentro de transacciones de base de datos.
- **Rendimiento:** check-in y cobro con respuesta menor a 1 s; índices en `plate`, `status`, `branch_id` y fechas.
- **Tolerancia a mala conexión:** PWA con reintentos; *offline* completo queda para una fase futura.
- **Respaldo:** backups automáticos de Supabase y exportación periódica.
- **Pruebas:** unitarias para las reglas de negocio (cálculo de parqueo, comisiones, arqueo, inventario); e2e para los flujos check-in → servicio → cobro → entrega.
- **Calidad:** ESLint + Prettier, commits convencionales y CI en GitHub Actions (lint, test, build).

---

## 13. Plan de fases

### Fase 0 — Fundaciones
- Monorepo, configuración de Next.js + NestJS + Supabase, ORM y migraciones.
- Auth, tenants, sedes, usuarios, roles/permisos y auditoría.
- CI básico y deploy de entornos dev/prod.
- **Entregable:** login funcionando con roles y un esqueleto de navegación.

### Fase 1 — MVP operativo (lo mínimo para operar un día real)
- Clientes y motos (búsqueda por placa).
- Catálogo de servicios con precios por cilindraje.
- Check-in, órdenes, tablero en vivo, asignación de lavador e inicio/fin.
- Parqueadero por tiempo (tarifas, gracia, cortesía, tope).
- Caja: apertura, cobro con pagos mixtos, descuentos con límite y cierre con arqueo.
- Ticket imprimible.
- Reporte diario de ventas y de caja.

### Fase 2 — Control
- Inventario completo (productos, recetas, consumo automático, compras, ajustes, conteos).
- Gastos.
- Comisiones y liquidaciones, propinas y adelantos.
- Mensualidades de parqueo.
- Cuentas por cobrar.
- Reportes financieros, de inventario y de productividad.

### Fase 3 — Crecimiento
- Agendamiento (interno y link público).
- WhatsApp: moto lista, recordatorios y vencimientos.
- Fidelización (sellos/puntos) y clientes inactivos.
- Venta de mostrador.
- Dashboard avanzado.

### Fase 4 — SaaS y legal
- Facturación electrónica DIAN vía proveedor.
- Onboarding de nuevos tenants, planes y suscripción.
- Multi-sede avanzada (traslados, reportes consolidados).

---

## 14. Estructura de repositorio sugerida

```
motospa/
├── apps/
│   ├── web/                 # Vite + React (SPA)
│   └── api/                 # NestJS
│       └── src/modules/
│           ├── auth/  tenants/  branches/  users/  roles/  audit/
│           ├── customers/  motorcycles/
│           ├── catalog/            # services, packages, prices, recipes
│           ├── work-orders/
│           ├── parking/
│           ├── appointments/
│           ├── staff/              # employees, commissions
│           ├── inventory/
│           ├── cash/               # shifts, payments, movements, receivables
│           ├── expenses/
│           ├── reports/
│           └── notifications/
├── packages/
│   └── shared/              # tipos, DTOs, enums, constantes de permisos
├── supabase/                # migraciones / políticas RLS / seeds
├── SPEC.md                  # este documento
└── CLAUDE.md                # reglas cortas para el agente (generar en Fase 0)
```

---

## 15. Registro de decisiones

| # | Fecha | Decisión | Motivo |
|---|---|---|---|
| 1 | 2026-10-19 | PostgreSQL (Supabase) en lugar de MongoDB | Transacciones e integridad para dinero e inventario |
| 2 | 2026-10-19 | Multi-tenant desde el inicio (`tenant_id` + `branch_id`) | Permitir SaaS a futuro sin migración |
| 3 | 2026-10-19 | Dinero en enteros COP | Evitar errores de redondeo |
| 4 | 2026-10-19 | Movimientos inmutables, corrección por anulación | Trazabilidad y auditoría |
| 5 | 2026-10-19 | Los lavadores tienen usuario propio (login) | Saber quién ejecutó cada servicio y calcular comisiones |
| 6 | 2026-10-19 | Operación inicial con una sola sede; el modelo de datos se mantiene multi-sede | Simplificar la UI sin impedir crecer después |
| 7 | 2026-10-19 | Se trabaja con datos de prueba (mockup) para servicios, precios, tarifas y nombre comercial | El negocio aún está en negociación |
| 8 | 2026-10-19 | Supabase y Vercel se crean desde cero en la Fase 0 | No existen proyectos previos |
| 9 | 2026-10-19 | Tablero "en vivo" por consulta periódica (polling cada 10 s) en lugar de Supabase Realtime | Una sede y pocos usuarios; evita exponer la DB al frontend y la complejidad de RLS en Realtime. Migrable después |
| 10 | 2026-10-19 | Cada lavador usa su propio celular con login normal | Todos cuentan con celular propio |
| 11 | 2026-10-19 | ORM: Drizzle; backend NestJS separado | Drizzle facilita aplicar RLS por transacción (`set_config` de claims + rol sin privilegios) |
| 12 | 2026-10-19 | Con una sola sede, el Admin ve y gestiona todo el tenant | Simplificación inicial |
| 13 | 2026-10-19 | Login con usuario + contraseña para todos; Supabase Auth con correo interno sintético (`usuario@motospa.local`) | Los empleados no necesitan correo real ni SMS |
| 14 | 2026-10-19 | Supabase en la nube (sin entorno local). Claude entrega los scripts SQL en `supabase/migrations/` y el usuario los ejecuta en el SQL Editor | Preferencia del usuario |
| 15 | 2026-10-19 | Un solo repo GitHub (monorepo) con front (`apps/web`) y back (`apps/api`) separados | Orden y tipos compartidos |
| 16 | 2026-10-19 | Deploy de front y back en Vercel (dos proyectos desde el mismo repo). La API usa el pooler de Supabase en modo transacción | Simplificar la infraestructura. Nota: el plan Hobby de Vercel es solo uso no comercial; producción requiere plan Pro |
| 17 | 2026-10-19 | El nombre de usuario es único en todo el sistema (no solo por tenant) y el `tenant_id` viaja en `app_metadata` del usuario de Supabase Auth | El correo sintético es global; `app_metadata` no es editable por el usuario |
| 19 | 2026-10-19 | Dirección visual **"Espuma"**: blanco + azul agua (`#0a7fc2` → `#12b5c9`), tarjetas suaves y redondeadas, Bricolage Grotesque (títulos) + Figtree (texto), solo tema claro. La placa de moto es el ancla visual, en amarillo suave "Mantequilla" (`#fbe7a1`) en lugar del amarillo real | Elegida por el usuario entre 3 propuestas (Pista, Garaje, Espuma); el amarillo real se percibía chillón |
| 20 | 2026-10-19 | Frontend migrado de Next.js 16 a **Vite + React 19 (SPA)** con React Router 7 y TanStack Query 5, siguiendo la estructura de GenericSoft (`src/api`, `src/app`, `src/features`). La sesión de Supabase vive en el navegador; el backend sigue verificando cada petición | App interna detrás de login: no necesita SSR ni SEO; las reglas de Cache Components de Next 16 añadían complejidad; alineación con los demás proyectos del usuario. Respaldo de la versión Next en el commit `09366cf` |
| 21 | 2026-10-19 | **Fase 1 implementada con datos de prueba** (decisiones D-1 a D-15 en `docs/FASE-1.md`): rangos de cc ≤150 / 151–400 / >400; tarifa de parqueo por fracción de 30 min ($1.000, nocturna 19–06 $1.500, gracia 10 min, tope $12.000/24 h, cortesía de lavado +30 min); límites de descuento Cajero 10 %/$5.000, Supervisor 30 %, Admin 100 % con autorización por PIN; `employees` mínima desde la Fase 1; entrega solo con pago completo; fotos de check-in fuera de la Fase 1 | El usuario autorizó avanzar con las decisiones recomendadas; todos los valores son configurables en la base de datos |
| 22 | 2026-10-19 | Pruebas de base de datos con **PGlite** (Postgres embebido) aplicando las migraciones reales: RLS, reglas SQL y flujo completo con los servicios de NestJS | Verificar esquema y reglas sin tocar el Supabase del usuario |
| 18 | 2026-10-19 | Los SQL de `supabase/migrations/` son la fuente de verdad del esquema; `apps/api/src/db/schema.ts` (Drizzle) es solo un espejo para consultas | El usuario ejecuta los scripts manualmente (decisión 14) |

### Preguntas abiertas (resolver antes o durante la Fase 0/1)
- [x] ¿Prisma o Drizzle? → Drizzle (decisión 11)
- [x] ¿Backend NestJS separado o API dentro de Next.js? → NestJS separado (decisión 11)
- [ ] ¿Rangos de cilindraje exactos y lista inicial de servicios y precios? → provisional D-1/D-2 (datos de prueba)
- [ ] ¿Tarifas de parqueo reales (fracción, gracia, tope, nocturna)? → provisional D-3/D-4 (datos de prueba)
- [ ] ¿Regla de comisión: porcentaje o valor fijo, y sobre el precio lleno o sobre el cobrado?
- [ ] ¿Las fotos en el check-in son obligatorias? → provisional D-10: opcionales, fuera de la Fase 1
- [ ] ¿Impresora térmica disponible (modelo, 58 u 80 mm)?
- [ ] ¿Nombre comercial definitivo del producto?

---

## 16. Primer prompt sugerido para Claude en VS Code

```
Lee SPEC.md completo. Vamos a iniciar la Fase 0.
1. Propón la estructura del monorepo y los comandos de inicialización.
2. Resuelve conmigo las preguntas abiertas de la sección 15 que afecten la Fase 0.
3. Diseña el esquema inicial (tenants, branches, users, roles, permissions,
   user_branch_roles, audit_logs) y las políticas RLS.
4. Genera un CLAUDE.md corto con las convenciones de la sección 2 y las reglas de la sección 0.
No escribas código hasta que apruebe el plan.
```
