import type { PGlite } from '@electric-sql/pglite';
import { SYSTEM_ROLE_PERMISSIONS, type SystemRoleName } from '@motospa/shared';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import type { AuthContext } from '../../src/auth/auth-context.js';
import { AuditService } from '../../src/audit/audit.service.js';
import type { DbService, TenantScope, Tx } from '../../src/db/db.service.js';
import * as schema from '../../src/db/schema.js';
import { BRANCH, createUser, TENANT } from './harness.js';

/** DbService equivalente al real (rol app_api + RLS) pero sobre PGlite. */
export function testDbService(pg: PGlite): DbService {
  const db = drizzle(pg, { schema });
  return {
    withTenant<T>(scope: TenantScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('role', 'app_api', true),
                     set_config('app.tenant_id', ${scope.tenantId}, true),
                     set_config('app.user_id', ${scope.userId ?? ''}, true)`,
        );
        return fn(tx as unknown as Tx);
      });
    },
    ping: async () => undefined,
    onModuleDestroy: async () => undefined,
  } as unknown as DbService;
}

export const audit = new AuditService();

/** Crea un usuario con su rol y devuelve un AuthContext como el que arma el guard. */
export async function makeAuth(
  pg: PGlite,
  username: string,
  roleName: SystemRoleName,
  roleId: string,
  opts: { employee?: boolean } = {},
): Promise<AuthContext> {
  const userId = await createUser(pg, username, roleId);
  let employeeId: string | null = null;
  if (opts.employee) {
    const { rows } = await pg.query<{ id: string }>(
      `insert into public.employees (tenant_id, user_id, full_name) values ($1, $2, $3) returning id`,
      [TENANT, userId, username],
    );
    employeeId = rows[0]!.id;
  }
  return {
    authUserId: userId,
    tenantId: TENANT,
    userId,
    employeeId,
    username,
    fullName: username,
    branchIds: [BRANCH],
    roles: [roleName],
    permissions: [...SYSTEM_ROLE_PERMISSIONS[roleName]],
  };
}
