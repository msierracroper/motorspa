-- =====================================================================
-- MotoSpa — Fase 1: operación (docs/FASE-1.md)
-- Clientes y motos, catálogo, personal mínimo, órdenes, parqueadero y caja.
-- Ejecutar DESPUÉS de 20261019192304_foundations.sql.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Clientes y motos (SPEC §4.1)
-- ---------------------------------------------------------------------
create table public.customers (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id),
  full_name         text not null,
  phone             text,
  document_type     text check (document_type in ('CC', 'CE', 'NIT', 'PAS', 'TI')),
  document_number   text,
  email             text,
  notes             text,
  marketing_opt_in  boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references public.users (id),
  deleted_at        timestamptz
);
create index customers_tenant_phone_idx on public.customers (tenant_id, phone);
create index customers_tenant_name_idx on public.customers (tenant_id, lower(full_name));

create table public.motorcycles (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id),
  plate       text not null check (plate ~ '^[A-Z0-9]{4,8}$'),
  brand       text,
  model       text,
  cc          integer check (cc is null or cc between 49 and 3000),
  color       text,
  year        integer check (year is null or year between 1950 and 2100),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.users (id),
  deleted_at  timestamptz,
  unique (tenant_id, plate)
);

create table public.customer_motorcycles (
  tenant_id      uuid not null references public.tenants (id),
  customer_id    uuid not null references public.customers (id),
  motorcycle_id  uuid not null references public.motorcycles (id),
  relation       text not null default 'OWNER' check (relation in ('OWNER', 'DRIVER', 'OTHER')),
  created_at     timestamptz not null default now(),
  primary key (customer_id, motorcycle_id)
);
create index customer_motorcycles_moto_idx on public.customer_motorcycles (motorcycle_id);

-- ---------------------------------------------------------------------
-- Catálogo (SPEC §4.5)
-- ---------------------------------------------------------------------
create table public.service_categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id),
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (tenant_id, name)
);

create table public.services (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id),
  category_id        uuid references public.service_categories (id),
  name               text not null,
  description        text,
  estimated_minutes  integer not null default 30 check (estimated_minutes > 0),
  -- Comisión (se liquida en Fase 2): PERCENT = porcentaje entero, FIXED = pesos.
  commission_type    text not null default 'PERCENT' check (commission_type in ('PERCENT', 'FIXED')),
  commission_value   integer not null default 0 check (commission_value >= 0),
  active             boolean not null default true,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references public.users (id),
  deleted_at         timestamptz
);
create index services_tenant_idx on public.services (tenant_id) where deleted_at is null;

-- Precio por rango de cilindraje; ambos límites nulos = precio único. branch_id nulo = todas las sedes.
create table public.service_prices (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id),
  service_id  uuid not null references public.services (id),
  branch_id   uuid references public.branches (id),
  cc_min      integer,
  cc_max      integer,
  price       integer not null check (price >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (cc_min is null or cc_max is null or cc_min <= cc_max)
);
create index service_prices_service_idx on public.service_prices (service_id);

-- ---------------------------------------------------------------------
-- Personal mínimo (D-9). Comisiones y liquidaciones en Fase 2.
-- ---------------------------------------------------------------------
create table public.employees (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants (id),
  user_id                  uuid unique references public.users (id),
  full_name                text not null,
  document                 text,
  phone                    text,
  active                   boolean not null default true,
  default_commission_rule  jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid references public.users (id),
  deleted_at               timestamptz
);
create index employees_tenant_idx on public.employees (tenant_id);

-- ---------------------------------------------------------------------
-- Consecutivos sin huecos (SPEC regla 10, D-14)
-- ---------------------------------------------------------------------
create table public.sequences (
  tenant_id   uuid not null references public.tenants (id),
  branch_id   uuid not null references public.branches (id),
  type        text not null,
  next_value  bigint not null default 1,
  primary key (branch_id, type)
);

-- Devuelve el siguiente número. Corre como el invocador (app_api, con RLS) y dentro
-- de su transacción: si la transacción se revierte, el número no se consume.
create or replace function app.next_sequence(p_branch_id uuid, p_type text) returns bigint
language sql
set search_path = ''
as $$
  insert into public.sequences (tenant_id, branch_id, type, next_value)
  values (app.current_tenant_id(), p_branch_id, p_type, 2)
  on conflict (branch_id, type)
    do update set next_value = public.sequences.next_value + 1
  returning next_value - 1
