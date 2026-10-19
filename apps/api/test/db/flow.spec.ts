/**
 * Flujo completo de la Fase 1 con los servicios reales sobre Postgres (PGlite):
 * check-in → ejecución de servicios → cobro con descuento autorizado → entrega → arqueo.
 */
import type { PGlite } from '@electric-sql/pglite';
import { SYSTEM_ROLES } from '@motospa/shared';
import type { AuthContext } from '../../src/auth/auth-context.js';
import { hashPin } from '../../src/auth/pin.js';
import { CashService } from '../../src/cash/cash.service.js';
import { CustomersService } from '../../src/customers/customers.service.js';
import { ParkingService } from '../../src/parking/parking.service.js';
import { ReportsService } from '../../src/reports/reports.service.js';
import { WorkOrdersService } from '../../src/work-orders/work-orders.service.js';
import { createTestDb, ROLE } from './harness.js';
import { audit, makeAuth, testDbService } from './test-db-service.js';

const S = {
  lavado: '00000000-0000-4000-8000-000000000901',
  cadena: '00000000-0000-4000-8000-000000000904',
  polichado: '00000000-0000-4000-8000-000000000902',
};
const CASH = '00000000-0000-4000-8000-000000000501';
const NEQUI = '00000000-0000-4000-8000-000000000502';
const REGISTER = '00000000-0000-4000-8000-000000000601';

const today = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10); // fecha en Colombia

