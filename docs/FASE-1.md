# Fase 1 — MVP operativo

> Plan de la Fase 1 (SPEC §13). Las decisiones marcadas **[D-n]** se tomaron con datos de prueba
> mientras el negocio negocia valores reales (SPEC decisión 7) y están registradas en SPEC §15.
> Todo valor de negocio (precios, tarifas, límites) es configurable en la base de datos; cambiar
> el valor real no requiere tocar código.

## Alcance

1. Clientes y motos con búsqueda por placa.
2. Catálogo de servicios con precios por rango de cilindraje.
3. Check-in, órdenes, tablero en vivo (polling 10 s), asignación de lavador, inicio/fin de ítems.
4. Parqueadero por tiempo: tarifas, gracia, cortesía por lavado, tarifa nocturna, tope diario.
5. Caja: apertura, cobro con pagos mixtos, descuentos con límite por rol y autorización, cierre con arqueo.
6. Ticket imprimible (80 mm) de ingreso y de pago.
7. Reporte diario de ventas y de caja.

**Fuera de la Fase 1** (llegan en la Fase 2): consumo de inventario, comisiones, propinas,
mensualidades, cuentas por cobrar, gastos. Las tablas y reglas de la Fase 1 dejan el espacio
listo (por ejemplo `parking_sessions.monthly_plan_id`).

## Decisiones con datos de prueba

| #    | Tema                        | Decisión recomendada                                                                                                                        |
| ---- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1  | Rangos de cilindraje        | `≤150 cc`, `151–400 cc`, `>400 cc` (`cc_min`/`cc_max` por precio; editable)                                                                 |
| D-2  | Servicios demo              | Lavado sencillo (25 min), Lavado + polichado (60), Desengrase de motor (30), Lubricación de cadena (10), Lavado de casco (15, precio único) |
| D-3  | Tarifa de parqueo demo      | Por fracción de 30 min a $1.000; gracia 10 min; nocturna 19:00–06:00 a $1.500 la fracción; tope $12.000 por cada 24 h                       |
| D-4  | Cortesía por lavado         | Parqueo gratis mientras la moto está en servicio y 30 min después de quedar lista (configurable por sede)                                   |
| D-5  | Gracia                      | Si la estadía cobrable total ≤ gracia, es gratis; si la supera, se cobra desde el inicio (práctica común en Colombia)                       |
| D-6  | Hora local                  | Colombia no tiene horario de verano: la franja nocturna se evalúa en UTC−5 fijo                                                             |
| D-7  | Límite de descuento por rol | Cajero 10 % y máx. $5.000; Supervisor 30 %; Administrador 100 %. Por encima: autoriza un usuario con `discounts.authorize` con su **PIN**   |
| D-8  | Medios de pago              | Efectivo, Nequi, Daviplata, Tarjeta débito/crédito, Transferencia                                                                           |
| D-9  | Lavadores en Fase 1         | Tabla `employees` mínima (vinculada a `users`), necesaria para asignar ítems; comisiones en Fase 2                                          |
| D-10 | Fotos de check-in           | Opcionales y fuera de la Fase 1 (requieren Storage); en Fase 1 se registran daños como texto                                                |
| D-11 | Entrega sin pago            | No permitida en Fase 1 (las cuentas por cobrar llegan en Fase 2)                                                                            |
| D-12 | Cupos de parqueo            | 20 cupos identificados `P01`–`P20`; asignar cupo es opcional en el check-in                                                                 |
| D-13 | Ticket                      | Página imprimible de 80 mm con código QR del número de orden (impresión desde el navegador)                                                 |
| D-14 | Consecutivos                | Tabla `sequences` por sede y tipo, incrementada con `UPDATE … RETURNING` dentro de la transacción (sin huecos)                              |
| D-15 | Tablero en vivo             | Polling cada 10 s con TanStack Query (`refetchInterval`), según decisión 9                                                                  |

## Reglas de negocio implementadas (SPEC §6) y dónde

| Regla                                | Implementación                                                                                       | Prueba            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------- |
| 1. Una placa sin dos órdenes activas | Índice único parcial en `work_orders` (`motorcycle_id` donde status activo)                          | PGlite            |
| 2. No entregar sin pago completo     | `WorkOrdersService.deliver` + validación de saldo                                                    | unitaria + PGlite |
| 3. Sin turno abierto no se cobra     | `PaymentsService.charge` exige turno `OPEN` del usuario                                              | unitaria          |
| 7. Cálculo de parqueo                | `packages/shared/src/parking.ts` (función pura, la usan API y UI)                                    | unitaria          |
| 8. Descuentos sobre el límite        | `packages/shared/src/discounts.ts` + PIN del autorizador                                             | unitaria          |
| 9. Movimientos inmutables            | Triggers `forbid_mutation` en `payments`, `payment_lines`, `cash_movements`; anular = nuevo registro | PGlite            |
| 10. Consecutivos sin huecos          | `sequences` + `UPDATE … RETURNING` en la misma transacción                                           | PGlite            |
| Máquina de estados de la orden (§7)  | `packages/shared/src/work-order-status.ts`                                                           | unitaria          |
| Arqueo (§4.9)                        | `packages/shared/src/cash.ts`                                                                        | unitaria          |

## Tablas nuevas (migración `fase1_operations`)

- **Clientes y motos:** `customers`, `motorcycles` (placa única por tenant), `customer_motorcycles`.
- **Catálogo:** `service_categories`, `services`, `service_prices` (rango de cc, sede opcional).
- **Personal:** `employees` (mínima, D-9).
- **Operación:** `sequences`, `work_orders`, `work_order_items`, `work_order_item_staff`,
  `work_order_belongings`, `work_order_status_history`.
- **Parqueadero:** `parking_spots`, `parking_rates`, `parking_sessions`.
- **Caja:** `cash_registers`, `cash_shifts`, `payment_methods`, `payments`, `payment_lines`,
  `cash_movements`, `discount_rules`.

Todas con `tenant_id`, RLS por tenant para `app_api`, y nada para `anon`/`authenticated`.

## Endpoints (NestJS)

```
GET    /motorcycles/search?plate=          GET /customers?q=        POST /customers
GET    /catalog/services                   (con precios por cc)
GET    /employees?active=true
POST   /work-orders/check-in               GET /work-orders/board   GET /work-orders/:id
PATCH  /work-order-items/:id/start | /finish
POST   /work-orders/:id/cancel | /deliver
GET    /parking/quote?workOrderId=         GET /parking/occupancy
GET    /cash-shifts/current                POST /cash-shifts/open   POST /cash-shifts/:id/close
GET    /payment-methods                    POST /payments           POST /payments/:id/void
GET    /reports/daily?date=
```

## Pantallas

Recepción (check-in en pocos toques), Órdenes (tablero por estado), Detalle de orden + cobro,
Mis servicios (lavador), Caja (apertura, movimientos, cierre/arqueo), Parqueadero (ocupación),
Clientes y motos (búsqueda e historial), Catálogo (consulta de servicios y precios),
Reporte del día, Ticket imprimible.