$$;
grant execute on function app.next_sequence(uuid, text) to app_api;

-- ---------------------------------------------------------------------
-- Parqueadero (SPEC §4.4)
-- ---------------------------------------------------------------------
create table public.parking_spots (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id),
  branch_id   uuid not null references public.branches (id),
  code        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (branch_id, code)
);

create table public.parking_rates (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id),
  branch_id         uuid not null references public.branches (id),
  name              text not null,
  mode              text not null check (mode in ('MINUTE', 'FRACTION', 'HOUR', 'DAY')),
  fraction_minutes  integer check (fraction_minutes is null or fraction_minutes > 0),
  price_per_unit    integer not null check (price_per_unit >= 0),
  grace_minutes     integer not null default 0 check (grace_minutes >= 0),
  daily_cap         integer check (daily_cap is null or daily_cap >= 0),
  night_start       time,
  night_end         time,
  night_price       integer check (night_price is null or night_price >= 0),
  -- Cortesía por lavado: minutos gratis después de que la moto queda lista (D-4).
  courtesy_minutes  integer not null default 0 check (courtesy_minutes >= 0),
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (mode <> 'FRACTION' or fraction_minutes is not null),
  check ((night_start is null) = (night_end is null) and (night_start is null) = (night_price is null))
);
-- Una sola tarifa activa por sede.
create unique index parking_rates_one_active on public.parking_rates (branch_id) where active;

-- ---------------------------------------------------------------------
-- Órdenes de trabajo (SPEC §4.2, §4.3, §7)
-- ---------------------------------------------------------------------
create table public.work_orders (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id),
  branch_id        uuid not null references public.branches (id),
  number           bigint not null,
  motorcycle_id    uuid not null references public.motorcycles (id),
  customer_id      uuid references public.customers (id),
  type             text not null check (type in ('WASH', 'PARKING', 'WASH_PARKING')),
  status           text not null default 'RECEIVED'
                   check (status in ('RECEIVED', 'QUEUED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED')),
  appointment_id   uuid,
  parking_spot_id  uuid references public.parking_spots (id),
  checked_in_at    timestamptz not null default now(),
  checked_in_by    uuid not null references public.users (id),
  ready_at         timestamptz,
  delivered_at     timestamptz,
  delivered_by     uuid references public.users (id),
  cancelled_at     timestamptz,
  cancelled_by     uuid references public.users (id),
  cancel_reason    text,
  mileage          integer check (mileage is null or mileage >= 0),
  fuel_level       text check (fuel_level in ('EMPTY', 'QUARTER', 'HALF', 'THREE_QUARTERS', 'FULL')),
  damage_notes     text,
  notes            text,
  paid_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.users (id),
  unique (branch_id, number),
  check (status <> 'CANCELLED' or cancel_reason is not null)
);
-- Regla 1: una placa no puede tener dos órdenes activas en el tenant.
create unique index work_orders_one_active_per_moto on public.work_orders (tenant_id, motorcycle_id)
  where status in ('RECEIVED', 'QUEUED', 'IN_PROGRESS', 'READY');
create index work_orders_branch_status_idx on public.work_orders (branch_id, status);
create index work_orders_checked_in_idx on public.work_orders (branch_id, checked_in_at desc);

create table public.work_order_items (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id),
  work_order_id      uuid not null references public.work_orders (id),
  service_id         uuid not null references public.services (id),
  description        text not null,             -- nombre del servicio al momento del ingreso
  estimated_minutes  integer not null,
  unit_price         integer not null check (unit_price >= 0),
  status             text not null default 'PENDING'
                     check (status in ('PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED')),
  started_at         timestamptz,
  started_by         uuid references public.users (id),
  finished_at        timestamptz,
  finished_by        uuid references public.users (id),
  cancelled_at       timestamptz,
  cancelled_by       uuid references public.users (id),
  cancel_reason      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid references public.users (id)
);
create index work_order_items_order_idx on public.work_order_items (work_order_id);