describe('flujo de la Fase 1 (servicios reales + Postgres)', () => {
  let pg: PGlite;
  let orders: WorkOrdersService;
  let cash: CashService;
  let customers: CustomersService;
  let reports: ReportsService;
  let parking: ParkingService;
  let cajero: AuthContext;
  let supervisor: AuthContext;
  let lavador1: AuthContext;
  let lavador2: AuthContext;

  let orderId: string;
  let itemLavado: string;
  let itemCadena: string;

  beforeAll(async () => {
    pg = await createTestDb();
    const db = testDbService(pg);
    orders = new WorkOrdersService(db, audit);
    cash = new CashService(db, audit);
    customers = new CustomersService(db);
    reports = new ReportsService(db);
    parking = new ParkingService(db);

    cajero = await makeAuth(pg, 'cajero_t', SYSTEM_ROLES.CASHIER, ROLE.cashier);
    supervisor = await makeAuth(pg, 'super_t', SYSTEM_ROLES.SUPERVISOR, ROLE.supervisor);
    lavador1 = await makeAuth(pg, 'lavador_a', SYSTEM_ROLES.WASHER, ROLE.washer, {
      employee: true,
    });
    lavador2 = await makeAuth(pg, 'lavador_b', SYSTEM_ROLES.WASHER, ROLE.washer, {
      employee: true,
    });
    await pg.query(`update public.users set pin_hash = $1 where id = $2`, [
      await hashPin('1234'),
      supervisor.userId,
    ]);
  }, 60_000);

  afterAll(() => pg.close());

  it('check-in de una moto nueva: crea moto y cliente, precios por cilindraje, orden en cola', async () => {
    const res = await orders.checkIn(cajero, {
      plate: 'ABC12D',
      motorcycle: { brand: 'Suzuki', model: 'Gixxer', cc: 150 },
      customer: { fullName: 'María Torres', phone: '3201112233' },
      type: 'WASH_PARKING',
      serviceIds: [S.lavado, S.cadena],
      employeeIds: [],
      belongings: [{ item: 'Casco', quantity: 1 }],
    });
    expect(res).toMatchObject({ number: 1, status: 'QUEUED', plate: 'ABC12D' });
    orderId = res.id;

    const detail = await orders.detail(cajero, orderId);
    expect(detail.items.map((i) => [i.description, i.unitPrice])).toEqual([
      ['Lavado sencillo', 12000],
      ['Lubricación de cadena', 5000],
    ]);
    expect(detail.customer?.fullName).toBe('María Torres');
    expect(detail.parkingSession).not.toBeNull();
    itemLavado = detail.items[0]!.id;
    itemCadena = detail.items[1]!.id;

    const found = await customers.searchByPlate(cajero, 'abc-12d');
    expect(found.activeOrder?.id).toBe(orderId);
    expect(found.customers[0]?.phone).toBe('3201112233');
  });

  it('regla 1: no permite un segundo ingreso de la misma placa', async () => {
    await expect(
      orders.checkIn(cajero, {
        plate: 'ABC12D',
        type: 'PARKING',
        serviceIds: [],
        employeeIds: [],
        belongings: [],
      }),
    ).rejects.toThrow('Esta moto ya tiene una orden activa');
  });

  it('el lavador ve los servicios libres, toma uno y no puede tocar el de otro', async () => {
    const board = await orders.board(lavador2);
    expect(board.find((o) => o.id === orderId)?.items).toHaveLength(2);

    await orders.startItem(lavador1, itemLavado); // queda asignado a lavador1
    await orders.startItem(lavador2, itemCadena);
    await expect(orders.finishItem(lavador2, itemLavado)).rejects.toThrow(
      'asignado a otro lavador',
    );

    const mine = await orders.board(lavador1);
    expect(mine.find((o) => o.id === orderId)?.items.map((i) => i.id)).toEqual([itemLavado]);
  });

  it('al terminar todos los servicios la orden queda lista', async () => {
    await orders.finishItem(lavador2, itemCadena);
    const r = await orders.finishItem(lavador1, itemLavado);
    expect(r.orderStatus).toBe('READY');
  });

  it('regla 2: no se entrega sin pago', async () => {
    await expect(orders.deliver(cajero, orderId)).rejects.toThrow('no está pagada');
  });

  it('regla 3: sin turno abierto no se cobra', async () => {
    await expect(
      cash.charge(cajero, {
        workOrderId: orderId,
        lines: [{ paymentMethodId: CASH, amount: 17000 }],
      }),
    ).rejects.toThrow('Abre un turno de caja');
  });

  it('cobro con descuento sobre el límite: exige y valida la autorización por PIN', async () => {
    const shift = await cash.openShift(cajero, { registerId: REGISTER, openingAmount: 50000 });
    expect(shift.status).toBe('OPEN');

    const preview = await cash.preview(cajero, orderId);
    // Cortesía de lavado: el parqueo durante el servicio no se cobra
    expect(preview).toMatchObject({ servicesAmount: 17000, subtotal: 17000 });
    expect(preview.parking?.reason).toBe('COURTESY');
    expect(preview.discountLimit).toEqual({ maxPercent: 10, maxAmount: 5000 });

    const discount = { type: 'PERCENT' as const, value: 20, reason: 'Cliente frecuente' };
    const lines = [
      { paymentMethodId: CASH, amount: 10000 },
      { paymentMethodId: NEQUI, amount: 3600 },
    ];
    await expect(cash.charge(cajero, { workOrderId: orderId, discount, lines })).rejects.toThrow(
      'supera tu límite',
    );
    await expect(
      cash.charge(cajero, {
        workOrderId: orderId,
        discount,
        lines,
        authorization: { username: 'super_t', pin: '9999' },
      }),
    ).rejects.toThrow('PIN de autorización incorrectos');

    // Pagos que no suman el total
    await expect(
      cash.charge(cajero, {
        workOrderId: orderId,
        discount,
        lines: [{ paymentMethodId: CASH, amount: 10000 }],
        authorization: { username: 'super_t', pin: '1234' },
      }),
    ).rejects.toThrow('sumar exactamente el total');

    const payment = await cash.charge(cajero, {
      workOrderId: orderId,
      discount,
      lines,
      authorization: { username: 'super_t', pin: '1234' },
    });
    expect(payment).toMatchObject({ subtotal: 17000, discount: 3400, total: 13600, number: 1 });
    expect(payment.discountAuthorizedBy).toBe(supervisor.userId);

    await expect(
      cash.charge(cajero, {
        workOrderId: orderId,
        lines: [{ paymentMethodId: CASH, amount: 13600 }],
      }),
    ).rejects.toThrow('ya fue pagada');
  });

  it('entrega con pago completo y pertenencias devueltas', async () => {
    await expect(orders.deliver(cajero, orderId)).resolves.toEqual({ status: 'DELIVERED' });
    const detail = await orders.detail(cajero, orderId);
    expect(detail.belongings.every((b) => b.returned)).toBe(true);
    expect(detail.history.map((h) => h.toStatus)).toEqual([
      'RECEIVED',
      'QUEUED',
      'IN_PROGRESS',
      'READY',
      'DELIVERED',
    ]);
  });

  it('parqueo por tiempo: cobra la tarifa desde la entrada', async () => {
    const p = await orders.checkIn(cajero, {
      plate: 'BRM08E',
      type: 'PARKING',
      serviceIds: [],
      employeeIds: [],
      belongings: [],
    });
    expect(p.status).toBe('READY');
    // Simula 2 horas de estadía
    await pg.query(
      `update public.parking_sessions set entry_at = now() - interval '2 hours' where work_order_id = $1`,
      [p.id],
    );
    const q = await parking.quote(cajero, p.id);
    expect(q.quote.reason).toBe('CHARGED');
    expect(q.quote.amount).toBeGreaterThanOrEqual(4000); // 4 fracciones (día $1.000 / noche $1.500)

    const pay = await cash.charge(cajero, {
      workOrderId: p.id,
      lines: [{ paymentMethodId: CASH, amount: q.quote.amount }],
    });
    expect(pay.parkingAmount).toBe(q.quote.amount);

    // Anular el pago (supervisor): la orden vuelve a quedar por cobrar
    await expect(cash.voidPayment(supervisor, pay.id, 'cobro duplicado')).resolves.toEqual({
      status: 'VOIDED',
    });
    const again = await cash.preview(cajero, p.id);
    expect(again.subtotal).toBeGreaterThanOrEqual(q.quote.amount);
  });

  it('cancelar una orden exige que no esté pagada y libera la placa', async () => {
    const o = await orders.checkIn(cajero, {
      plate: 'QWZ93A',
      type: 'WASH',
      serviceIds: [S.polichado],
      employeeIds: [],
      belongings: [],
    });
    const d = await orders.detail(cajero, o.id);
    expect(d.items[0]!.unitPrice).toBe(45000); // 373 cc → rango 151–400
    await orders.cancel(supervisor, o.id, 'El cliente se arrepintió');
    const again = await customers.searchByPlate(cajero, 'QWZ93A');
    expect(again.activeOrder).toBeNull();
  });

  it('arqueo al cierre: esperado = base + ventas en efectivo; reporte del día', async () => {
    const current = await cash.currentShift(cajero);
    // 50.000 base + 10.000 efectivo (orden 1) + parqueo anulado (no cuenta)
    expect(current?.summary.expected[CASH]).toBe(60000);
    expect(current?.summary.expected[NEQUI]).toBe(3600);

    const closed = await cash.closeShift(cajero, current!.id, {
      counted: { [CASH]: 58000, [NEQUI]: 3600 },
      notes: 'Faltan 2.000',
    });
    expect(closed).toMatchObject({ totalDifference: -2000, alert: false });

    const report = await reports.daily(supervisor, today());
    expect(report.sales).toMatchObject({
      count: 1,
      total: 13600,
      services: 17000,
      discounts: 3400,
    });
    expect(report.byMethod.map((m) => [m.method, m.total])).toEqual([
      ['Efectivo', 10000],
      ['Nequi', 3600],
    ]);
    expect(report.shifts[0]).toMatchObject({ difference: -2000, status: 'CLOSED' });

    const own = await reports.daily(cajero, today());
    expect(own.scope).toBe('OWN_SHIFTS');
  });

  it('auditoría: cada escritura de negocio quedó registrada', async () => {
    const { rows } = await pg.query<{ action: string }>(
      `select action from public.audit_logs order by created_at`,
    );
    const actions = rows.map((r) => r.action);
    for (const a of [
      'CHECK_IN',
      'START',
      'FINISH',
      'OPEN',
      'CHARGE',
      'DELIVER',
      'VOID',
      'CANCEL',
      'CLOSE',
    ]) {
      expect(actions).toContain(a);
    }
  });
});
