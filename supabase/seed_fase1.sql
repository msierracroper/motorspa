-- =====================================================================
-- MotoSpa — Datos de prueba de la Fase 1 (decisiones D-1 a D-12, docs/FASE-1.md)
-- Ejecutar DESPUÉS de la migración 20261019220631_fase1_operations.sql y de seed.sql.
-- Idempotente: se puede correr varias veces.
-- Los lavadores (employees) y los PIN se crean con `pnpm --filter @motospa/api seed:users`.
-- =====================================================================

begin;

-- Medios de pago (D-8)
insert into public.payment_methods (id, tenant_id, name, type, sort_order) values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000001', 'Efectivo',       'CASH',    1),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000001', 'Nequi',          'DIGITAL', 2),
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000001', 'Daviplata',      'DIGITAL', 3),
  ('00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000001', 'Tarjeta',        'CARD',    4),
  ('00000000-0000-4000-8000-000000000505', '00000000-0000-4000-8000-000000000001', 'Transferencia',  'DIGITAL', 5)
on conflict (id) do nothing;

-- Caja de la sede principal
insert into public.cash_registers (id, tenant_id, branch_id, name) values
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000101', 'Caja principal')
on conflict (id) do nothing;

-- Límites de descuento por rol (D-7)
insert into public.discount_rules (tenant_id, role_id, max_percent, max_amount) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', 100, null),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000202', 30,  null),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000203', 10,  5000),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000204', 0,   0)
on conflict (role_id) do nothing;

-- Tarifa de parqueo (D-3, D-4)
insert into public.parking_rates
  (id, tenant_id, branch_id, name, mode, fraction_minutes, price_per_unit, grace_minutes,
   daily_cap, night_start, night_end, night_price, courtesy_minutes)
values
  ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000101', 'Tarifa general', 'FRACTION', 30, 1000, 10,
   12000, '19:00', '06:00', 1500, 30)
on conflict (id) do nothing;

-- Cupos P01–P20 (D-12)
insert into public.parking_spots (tenant_id, branch_id, code)
select '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101',
       'P' || lpad(n::text, 2, '0')
from generate_series(1, 20) as n
on conflict (branch_id, code) do nothing;

-- Catálogo (D-1, D-2): categorías, servicios y precios por cilindraje
insert into public.service_categories (id, tenant_id, name, sort_order) values
  ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000001', 'Lavado',        1),
  ('00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000001', 'Detallado',     2),
  ('00000000-0000-4000-8000-000000000803', '00000000-0000-4000-8000-000000000001', 'Mantenimiento', 3)
on conflict (id) do nothing;

insert into public.services
  (id, tenant_id, category_id, name, description, estimated_minutes, commission_type, commission_value, sort_order)
values
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000801',
   'Lavado sencillo', 'Lavado exterior con espuma activa y secado', 25, 'PERCENT', 30, 1),
  ('00000000-0000-4000-8000-000000000902', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000802',
   'Lavado + polichado', 'Lavado completo con polichado de pintura y cromados', 60, 'PERCENT', 30, 2),
  ('00000000-0000-4000-8000-000000000903', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000803',
   'Desengrase de motor', 'Desengrase de motor y rines', 30, 'PERCENT', 30, 3),
  ('00000000-0000-4000-8000-000000000904', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000803',
   'Lubricación de cadena', 'Limpieza y lubricación de cadena', 10, 'PERCENT', 30, 4),
  ('00000000-0000-4000-8000-000000000905', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000801',
   'Lavado de casco', 'Lavado interior y exterior del casco', 15, 'PERCENT', 30, 5)
on conflict (id) do nothing;

insert into public.service_prices (tenant_id, service_id, cc_min, cc_max, price)
select '00000000-0000-4000-8000-000000000001', s.service_id::uuid, s.cc_min, s.cc_max, s.price
from (values
  ('00000000-0000-4000-8000-000000000901', null::int, 150,       12000),
  ('00000000-0000-4000-8000-000000000901', 151,       400,       15000),
  ('00000000-0000-4000-8000-000000000901', 401,       null::int, 20000),
  ('00000000-0000-4000-8000-000000000902', null,      150,       35000),
  ('00000000-0000-4000-8000-000000000902', 151,       400,       45000),
  ('00000000-0000-4000-8000-000000000902', 401,       null,      60000),
  ('00000000-0000-4000-8000-000000000903', null,      150,       15000),
  ('00000000-0000-4000-8000-000000000903', 151,       400,       18000),
  ('00000000-0000-4000-8000-000000000903', 401,       null,      25000),
  ('00000000-0000-4000-8000-000000000904', null,      150,        5000),
  ('00000000-0000-4000-8000-000000000904', 151,       400,        6000),
  ('00000000-0000-4000-8000-000000000904', 401,       null,       8000),
  ('00000000-0000-4000-8000-000000000905', null,      null,       8000)
) as s(service_id, cc_min, cc_max, price)
where not exists (
  select 1 from public.service_prices p
  where p.service_id = s.service_id::uuid
    and p.cc_min is not distinct from s.cc_min
    and p.cc_max is not distinct from s.cc_max
);

-- Clientes y motos de ejemplo
insert into public.customers (id, tenant_id, full_name, phone) values
  ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000000001', 'Andrés Pérez',   '3104567788'),
  ('00000000-0000-4000-8000-000000001002', '00000000-0000-4000-8000-000000000001', 'Laura Gómez',    '3001234567'),
  ('00000000-0000-4000-8000-000000001003', '00000000-0000-4000-8000-000000000001', 'Camilo Rojas',   '3157654321')
on conflict (id) do nothing;

insert into public.motorcycles (id, tenant_id, plate, brand, model, cc, color) values
  ('00000000-0000-4000-8000-000000001101', '00000000-0000-4000-8000-000000000001', 'KXT45F', 'Yamaha', 'NMAX',     155, 'Gris'),
  ('00000000-0000-4000-8000-000000001102', '00000000-0000-4000-8000-000000000001', 'BRM08E', 'Honda',  'CB 125F',  125, 'Rojo'),
  ('00000000-0000-4000-8000-000000001103', '00000000-0000-4000-8000-000000000001', 'QWZ93A', 'KTM',    'Duke 390', 373, 'Naranja'),
  ('00000000-0000-4000-8000-000000001104', '00000000-0000-4000-8000-000000000001', 'TYU61B', 'BMW',    'R 1250 GS',1254,'Blanco')
on conflict (id) do nothing;

insert into public.customer_motorcycles (tenant_id, customer_id, motorcycle_id, relation) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000001101', 'OWNER'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001002', '00000000-0000-4000-8000-000000001102', 'OWNER'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001003', '00000000-0000-4000-8000-000000001103', 'OWNER'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000001003', '00000000-0000-4000-8000-000000001104', 'OWNER')
on conflict do nothing;

commit;
