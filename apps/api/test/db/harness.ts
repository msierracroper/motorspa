/**
 * Postgres embebido (PGlite) con las migraciones reales de supabase/migrations
 * y el seed. Permite probar esquema, RLS y reglas SQL sin tocar Supabase.
 */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'supabase');

export const TENANT = '00000000-0000-4000-8000-000000000001';
export const BRANCH = '00000000-0000-4000-8000-000000000101';
export const ROLE = {
  admin: '00000000-0000-4000-8000-000000000201',
  supervisor: '00000000-0000-4000-8000-000000000202',
  cashier: '00000000-0000-4000-8000-000000000203',
  washer: '00000000-0000-4000-8000-000000000204',
} as const;

export async function createTestDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  // Roles que existen en Supabase y que las migraciones mencionan.
  await db.exec(`create role anon nologin; create role authenticated nologin;`);
  const migrations = readdirSync(join(root, 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of migrations) {
    await db.exec(readFileSync(join(root, 'migrations', file), 'utf8'));
  }
  for (const seed of ['seed.sql', 'seed_fase1.sql']) {
    await db.exec(readFileSync(join(root, seed), 'utf8'));
  }
  return db;
}

/** Crea un usuario de prueba (sin Supabase Auth) con un rol en la sede demo. */
export async function createUser(db: PGlite, username: string, roleId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.users (tenant_id, auth_user_id, username, full_name)
     values ($1, gen_random_uuid(), $2, $2) returning id`,
    [TENANT, username],
  );
  const id = rows[0]!.id;
  await db.query(
    `insert into public.user_branch_roles (tenant_id, user_id, branch_id, role_id) values ($1, $2, $3, $4)`,
    [TENANT, id, BRANCH, roleId],
  );
  return id;
}

/** Ejecuta `fn` como lo hace DbService.withTenant: rol app_api + tenant/usuario actuales. */
export async function asTenant<T>(
  db: PGlite,
  scope: { tenantId: string; userId?: string },
  fn: (tx: Parameters<Parameters<PGlite['transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(
      `select set_config('role', 'app_api', true),
              set_config('app.tenant_id', $1, true),
              set_config('app.user_id', $2, true)`,
      [scope.tenantId, scope.userId ?? ''],
    );
    return fn(tx);
  });
}