create table public.work_order_item_staff (
  tenant_id      uuid not null references public.tenants (id),
  item_id        uuid not null references public.work_order_items (id),
  employee_id    uuid not null references public.employees (id),
  share_percent  integer not null default 100 check (share_percent between 1 and 100),
  created_at     timestamptz not null default now(),
  primary key (item_id, employee_id)
);
create index work_order_item_staff_employee_idx on public.work_order_item_staff (employee_id);

create table public.work_order_belongings (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id),
  work_order_id  uuid not null references public.work_orders (id),
  item           text not null,
  quantity       integer not null default 1 check (quantity > 0),
  returned       boolean not null default false,
  returned_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index work_order_belongings_order_idx on public.work_order_belongings (work_order_id);

create table public.work_order_status_history (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id),
  work_order_id  uuid not null references public.work_orders (id),
  from_status    text,
  to_status      text not null,
  user_id        uuid references public.users (id),
  at             timestamptz not null default now()
);
create index work_order_status_history_order_idx on public.work_order_status_history (work_order_id);

create table public.parking_sessions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id),
  branch_id         uuid not null references public.branches (id),
  work_order_id     uuid not null unique references public.work_orders (id),
  spot_id           uuid references public.parking_spots (id),
  rate_id           uuid not null references public.parking_rates (id),
  entry_at          timestamptz not null default now(),
  exit_at           timestamptz,
  minutes           integer,
  courtesy_minutes  integer,
  amount            integer check (amount is null or amount >= 0),
  monthly_plan_id   uuid,                        -- Fase 2: mensualidades
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- Un cupo no puede estar ocupado por dos motos a la vez.
create unique index parking_sessions_spot_occupied on public.parking_sessions (spot_id)
  where exit_at is null and spot_id is not null;
create index parking_sessions_branch_open_idx on public.parking_sessions (branch_id) where exit_at is null;

-- ---------------------------------------------------------------------
-- Caja y cobros (SPEC §4.9)
-- ---------------------------------------------------------------------
create table public.cash_registers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id),
  branch_id   uuid not null references public.branches (id),
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (branch_id, name)
);

create table public.cash_shifts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id),
  branch_id       uuid not null references public.branches (id),
  register_id     uuid not null references public.cash_registers (id),
  status          text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  opened_by       uuid not null references public.users (id),
  opened_at       timestamptz not null default now(),
  opening_amount  integer not null check (opening_amount >= 0),
  closed_by       uuid references public.users (id),
  closed_at       timestamptz,
  expected        jsonb,     -- { payment_method_id: pesos }
  counted         jsonb,
  difference      integer,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (status = 'OPEN' or (closed_at is not null and closed_by is not null and counted is not null))
);
-- Solo un turno abierto por caja.
create unique index cash_shifts_one_open on public.cash_shifts (register_id) where status = 'OPEN';

create table public.payment_methods (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id),
  name        text not null,
  type        text not null check (type in ('CASH', 'DIGITAL', 'CARD', 'OTHER')),
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (tenant_id, name)
);

create table public.payments (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants (id),
  branch_id               uuid not null references public.branches (id),
  shift_id                uuid not null references public.cash_shifts (id),
  work_order_id           uuid references public.work_orders (id),
  number                  bigint not null,
  services_amount         integer not null check (services_amount >= 0),
  parking_amount          integer not null default 0 check (parking_amount >= 0),
  subtotal                integer not null check (subtotal >= 0),
  discount                integer not null default 0 check (discount >= 0 and discount <= subtotal),
  total                   integer not null check (total = subtotal - discount),
  discount_reason         text,
  discount_authorized_by  uuid references public.users (id),
  status                  text not null default 'PAID' check (status in ('PAID', 'VOIDED')),
  voided_at               timestamptz,
  voided_by               uuid references public.users (id),
  void_reason             text,
  created_at              timestamptz not null default now(),
  created_by              uuid not null references public.users (id),
  unique (branch_id, number),
  check (status = 'PAID' or (voided_at is not null and voided_by is not null and void_reason is not null))
);
-- Una orden tiene a lo sumo un pago vigente.
create unique index payments_one_paid_per_order on public.payments (work_order_id)
  where status = 'PAID' and work_order_id is not null;
