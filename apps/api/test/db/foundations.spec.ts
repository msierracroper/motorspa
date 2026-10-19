import type { PGlite } from '@electric-sql/pglite';
import { asTenant, createTestDb, TENANT } from './harness.js';

const OTHER_TENANT = '00000000-0000-4000-8000-0000000000ff';

describe('migración foundations (Postgres real con PGlite)', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createTestDb();
    await db.query(`insert into public.tenants (id, name) values ($1, 'Otra empresa')`, [
      OTHER_TENANT,
    ]);
  }, 60_000);

  afterAll(() => db.close());

  it('siembra los 24 permisos y los 4 roles del sistema', async () => {
    const perms = await db.query<{ n: number }>(
      'select count(*)::int as n from public.permissions',
    );
    const roles = await db.query<{ n: number }>(
      'select count(*)::int as n from public.roles where is_system',
    );
    expect(perms.rows[0]!.n).toBe(24);
    expect(roles.rows[0]!.n).toBe(4);
  });

  it('RLS: app_api solo ve los datos de su tenant', async () => {
    const mine = await asTenant(db, { tenantId: TENANT }, (tx) =>
      tx.query<{ name: string }>('select name from public.tenants'),
    );
    expect(mine.rows.map((r) => r.name)).toEqual(['MotoSpa Demo']);

    const other = await asTenant(db, { tenantId: OTHER_TENANT }, (tx) =>
      tx.query('select * from public.roles'),
    );
    expect(other.rows).toHaveLength(0);
  });

  it('RLS: sin tenant definido no se ve nada', async () => {
    const res = await db.transaction(async (tx) => {
      await tx.query(`select set_config('role', 'app_api', true)`);
      return tx.query('select * from public.branches');
    });
    expect(res.rows).toHaveLength(0);
  });

  it('RLS: no se puede insertar en otro tenant', async () => {
    await expect(
      asTenant(db, { tenantId: TENANT }, (tx) =>
        tx.query(`insert into public.branches (tenant_id, name) values ($1, 'Intrusa')`, [
          OTHER_TENANT,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('la auditoría es inmutable', async () => {
    await asTenant(db, { tenantId: TENANT }, (tx) =>
      tx.query(
        `insert into public.audit_logs (tenant_id, entity, action) values ($1, 'test', 'CREATE')`,
        [TENANT],
      ),
    );
    await expect(db.query(`delete from public.audit_logs`)).rejects.toThrow(/inmutable/);
  });

  it('anon y authenticated (Data API) no tienen acceso', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query(`set local role anon`);
        return tx.query('select * from public.tenants');
      }),
    ).rejects.toThrow(/permission denied/);
  });
});
