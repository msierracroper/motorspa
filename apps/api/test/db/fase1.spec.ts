import type { PGlite } from '@electric-sql/pglite';
import { asTenant, BRANCH, createTestDb, createUser, ROLE, TENANT } from './harness.js';

const MOTO_KXT = '00000000-0000-4000-8000-000000001101';
const MOTO_BRM = '00000000-0000-4000-8000-000000001102';
const REGISTER = '00000000-0000-4000-8000-000000000601';
const CASH = '00000000-0000-4000-8000-000000000501';
const OTHER_TENANT = '00000000-0000-4000-8000-0000000000ff';

describe('migración fase1_operations (Postgres real con PGlite)', () => {
  let db: PGlite;
  let cashier: string;

  beforeAll(async () => {
    db = await createTestDb();
    cashier = await createUser(db, 'cajero_test', ROLE.cashier);
    await db.query(`insert into public.tenants (id, name) values ($1, 'Otra')`, [OTHER_TENANT]);
  }, 60_000);

  afterAll(() => db.close());

  const scope = () => ({ tenantId: TENANT, userId: cashier });

  const newOrder = (tx: Parameters<Parameters<typeof asTenant>[2]>[0], moto: string) =>
    tx.query<{ id: string; number: string }>(
      `insert into public.work_orders (tenant_id, branch_id, number, motorcycle_id, type, checked_in_by)
       values ($1, $2, app.next_sequence($2, 'WORK_ORDER'), $3, 'WASH', $4) returning id, number`,
      [TENANT, BRANCH, moto, cashier],
    );

  it('siembra catálogo, tarifa, cupos, caja y medios de pago', async () => {
    const counts = await asTenant(db, scope(), (tx) =>
      tx.query<Record<string, number>>(`select
        (select count(*)::int from public.services) as services,
        (select count(*)::int from public.service_prices) as prices,
        (select count(*)::int from public.parking_spots) as spots,
        (select count(*)::int from public.payment_methods) as methods,
        (select count(*)::int from public.parking_rates where active) as rates`),
    );
    expect(counts.rows[0]).toEqual({ services: 5, prices: 13, spots: 20, methods: 5, rates: 1 });
  });

  it('el seed es idempotente', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const seed = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../supabase/seed_fase1.sql',
    );
    await db.exec(readFileSync(seed, 'utf8'));
    const { rows } = await db.query<{ n: number }>(
      'select count(*)::int as n from public.service_prices',
    );
    expect(rows[0]!.n).toBe(13);
  });

  it('regla 10: consecutivos sin huecos aunque una transacción se revierta', async () => {
    const first = await asTenant(db, scope(), (tx) => newOrder(tx, MOTO_KXT));
    await expect(
      asTenant(db, scope(), async (tx) => {
        await newOrder(tx, MOTO_BRM);
        throw new Error('falla a propósito');
      }),
    ).rejects.toThrow('falla a propósito');
    const second = await asTenant(db, scope(), (tx) => newOrder(tx, MOTO_BRM));
    expect(Number(second.rows[0]!.number)).toBe(Number(first.rows[0]!.number) + 1);
  });

  it('regla 1: una placa no puede tener dos órdenes activas', async () => {
    await expect(asTenant(db, scope(), (tx) => newOrder(tx, MOTO_KXT))).rejects.toThrow(
      /work_orders_one_active_per_moto/,
    );
  });

  it('una orden cancelada exige motivo y libera la placa', async () => {
    await expect(
      asTenant(db, scope(), (tx) =>
        tx.query(`update public.work_orders set status = 'CANCELLED' where motorcycle_id = $1`, [
          MOTO_KXT,
        ]),
      ),
    ).rejects.toThrow(/check/);
    await asTenant(db, scope(), (tx) =>
      tx.query(
        `update public.work_orders set status = 'CANCELLED', cancel_reason = 'prueba'
         where motorcycle_id = $1 and status <> 'CANCELLED'`,
        [MOTO_KXT],
      ),
    );
    await asTenant(db, scope(), (tx) => newOrder(tx, MOTO_KXT));
  });

  it('caja: un solo turno abierto; pagos solo se anulan; movimientos inmutables', async () => {
    const shift = await asTenant(db, scope(), (tx) =>
      tx.query<{ id: string }>(
        `insert into public.cash_shifts (tenant_id, branch_id, register_id, opened_by, opening_amount)
         values ($1, $2, $3, $4, 100000) returning id`,
        [TENANT, BRANCH, REGISTER, cashier],
      ),
    );
    const shiftId = shift.rows[0]!.id;

    await expect(
      asTenant(db, scope(), (tx) =>
        tx.query(
          `insert into public.cash_shifts (tenant_id, branch_id, register_id, opened_by, opening_amount)
           values ($1, $2, $3, $4, 0)`,
          [TENANT, BRANCH, REGISTER, cashier],
        ),
      ),
    ).rejects.toThrow(/cash_shifts_one_open/);

    const pay = await asTenant(db, scope(), async (tx) => {
      const p = await tx.query<{ id: string }>(
        `insert into public.payments (tenant_id, branch_id, shift_id, number, services_amount, subtotal, discount, total, created_by)
         values ($1, $2, $3, app.next_sequence($2, 'PAYMENT'), 12000, 12000, 0, 12000, $4) returning id`,
        [TENANT, BRANCH, shiftId, cashier],
      );
      await tx.query(
        `insert into public.payment_lines (tenant_id, payment_id, payment_method_id, amount) values ($1, $2, $3, 12000)`,
        [TENANT, p.rows[0]!.id, CASH],
      );
      return p.rows[0]!.id;
    });

    // El total debe ser subtotal − descuento
    await expect(
      asTenant(db, scope(), (tx) =>
        tx.query(
          `insert into public.payments (tenant_id, branch_id, shift_id, number, services_amount, subtotal, discount, total, created_by)
           values ($1, $2, $3, 999, 10000, 10000, 1000, 10000, $4)`,
          [TENANT, BRANCH, shiftId, cashier],
        ),
      ),
    ).rejects.toThrow(/check/);

    // Cambiar el monto de un pago: prohibido
    await expect(
      asTenant(db, scope(), (tx) =>
        tx.query(`update public.payments set total = 1 where id = $1`, [pay]),
      ),
    ).rejects.toThrow(/solo se puede anular/);

    // Anular con motivo: permitido
    await asTenant(db, scope(), (tx) =>
      tx.query(
        `update public.payments set status = 'VOIDED', voided_at = now(), voided_by = $2, void_reason = 'error de digitación'
         where id = $1`,
        [pay, cashier],
      ),
    );

    // Una vez anulado, no vuelve a cambiar
    await expect(
      asTenant(db, scope(), (tx) =>
        tx.query(`update public.payments set status = 'PAID' where id = $1`, [pay]),
      ),
    ).rejects.toThrow(/solo se puede anular/);

    await expect(db.query(`delete from public.payment_lines`)).rejects.toThrow(/inmutable/);
  });

  it('un cupo no puede tener dos motos a la vez', async () => {
    const spot = await asTenant(db, scope(), (tx) =>
      tx.query<{ id: string }>(`select id from public.parking_spots where code = 'P01'`),
    );
    const orders = await asTenant(db, scope(), (tx) =>
      tx.query<{ id: string }>(
        `select id from public.work_orders where status <> 'CANCELLED' limit 2`,
      ),
    );
    const rate = '00000000-0000-4000-8000-000000000701';
    const insertSession = (orderId: string) =>
      asTenant(db, scope(), (tx) =>
        tx.query(
          `insert into public.parking_sessions (tenant_id, branch_id, work_order_id, spot_id, rate_id)
           values ($1, $2, $3, $4, $5)`,
          [TENANT, BRANCH, orderId, spot.rows[0]!.id, rate],
        ),
      );
    await insertSession(orders.rows[0]!.id);
    await expect(insertSession(orders.rows[1]!.id)).rejects.toThrow(
      /parking_sessions_spot_occupied/,
    );
  });

  it('RLS: otro tenant no ve órdenes, pagos ni clientes', async () => {
    const res = await asTenant(db, { tenantId: OTHER_TENANT }, (tx) =>
      tx.query<Record<string, number>>(`select
        (select count(*)::int from public.work_orders) as orders,
        (select count(*)::int from public.payments) as payments,
        (select count(*)::int from public.customers) as customers,
        (select count(*)::int from public.services) as services`),
    );
    expect(res.rows[0]).toEqual({ orders: 0, payments: 0, customers: 0, services: 0 });
  });
});