create index payments_shift_idx on public.payments (shift_id);
create index payments_branch_created_idx on public.payments (branch_id, created_at desc);

create table public.payment_lines (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id),
  payment_id         uuid not null references public.payments (id),
  payment_method_id  uuid not null references public.payment_methods (id),
  amount             integer not null check (amount > 0),
  reference          text,
  created_at         timestamptz not null default now()
);
create index payment_lines_payment_idx on public.payment_lines (payment_id);

create table public.cash_movements (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id),
  shift_id        uuid not null references public.cash_shifts (id),
  type            text not null check (type in ('INCOME', 'EXPENSE')),
  category        text not null,
  amount          integer not null check (amount > 0),
  description     text not null,
  reference_type  text,
  reference_id    uuid,
  created_at      timestamptz not null default now(),
  created_by      uuid not null references public.users (id)
);
create index cash_movements_shift_idx on public.cash_movements (shift_id);

-- Límite de descuento por rol (D-7). max_amount nulo = sin tope en pesos.
create table public.discount_rules (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id),
  role_id      uuid not null unique references public.roles (id),
  max_percent  numeric(5, 2) not null check (max_percent between 0 and 100),
  max_amount   integer check (max_amount is null or max_amount >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Inmutabilidad de movimientos de dinero (SPEC regla 9)
-- ---------------------------------------------------------------------
create trigger payment_lines_immutable before update or delete on public.payment_lines
  for each row execute function app.forbid_mutation();
create trigger cash_movements_immutable before update or delete on public.cash_movements
  for each row execute function app.forbid_mutation();
create trigger work_order_status_history_immutable before update or delete on public.work_order_status_history
  for each row execute function app.forbid_mutation();

-- Un pago solo puede pasar de PAID a VOIDED (anulación con motivo); nada más cambia.
create or replace function app.guard_payment_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los pagos no se borran: se anulan';
  end if;
  if old.status <> 'PAID' or new.status <> 'VOIDED'
     or (to_jsonb(new) - array['status', 'voided_at', 'voided_by', 'void_reason'])
        <> (to_jsonb(old) - array['status', 'voided_at', 'voided_by', 'void_reason']) then
    raise exception 'Un pago solo se puede anular (PAID → VOIDED con motivo)';
  end if;
  return new;
end
$$;
create trigger payments_guard before update or delete on public.payments
  for each row execute function app.guard_payment_update();

-- updated_at automáticos
do $$
declare t text;
begin
  foreach t in array array[
    'customers', 'motorcycles', 'service_categories', 'services', 'service_prices', 'employees',
    'parking_rates', 'work_orders', 'work_order_items', 'parking_sessions', 'cash_shifts',
    'discount_rules'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function app.set_updated_at()',
      t || '_updated_at', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------
-- Privilegios y RLS por tenant (mismo modelo que foundations)
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select, insert, update on
  public.customers, public.motorcycles, public.service_categories, public.services,
  public.service_prices, public.employees, public.sequences, public.parking_spots,
  public.parking_rates, public.work_orders, public.work_order_items, public.work_order_belongings,
  public.parking_sessions, public.cash_registers, public.cash_shifts, public.payment_methods,
  public.payments, public.discount_rules
  to app_api;
grant select, insert, delete on public.customer_motorcycles, public.work_order_item_staff to app_api;
grant select, insert on public.work_order_status_history, public.payment_lines, public.cash_movements to app_api;

do $$
declare t text;
begin
  foreach t in array array[
    'customers', 'motorcycles', 'customer_motorcycles', 'service_categories', 'services',
    'service_prices', 'employees', 'sequences', 'parking_spots', 'parking_rates', 'work_orders',
    'work_order_items', 'work_order_item_staff', 'work_order_belongings', 'work_order_status_history',
    'parking_sessions', 'cash_registers', 'cash_shifts', 'payment_methods', 'payments',
    'payment_lines', 'cash_movements', 'discount_rules'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to app_api
         using (tenant_id = (select app.current_tenant_id()))
         with check (tenant_id = (select app.current_tenant_id()))',
      t || '_isolation', t);
  end loop;
end
$$;

commit;
