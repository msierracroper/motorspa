-- =====================================================================
-- MotoSpa — Datos iniciales (mockup, decisión 7)
-- Ejecutar DESPUÉS de la migración 20261019192304_foundations.sql.
-- Los usuarios se crean aparte con `pnpm --filter @motospa/api seed:users`,
-- porque requieren la API de administración de Supabase Auth.
--
-- Los códigos de permisos deben coincidir con packages/shared/src/permissions.ts
-- =====================================================================

begin;

insert into public.permissions (code, description) values
  ('settings.manage',              'Configurar empresa, sedes, tarifas y catálogo'),
  ('users.manage',                 'Gestionar usuarios y roles'),
  ('orders.checkin',               'Check-in / check-out de motos'),
  ('orders.view_all',              'Ver tablero de órdenes (todas)'),
  ('orders.view_own',              'Ver tablero de órdenes (solo las propias)'),
  ('orders.execute',               'Iniciar/finalizar servicios asignados'),
  ('orders.reassign',              'Reasignar lavador'),
  ('orders.cancel',                'Cancelar orden / ítem iniciado'),
  ('cash.shift',                   'Abrir/cerrar su turno de caja'),
  ('payments.charge',              'Cobrar'),
  ('discounts.apply',              'Descuento dentro del límite del rol'),
  ('discounts.authorize',          'Autorizar descuentos mayores'),
  ('payments.void',                'Anular pagos'),
  ('expenses.cash',                'Registrar gastos de caja'),
  ('expenses.admin',               'Gastos administrativos'),
  ('inventory.purchase',           'Compras / entradas de inventario'),
  ('inventory.adjust',             'Ajustes y conteos de inventario'),
  ('appointments.manage',          'Gestionar citas'),
  ('commissions.settle',           'Liquidar comisiones'),
  ('commissions.view_own',         'Ver sus propias comisiones'),
  ('reports.operations',           'Reportes operativos'),
  ('reports.operations_own_shift', 'Reportes operativos (solo su turno)'),
  ('reports.finance',              'Reportes financieros'),
  ('audit.view',                   'Ver bitácora de auditoría')
on conflict (code) do update set description = excluded.description;

-- Empresa y sede demo (UUIDs fijos para referenciarlos en el seed de usuarios)
insert into public.tenants (id, name, nit, plan)
values ('00000000-0000-4000-8000-000000000001', 'MotoSpa Demo', '900000000-0', 'basic')
on conflict (id) do nothing;

insert into public.branches (id, tenant_id, name, address, phone, opening_hours)
values (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000001',
  'Sede Principal',
  'Calle 1 # 2-3',
  '3000000000',
  '{"mon":["07:00","19:00"],"tue":["07:00","19:00"],"wed":["07:00","19:00"],"thu":["07:00","19:00"],"fri":["07:00","19:00"],"sat":["07:00","17:00"],"sun":null}'
)
on conflict (id) do nothing;

-- Roles del sistema
insert into public.roles (id, tenant_id, name, is_system) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', 'Administrador',    true),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000001', 'Supervisor',       true),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000001', 'Cajero/Recepción', true),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000001', 'Lavador',          true)
on conflict (id) do nothing;

-- Permisos por rol (SPEC sección 8)
insert into public.role_permissions (tenant_id, role_id, permission_code)
select '00000000-0000-4000-8000-000000000001', r.role_id, p.code
from (values
  -- Administrador: todo excepto los permisos "solo lo propio"
  ('00000000-0000-4000-8000-000000000201'::uuid, array(
    select code from public.permissions
    where code not in ('orders.view_own', 'commissions.view_own', 'reports.operations_own_shift')
  )),
  ('00000000-0000-4000-8000-000000000202'::uuid, array[
    'orders.checkin', 'orders.view_all', 'orders.execute', 'orders.reassign', 'orders.cancel',
    'cash.shift', 'payments.charge', 'discounts.apply', 'discounts.authorize', 'payments.void',
    'expenses.cash', 'inventory.purchase', 'inventory.adjust', 'appointments.manage',
    'reports.operations'
  ]),
  ('00000000-0000-4000-8000-000000000203'::uuid, array[
    'orders.checkin', 'orders.view_all', 'orders.execute', 'orders.reassign',
    'cash.shift', 'payments.charge', 'discounts.apply', 'expenses.cash',
    'appointments.manage', 'reports.operations_own_shift'
  ]),
  ('00000000-0000-4000-8000-000000000204'::uuid, array[
    'orders.view_own', 'orders.execute', 'commissions.view_own'
  ])
) as r(role_id, codes)
cross join lateral unnest(r.codes) as p(code)
on conflict do nothing;

commit;
