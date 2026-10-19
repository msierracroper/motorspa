/**
 * Crea (o actualiza) los usuarios demo en Supabase Auth y en public.users,
 * con su rol en la sede principal. Idempotente: se puede correr varias veces.
 *
 * Uso: pnpm --filter @motospa/api seed:users
 * Requiere en apps/api/.env: DATABASE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY
 */
import { SYSTEM_ROLES, usernameToEmail, type SystemRoleName } from '@motospa/shared';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { hashPin } from '../src/auth/pin.js';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const BRANCH_ID = '00000000-0000-4000-8000-000000000101';
const PASSWORD = process.env.SEED_PASSWORD ?? 'MotoSpa2026!';
const PIN = process.env.SEED_PIN ?? '1234';

const DEMO_USERS: { username: string; fullName: string; role: SystemRoleName }[] = [
  { username: 'admin', fullName: 'Administrador Demo', role: SYSTEM_ROLES.ADMIN },
  { username: 'supervisor', fullName: 'Supervisor Demo', role: SYSTEM_ROLES.SUPERVISOR },
  { username: 'cajero', fullName: 'Cajero Demo', role: SYSTEM_ROLES.CASHIER },
  { username: 'lavador1', fullName: 'Lavador Uno', role: SYSTEM_ROLES.WASHER },
  { username: 'lavador2', fullName: 'Lavador Dos', role: SYSTEM_ROLES.WASHER },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sql = postgres(requireEnv('DATABASE_URL'), { prepare: false, max: 1 });

async function findAuthUserId(email: string): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) return null;
  }
}

async function upsertAuthUser(email: string): Promise<string> {
  const attrs = { password: PASSWORD, email_confirm: true, app_metadata: { tenant_id: TENANT_ID } };
  const existingId = await findAuthUserId(email);
  if (existingId) {
    const { error } = await supabase.auth.admin.updateUserById(existingId, attrs);
    if (error) throw error;
    return existingId;
  }
  const { data, error } = await supabase.auth.admin.createUser({ email, ...attrs });
  if (error) throw error;
  return data.user.id;
}

async function main() {
  const [{ exists: hasEmployees } = { exists: false }] = await sql<{ exists: boolean }[]>`
    select to_regclass('public.employees') is not null as exists`;
  for (const u of DEMO_USERS) {
    const authUserId = await upsertAuthUser(usernameToEmail(u.username));

    await sql.begin(async (tx) => {
      // Mismo aislamiento que la API: rol app_api + tenant actual.
      await tx`set local role app_api`;
      await tx`select set_config('app.tenant_id', ${TENANT_ID}, true)`;

      const [user] = await tx<{ id: string }[]>`
        insert into public.users (tenant_id, auth_user_id, username, full_name)
        values (${TENANT_ID}, ${authUserId}, ${u.username}, ${u.fullName})
        on conflict (auth_user_id) do update set full_name = excluded.full_name
        returning id`;

      await tx`
        insert into public.user_branch_roles (tenant_id, user_id, branch_id, role_id)
        select ${TENANT_ID}, ${user!.id}, ${BRANCH_ID}, r.id
        from public.roles r
        where r.tenant_id = ${TENANT_ID} and r.name = ${u.role}
        on conflict do nothing`;

      // Fase 1 (D-9): los lavadores son empleados para poder asignarles servicios.
      if (u.role === SYSTEM_ROLES.WASHER && hasEmployees) {
        await tx`
          insert into public.employees (tenant_id, user_id, full_name)
          values (${TENANT_ID}, ${user!.id}, ${u.fullName})
          on conflict (user_id) do nothing`;
      }
      // PIN para autorizar descuentos (D-7).
      if (u.role === SYSTEM_ROLES.ADMIN || u.role === SYSTEM_ROLES.SUPERVISOR) {
        await tx`update public.users set pin_hash = ${await hashPin(PIN)} where id = ${user!.id}`;
      }
    });

    console.log(`✔ ${u.username.padEnd(11)} → ${u.role}`);
  }
  console.log(`\nContraseña de todos los usuarios demo: ${PASSWORD}`);
  console.log(`PIN de autorización (admin y supervisor): ${PIN}`);
  if (!hasEmployees) {
    console.log('⚠ Falta la migración de la Fase 1: los lavadores aún no quedaron como empleados.');
  }
}

main()
  .catch((err) => {
    console.error('✘ Error creando usuarios:', err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
