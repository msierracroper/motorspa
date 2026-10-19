-- =====================================================================
-- MotoSpa — Fase 0: Fundaciones
-- Tablas: tenants, branches, users, roles, permissions, role_permissions,
--         user_branch_roles, audit_logs
-- Seguridad: rol `app_api` (usado por NestJS) + RLS por tenant.
--
-- Cómo funciona el aislamiento (decisión 11):
--   NestJS se conecta como `postgres` y, en cada petición, abre una
--   transacción y ejecuta:
--     set local role app_api;
--     select set_config('app.tenant_id', '<uuid>', true),
--            set_config('app.user_id',   '<uuid>', true);
--   Las políticas RLS filtran por `app.current_tenant_id()`.
--   `anon` y `authenticated` (Data API de Supabase) no tienen acceso.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Esquema privado para funciones auxiliares (no expuesto en la Data API)
-- ---------------------------------------------------------------------
create schema if not exists app;
revoke all on schema app from public, anon, authenticated;

-- Rol de la API: sin login propio, se asume con SET ROLE.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_api') then
    create role app_api nologin noinherit;
  end if;
end
$$;
grant app_api to postgres;
grant usage on schema public to app_api;
grant usage on schema app to app_api;

-- Tenant y usuario actuales (definidos por NestJS con set_config).
create or replace function app.current_tenant_id() returns uuid
language sql stable
set search_path = ''
as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

create or replace function app.current_user_id() returns uuid
language sql stable
set search_path = ''
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- Mantiene updated_at.
create or replace function app.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Bloquea UPDATE/DELETE en tablas inmutables (SPEC regla 9).
create or replace function app.forbid_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'La tabla % es inmutable: no se permite %', tg_table_name, tg_op;
end
$$;

grant execute on function app.current_tenant_id() to app_api;
grant execute on function app.current_user_id() to app_api;

-- ---------------------------------------------------------------------
-- Organización
-- ---------------------------------------------------------------------
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  nit         text,
  logo_url    text,
  settings    jsonb not null default '{}'::jsonb,
  plan        text not null default 'basic',
  status      text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.branches (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id),
  name           text not null,
  address        text,
  phone          text,
  opening_hours  jsonb not null default '{}'::jsonb,
  settings       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  deleted_at     timestamptz
);
create index branches_tenant_idx on public.branches (tenant_id);

-- ---------------------------------------------------------------------
-- Usuarios, roles y permisos
-- ---------------------------------------------------------------------
create table public.users (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id),
  auth_user_id  uuid not null unique,          -- auth.users.id
  username      text not null,
  full_name     text not null,
  phone         text,
  pin_hash      text,
  status        text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  deleted_at    timestamptz,
  constraint users_username_format check (username ~ '^[a-z0-9._-]{3,30}$')
);
-- El correo sintético es global (decisión 13), así que el usuario también.
create unique index users_username_uq on public.users (username);
create index users_tenant_idx on public.users (tenant_id);

alter table public.branches
  add constraint branches_created_by_fk foreign key (created_by) references public.users (id);
alter table public.users
  add constraint users_created_by_fk foreign key (created_by) references public.users (id);

create table public.permissions (
  code         text primary key,
  description  text not null
);

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id),
  name        text not null,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.users (id),
  deleted_at  timestamptz,
  unique (tenant_id, name)
);

create table public.role_permissions (
  tenant_id        uuid not null references public.tenants (id),
  role_id          uuid not null references public.roles (id) on delete cascade,
  permission_code  text not null references public.permissions (code),
  primary key (role_id, permission_code)
);
create index role_permissions_tenant_idx on public.role_permissions (tenant_id);

create table public.user_branch_roles (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id),
  user_id     uuid not null references public.users (id),
  branch_id   uuid not null references public.branches (id),
  role_id     uuid not null references public.roles (id),
  created_at  timestamptz not null default now(),
  created_by  uuid references public.users (id),
  unique (user_id, branch_id, role_id)
);
create index user_branch_roles_tenant_idx on public.user_branch_roles (tenant_id);
create index user_branch_roles_user_idx on public.user_branch_roles (user_id);

-- ---------------------------------------------------------------------
-- Auditoría (inmutable)
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id),
  user_id     uuid references public.users (id),
  branch_id   uuid references public.branches (id),
  entity      text not null,
  entity_id   uuid,
  action      text not null,
  before      jsonb,
  after       jsonb,
  reason      text,
  ip          inet,
  created_at  timestamptz not null default now()
);
create index audit_logs_tenant_created_idx on public.audit_logs (tenant_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function app.forbid_mutation();

-- updated_at automáticos
create trigger tenants_updated_at before update on public.tenants
  for each row execute function app.set_updated_at();
create trigger branches_updated_at before update on public.branches
  for each row execute function app.set_updated_at();
create trigger users_updated_at before update on public.users
  for each row execute function app.set_updated_at();
create trigger roles_updated_at before update on public.roles
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------
-- Privilegios: solo app_api; nada para la Data API pública.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select, insert, update on public.tenants, public.branches, public.users, public.roles
  to app_api;
grant select on public.permissions to app_api;
grant select, insert, delete on public.role_permissions, public.user_branch_roles to app_api;
grant select, insert on public.audit_logs to app_api;

-- ---------------------------------------------------------------------
-- RLS: activado en todas las tablas; políticas solo para app_api.
-- ---------------------------------------------------------------------
alter table public.tenants           enable row level security;
alter table public.branches          enable row level security;
alter table public.users             enable row level security;
alter table public.permissions       enable row level security;
alter table public.roles             enable row level security;
alter table public.role_permissions  enable row level security;
alter table public.user_branch_roles enable row level security;
alter table public.audit_logs        enable row level security;

create policy tenants_isolation on public.tenants
  for all to app_api
  using (id = (select app.current_tenant_id()))
  with check (id = (select app.current_tenant_id()));

create policy permissions_read on public.permissions
  for select to app_api
  using (true);

create policy branches_isolation on public.branches
  for all to app_api
  using (tenant_id = (select app.current_tenant_id()))
  with check (tenant_id = (select app.current_tenant_id()));

create policy users_isolation on public.users
  for all to app_api
  using (tenant_id = (select app.current_tenant_id()))
  with check (tenant_id = (select app.current_tenant_id()));

create policy roles_isolation on public.roles
  for all to app_api
  using (tenant_id = (select app.current_tenant_id()))
  with check (tenant_id = (select app.current_tenant_id()));

create policy role_permissions_isolation on public.role_permissions
  for all to app_api
  using (tenant_id = (select app.current_tenant_id()))
  with check (tenant_id = (select app.current_tenant_id()));

create policy user_branch_roles_isolation on public.user_branch_roles
  for all to app_api
  using (tenant_id = (select app.current_tenant_id()))
  with check (tenant_id = (select app.current_tenant_id()));

create policy audit_logs_read on public.audit_logs
  for select to app_api
  using (tenant_id = (select app.current_tenant_id()));

create policy audit_logs_insert on public.audit_logs
  for insert to app_api
  with check (tenant_id = (select app.current_tenant_id()));

commit;
