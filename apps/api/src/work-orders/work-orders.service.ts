import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACTIVE_WORK_ORDER_STATUSES,
  canFinishItem,
  canStartItem,
  canTransition,
  deriveStatus,
  PERMISSIONS,
  type CheckInInput,
  type ItemStatus,
  type WorkOrderStatus,
} from '@motospa/shared';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { branchOf, type AuthContext } from '../auth/auth-context.js';
import { AuditService } from '../audit/audit.service.js';
import { loadServices, priceOf } from '../catalog/catalog.service.js';
import { withDbErrors } from '../common/db-errors.js';
import { DbService, type Tx } from '../db/db.service.js';
import { nextSequence } from '../db/sequences.js';
import {
  customerMotorcycles,
  customers,
  employees,
  motorcycles,
  parkingRates,
  parkingSessions,
  parkingSpots,
  payments,
  workOrderBelongings,
  workOrderItems,
  workOrderItemStaff,
  workOrders,
  workOrderStatusHistory,
} from '../db/schema.js';

const can = (auth: AuthContext, p: string) => auth.permissions.includes(p as never);

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  private scope(auth: AuthContext) {
    return { tenantId: auth.tenantId, userId: auth.userId };
  }

  // ------------------------------------------------------------------
  // Check-in (SPEC §4.2)
  // ------------------------------------------------------------------
  async checkIn(auth: AuthContext, input: CheckInInput) {
    const branchId = branchOf(auth);
    return withDbErrors(() =>
      this.db.withTenant(this.scope(auth), async (tx) => {
        const moto = await upsertMotorcycle(tx, auth, input);
        const customerId = await resolveCustomer(tx, auth, moto.id, input);

        const catalog = input.serviceIds.length
          ? await loadServices(tx, branchId, input.serviceIds)
          : [];
        if (catalog.length !== new Set(input.serviceIds).size) {
          throw new BadRequestException('Alguno de los servicios no existe o está inactivo');
        }

        let rateId: string | null = null;
        if (input.type !== 'WASH') {
          const [rate] = await tx
            .select({ id: parkingRates.id })
            .from(parkingRates)
            .where(and(eq(parkingRates.branchId, branchId), eq(parkingRates.active, true)))
            .limit(1);
          if (!rate) throw new BadRequestException('La sede no tiene una tarifa de parqueo activa');
          rateId = rate.id;
        }

        const number = await nextSequence(tx, branchId, 'WORK_ORDER');

        const [order] = await tx
          .insert(workOrders)
          .values({
            tenantId: auth.tenantId,
            branchId,
            number,
            motorcycleId: moto.id,
            customerId,
            type: input.type,
            parkingSpotId: input.parkingSpotId ?? null,
            checkedInBy: auth.userId,
            mileage: input.mileage ?? null,
            fuelLevel: input.fuelLevel ?? null,
            damageNotes: input.damageNotes ?? null,
            notes: input.notes ?? null,
            createdBy: auth.userId,
          })
          .returning();

        await tx.insert(workOrderStatusHistory).values({
          tenantId: auth.tenantId,
          workOrderId: order!.id,
          fromStatus: null,
          toStatus: 'RECEIVED',
          userId: auth.userId,
        });

        // Ítems con el precio según el cilindraje de la moto
        const ordered = input.serviceIds.map((id) => catalog.find((c) => c.id === id)!);
        const items = ordered.length
          ? await tx
              .insert(workOrderItems)
              .values(
                ordered.map((s) => ({
                  tenantId: auth.tenantId,
                  workOrderId: order!.id,
                  serviceId: s.id,
                  description: s.name,
                  estimatedMinutes: s.estimatedMinutes,
                  unitPrice: priceOf(s, moto.cc),
                  createdBy: auth.userId,
                })),
              )
              .returning({ id: workOrderItems.id })
          : [];

        if (input.employeeIds.length && items.length) {
          await assertEmployees(tx, input.employeeIds);
          await tx.insert(workOrderItemStaff).values(
            items.flatMap((it) =>
              input.employeeIds.map((employeeId) => ({
                tenantId: auth.tenantId,
                itemId: it.id,
                employeeId,
                sharePercent: Math.floor(100 / input.employeeIds.length),
              })),
            ),
          );
        }

        if (input.belongings.length) {
          await tx.insert(workOrderBelongings).values(
            input.belongings.map((b) => ({
              tenantId: auth.tenantId,
              workOrderId: order!.id,
              item: b.item,
              quantity: b.quantity,
            })),
          );
        }

        if (rateId) {
          await tx.insert(parkingSessions).values({
            tenantId: auth.tenantId,
            branchId,
            workOrderId: order!.id,
            spotId: input.parkingSpotId ?? null,
            rateId,
            entryAt: order!.checkedInAt,
          });
        }

        // RECEIVED → QUEUED (con servicios) o READY (solo parqueo)
        const status = await refreshStatus(tx, auth, order!.id);

        await this.audit.log(tx, auth, {
          entity: 'work_order',
          entityId: order!.id,
          branchId,
          action: 'CHECK_IN',
          after: {
            number: order!.number,
            plate: moto.plate,
            type: input.type,
            status,
            services: input.serviceIds,
          },
        });

        return { id: order!.id, number: order!.number, status, plate: moto.plate };
      }),
    );
  }

  // ------------------------------------------------------------------
  // Tablero y detalle
  // ------------------------------------------------------------------
  /** Órdenes activas. El lavador (solo `orders.view_own`) ve las suyas y las libres para tomar. */
  async board(auth: AuthContext) {
    const branchId = branchOf(auth);
    return this.db.withTenant(this.scope(auth), async (tx) => {
      const orders = await tx
        .select({
          id: workOrders.id,
          number: workOrders.number,
          type: workOrders.type,
          status: workOrders.status,
          checkedInAt: workOrders.checkedInAt,
          readyAt: workOrders.readyAt,
          paidAt: workOrders.paidAt,
          plate: motorcycles.plate,
          brand: motorcycles.brand,
          model: motorcycles.model,
          cc: motorcycles.cc,
          customerName: customers.fullName,
          customerPhone: customers.phone,
          spotCode: parkingSpots.code,
        })
        .from(workOrders)
        .innerJoin(motorcycles, eq(motorcycles.id, workOrders.motorcycleId))
        .leftJoin(customers, eq(customers.id, workOrders.customerId))
        .leftJoin(parkingSpots, eq(parkingSpots.id, workOrders.parkingSpotId))
        .where(
          and(
            eq(workOrders.branchId, branchId),
            inArray(workOrders.status, [...ACTIVE_WORK_ORDER_STATUSES]),
          ),
        )
        .orderBy(asc(workOrders.checkedInAt));

      const items = await loadItems(
        tx,
        orders.map((o) => o.id),
      );
      const result = orders.map((o) => ({
        ...o,
        items: items.filter((i) => i.workOrderId === o.id),
      }));

      if (can(auth, PERMISSIONS.ORDERS_VIEW_ALL)) return result;
      // Lavador: órdenes con ítems suyos o ítems pendientes sin asignar
      return result
        .map((o) => ({
          ...o,
          items: o.items.filter(
            (i) =>
              i.staff.some((s) => s.id === auth.employeeId) ||
              (i.staff.length === 0 && i.status === 'PENDING'),
          ),
        }))
        .filter((o) => o.items.length > 0);
    });
  }

  async detail(auth: AuthContext, id: string) {
    return this.db.withTenant(this.scope(auth), async (tx) => {
      const [order] = await tx
        .select({
          order: workOrders,
          moto: {
            id: motorcycles.id,
            plate: motorcycles.plate,
            brand: motorcycles.brand,
            model: motorcycles.model,
            cc: motorcycles.cc,
            color: motorcycles.color,
          },
          customer: { id: customers.id, fullName: customers.fullName, phone: customers.phone },
          spotCode: parkingSpots.code,
        })
        .from(workOrders)
        .innerJoin(motorcycles, eq(motorcycles.id, workOrders.motorcycleId))
        .leftJoin(customers, eq(customers.id, workOrders.customerId))
        .leftJoin(parkingSpots, eq(parkingSpots.id, workOrders.parkingSpotId))
        .where(eq(workOrders.id, id))
        .limit(1);
      if (!order) throw new NotFoundException('La orden no existe');

      const [items, belongings, [session], history, paid] = await Promise.all([
        loadItems(tx, [id]),
        tx.select().from(workOrderBelongings).where(eq(workOrderBelongings.workOrderId, id)),
        tx.select().from(parkingSessions).where(eq(parkingSessions.workOrderId, id)),
        tx
          .select()
          .from(workOrderStatusHistory)
          .where(eq(workOrderStatusHistory.workOrderId, id))
          .orderBy(asc(workOrderStatusHistory.at)),
        tx
          .select()
          .from(payments)
          .where(and(eq(payments.workOrderId, id), eq(payments.status, 'PAID')))
          .orderBy(desc(payments.createdAt))
          .limit(1),
      ]);

      if (!can(auth, PERMISSIONS.ORDERS_VIEW_ALL)) {
        const mine = items.some(
          (i) => i.staff.some((s) => s.id === auth.employeeId) || i.staff.length === 0,
        );
        if (!mine) throw new NotFoundException('La orden no existe');
      }

      return {
        ...order.order,
        motorcycle: order.moto,
        customer: order.customer?.id ? order.customer : null,
        spotCode: order.spotCode,
        items,
        belongings,
        parkingSession: session ?? null,
        payment: paid[0] ?? null,
        history,
      };
    });
  }

  // ------------------------------------------------------------------
  // Ejecución de ítems (SPEC §4.3)
  // ------------------------------------------------------------------
  async startItem(auth: AuthContext, itemId: string) {
    return this.db.withTenant(this.scope(auth), async (tx) => {
      const { item, order } = await lockItem(tx, itemId);
      assertOrderOpen(order.status);
      if (!canStartItem(item.status)) throw new ConflictException('Este servicio ya fue iniciado');

      const staff = await itemStaff(tx, itemId);
      await this.assertCanExecute(tx, auth, itemId, staff);
      if (staff.length === 0 && auth.employeeId) {
        // El lavador que inicia un servicio libre queda asignado.
        await tx.insert(workOrderItemStaff).values({
          tenantId: auth.tenantId,
          itemId,
          employeeId: auth.employeeId,
        });
      }

      await tx
        .update(workOrderItems)
        .set({ status: 'IN_PROGRESS', startedAt: new Date(), startedBy: auth.userId })
        .where(eq(workOrderItems.id, itemId));
      const status = await refreshStatus(tx, auth, order.id);
      await this.audit.log(tx, auth, {
        entity: 'work_order_item',
        entityId: itemId,
        branchId: order.branchId,
        action: 'START',
        before: { status: item.status },
        after: { status: 'IN_PROGRESS' },
      });
      return { itemStatus: 'IN_PROGRESS' as const, orderStatus: status };
    });
  }

  async finishItem(auth: AuthContext, itemId: string) {
    return this.db.withTenant(this.scope(auth), async (tx) => {
      const { item, order } = await lockItem(tx, itemId);
      assertOrderOpen(order.status);
      if (!canFinishItem(item.status))
        throw new ConflictException('Este servicio no está en curso');
      await this.assertCanExecute(tx, auth, itemId, await itemStaff(tx, itemId));

      await tx
        .update(workOrderItems)
        .set({ status: 'DONE', finishedAt: new Date(), finishedBy: auth.userId })
        .where(eq(workOrderItems.id, itemId));
      // Fase 2: aquí se descuentan los insumos según la receta (SPEC regla 4).
      const status = await refreshStatus(tx, auth, order.id);
      await this.audit.log(tx, auth, {
        entity: 'work_order_item',
        entityId: itemId,
        branchId: order.branchId,
        action: 'FINISH',
        before: { status: item.status },
        after: { status: 'DONE' },
      });
      return { itemStatus: 'DONE' as const, orderStatus: status };
    });
  }

  async assignStaff(auth: AuthContext, itemId: string, employeeIds: string[]) {
    return this.db.withTenant(this.scope(auth), async (tx) => {
      const { item, order } = await lockItem(tx, itemId);
      assertOrderOpen(order.status);
      if (item.status === 'DONE' || item.status === 'CANCELLED') {
        throw new ConflictException('El servicio ya terminó');
      }
      const unique = [...new Set(employeeIds)];
      await assertEmployees(tx, unique);
      const before = await itemStaff(tx, itemId);
      await tx.delete(workOrderItemStaff).where(eq(workOrderItemStaff.itemId, itemId));
      await tx.insert(workOrderItemStaff).values(
        unique.map((employeeId) => ({
          tenantId: auth.tenantId,
          itemId,
          employeeId,
          sharePercent: Math.floor(100 / unique.length),
        })),
      );
      await this.audit.log(tx, auth, {
        entity: 'work_order_item',
        entityId: itemId,
        branchId: order.branchId,
        action: 'ASSIGN_STAFF',
        before: { employeeIds: before.map((s) => s.id) },
        after: { employeeIds: unique },
      });
      return { employeeIds: unique };
    });
  }

  async addItem(auth: AuthContext, orderId: string, serviceId: string) {
    return this.db.withTenant(this.scope(auth), async (tx) => {
      const order = await lockOrder(tx, orderId);
      assertOrderOpen(order.status);
      if (order.paidAt) throw new ConflictException('La orden ya fue pagada');
      if (order.type === 'PARKING') {
        throw new BadRequestException('Una orden solo de parqueo no lleva servicios');
      }
      const [service] = await loadServices(tx, order.branchId, [serviceId]);
      if (!service) throw new BadRequestException('El servicio no existe o está inactivo');
      const [moto] = await tx
        .select({ cc: motorcycles.cc })
        .from(motorcycles)
        .where(eq(motorcycles.id, order.motorcycleId));
      const [item] = await tx
        .insert(workOrderItems)
        .values({
          tenantId: auth.tenantId,
          workOrderId: orderId,
          serviceId,
          description: service.name,
          estimatedMinutes: service.estimatedMinutes,
          unitPrice: priceOf(service, moto?.cc ?? null),
          createdBy: auth.userId,
        })
        .returning();
      const status = await refreshStatus(tx, auth, orderId);
      await this.audit.log(tx, auth, {
        entity: 'work_order',
        entityId: orderId,
        branchId: order.branchId,
        action: 'ADD_ITEM',
        after: { itemId: item!.id, service: service.name, price: item!.unitPrice },
      });
      return { itemId: item!.id, orderStatus: status };
    });
  }

  /** Quitar un servicio: libre si no ha iniciado; si ya inició requiere `orders.cancel`. */
  async cancelItem(auth: AuthContext, itemId: string, reason: string) {
    return this.db.withTenant(this.scope(auth), async (tx) => {
      const { item, order } = await lockItem(tx, itemId);
      assertOrderOpen(order.status);
      if (order.paidAt) throw new ConflictException('La orden ya fue pagada');
      if (item.status === 'CANCELLED') throw new ConflictException('El servicio ya está cancelado');
      if (item.status !== 'PENDING' && !can(auth, PERMISSIONS.ORDERS_CANCEL)) {
        throw new ForbiddenException('Solo un supervisor puede quitar un servicio ya iniciado');
      }
      await tx
        .update(workOrderItems)
        .set({
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy: auth.userId,
          cancelReason: reason,
        })
        .where(eq(workOrderItems.id, itemId));
      // Regla 4: si el ítem ya estaba DONE, el consumo de insumos no se revierte.
      const status = await refreshStatus(tx, auth, order.id);
      await this.audit.log(tx, auth, {
        entity: 'work_order_item',
        entityId: itemId,
        branchId: order.branchId,
        action: 'CANCEL',
        before: { status: item.status },
        after: { status: 'CANCELLED' },
        reason,
      });
      return { itemStatus: 'CANCELLED' as const, orderStatus: status };
    });
  }

  // ------------------------------------------------------------------
  // Cancelar y entregar (SPEC §7, regla 2)
  // ------------------------------------------------------------------
  async cancel(auth: AuthContext, orderId: string, reason: string) {
    return this.db.withTenant(this.scope(auth), async (tx) => {
      const order = await lockOrder(tx, orderId);
      if (!canTransition(order.status, 'CANCELLED') || order.status === 'CANCELLED') {
        throw new ConflictException('La orden ya está cerrada');
      }
      if (order.paidAt) throw new ConflictException('Primero anula el pago de la orden');
      const now = new Date();
      await tx
        .update(workOrders)
        .set({
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledBy: auth.userId,
          cancelReason: reason,
        })
        .where(eq(workOrders.id, orderId));
      await tx
        .update(workOrderItems)
        .set({
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledBy: auth.userId,
          cancelReason: reason,
        })
        .where(
          and(
            eq(workOrderItems.workOrderId, orderId),
            inArray(workOrderItems.status, ['PENDING', 'IN_PROGRESS']),
          ),
        );
      await tx
        .update(parkingSessions)
        .set({ exitAt: now, amount: 0 })
        .where(and(eq(parkingSessions.workOrderId, orderId), isNull(parkingSessions.exitAt)));
      await recordStatus(tx, auth, orderId, order.status, 'CANCELLED');
      await this.audit.log(tx, auth, {
        entity: 'work_order',
        entityId: orderId,
        branchId: order.branchId,
        action: 'CANCEL',
        before: { status: order.status },
        after: { status: 'CANCELLED' },
        reason,
      });
      return { status: 'CANCELLED' as const };
    });
  }

  async deliver(auth: AuthContext, orderId: string) {
    return this.db.withTenant(this.scope(auth), async (tx) => {
      const order = await lockOrder(tx, orderId);
      if (order.status !== 'READY') {
        throw new ConflictException('La moto todavía no está lista para entregar');
      }
      // Regla 2: no se entrega sin pago completo (cuentas por cobrar en Fase 2).
      const [paid] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.workOrderId, orderId), eq(payments.status, 'PAID')))
        .limit(1);
      if (!paid) throw new ConflictException('La orden no está pagada');

      const now = new Date();
      await tx
        .update(workOrderBelongings)
        .set({ returned: true, returnedAt: now })
        .where(
          and(
            eq(workOrderBelongings.workOrderId, orderId),
            eq(workOrderBelongings.returned, false),
          ),
        );
      await tx
        .update(workOrders)
        .set({ status: 'DELIVERED', deliveredAt: now, deliveredBy: auth.userId })
        .where(eq(workOrders.id, orderId));
      await recordStatus(tx, auth, orderId, order.status, 'DELIVERED');
      await this.audit.log(tx, auth, {
        entity: 'work_order',
        entityId: orderId,
        branchId: order.branchId,
        action: 'DELIVER',
        before: { status: order.status },
        after: { status: 'DELIVERED' },
      });
      return { status: 'DELIVERED' as const };
    });
  }

  /** El lavador solo ejecuta servicios suyos o libres; recepción y supervisión, cualquiera. */
  private async assertCanExecute(
    _tx: Tx,
    auth: AuthContext,
    _itemId: string,
    staff: { id: string }[],
  ) {
    if (can(auth, PERMISSIONS.ORDERS_VIEW_ALL)) return;
    if (staff.length === 0 || staff.some((s) => s.id === auth.employeeId)) return;
    throw new ForbiddenException('Este servicio está asignado a otro lavador');
  }
}

// ----------------------------------------------------------------------
// Ayudantes (dentro de la transacción del llamador)
// ----------------------------------------------------------------------

async function upsertMotorcycle(tx: Tx, auth: AuthContext, input: CheckInInput) {
  const [existing] = await tx
    .select()
    .from(motorcycles)
    .where(and(eq(motorcycles.plate, input.plate), isNull(motorcycles.deletedAt)))
    .limit(1);
  const data = input.motorcycle ?? {};
  if (existing) {
    // Completa los datos que falten (no pisa lo que ya estaba).
    const patch = {
      brand: existing.brand ?? data.brand ?? null,
      model: existing.model ?? data.model ?? null,
      cc: existing.cc ?? data.cc ?? null,
      color: existing.color ?? data.color ?? null,
    };
    if (
      patch.brand !== existing.brand ||
      patch.model !== existing.model ||
      patch.cc !== existing.cc ||
      patch.color !== existing.color
    ) {
      await tx.update(motorcycles).set(patch).where(eq(motorcycles.id, existing.id));
    }
    return { ...existing, ...patch };
  }
  const [created] = await tx
    .insert(motorcycles)
    .values({
      tenantId: auth.tenantId,
      plate: input.plate,
      brand: data.brand ?? null,
      model: data.model ?? null,
      cc: data.cc ?? null,
      color: data.color ?? null,
      createdBy: auth.userId,
    })
    .returning();
  return created!;
}

/** Cliente existente, o creado por teléfono (mínimo), y vinculado a la moto. */
async function resolveCustomer(
  tx: Tx,
  auth: AuthContext,
  motorcycleId: string,
  input: CheckInInput,
): Promise<string | null> {
  let customerId = input.customerId ?? null;
  if (!customerId && input.customer) {
    const [byPhone] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.phone, input.customer.phone), isNull(customers.deletedAt)))
      .limit(1);
    customerId =
      byPhone?.id ??
      (
        await tx
          .insert(customers)
          .values({
            tenantId: auth.tenantId,
            fullName: input.customer.fullName ?? 'Cliente sin nombre',
            phone: input.customer.phone,
            createdBy: auth.userId,
          })
          .returning({ id: customers.id })
      )[0]!.id;
  }
  if (!customerId) {
    // Sin datos de cliente: usa el propietario registrado de la moto, si hay.
    const [owner] = await tx
      .select({ id: customerMotorcycles.customerId })
      .from(customerMotorcycles)
      .where(eq(customerMotorcycles.motorcycleId, motorcycleId))
      .limit(1);
    return owner?.id ?? null;
  }
  await tx
    .insert(customerMotorcycles)
    .values({ tenantId: auth.tenantId, customerId, motorcycleId, relation: 'OWNER' })
    .onConflictDoNothing();
  return customerId;
}

async function assertEmployees(tx: Tx, ids: string[]) {
  if (ids.length === 0) return;
  const found = await tx
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(inArray(employees.id, ids), eq(employees.active, true), isNull(employees.deletedAt)),
    );
  if (found.length !== new Set(ids).size) {
    throw new BadRequestException('Alguno de los lavadores no existe o está inactivo');
  }
}

async function lockOrder(tx: Tx, orderId: string) {
  const [order] = await tx
    .select()
    .from(workOrders)
    .where(eq(workOrders.id, orderId))
    .for('update')
    .limit(1);
  if (!order) throw new NotFoundException('La orden no existe');
  return order;
}

async function lockItem(tx: Tx, itemId: string) {
  const [item] = await tx
    .select()
    .from(workOrderItems)
    .where(eq(workOrderItems.id, itemId))
    .limit(1);
  if (!item) throw new NotFoundException('El servicio no existe');
  const order = await lockOrder(tx, item.workOrderId);
  return { item, order };
}

function assertOrderOpen(status: WorkOrderStatus) {
  if (status === 'DELIVERED' || status === 'CANCELLED') {
    throw new ConflictException('La orden ya está cerrada');
  }
}

async function itemStaff(tx: Tx, itemId: string) {
  return tx
    .select({ id: employees.id, fullName: employees.fullName })
    .from(workOrderItemStaff)
    .innerJoin(employees, eq(employees.id, workOrderItemStaff.employeeId))
    .where(eq(workOrderItemStaff.itemId, itemId));
}

export async function loadItems(tx: Tx, orderIds: string[]) {
  if (orderIds.length === 0) return [];
  const [items, staff] = await Promise.all([
    tx
      .select()
      .from(workOrderItems)
      .where(inArray(workOrderItems.workOrderId, orderIds))
      .orderBy(asc(workOrderItems.createdAt)),
    tx
      .select({
        itemId: workOrderItemStaff.itemId,
        id: employees.id,
        fullName: employees.fullName,
      })
      .from(workOrderItemStaff)
      .innerJoin(employees, eq(employees.id, workOrderItemStaff.employeeId))
      .innerJoin(workOrderItems, eq(workOrderItems.id, workOrderItemStaff.itemId))
      .where(inArray(workOrderItems.workOrderId, orderIds)),
  ]);
  return items.map((i) => ({
    ...i,
    staff: staff.filter((s) => s.itemId === i.id).map(({ id, fullName }) => ({ id, fullName })),
  }));
}

async function recordStatus(
  tx: Tx,
  auth: AuthContext,
  orderId: string,
  from: WorkOrderStatus,
  to: WorkOrderStatus,
) {
  await tx.insert(workOrderStatusHistory).values({
    tenantId: auth.tenantId,
    workOrderId: orderId,
    fromStatus: from,
    toStatus: to,
    userId: auth.userId,
  });
}

/** Recalcula el estado de la orden desde sus ítems y registra el cambio. */
export async function refreshStatus(tx: Tx, auth: AuthContext, orderId: string) {
  const [order] = await tx
    .select({ status: workOrders.status, readyAt: workOrders.readyAt })
    .from(workOrders)
    .where(eq(workOrders.id, orderId));
  const items = await tx
    .select({ status: workOrderItems.status })
    .from(workOrderItems)
    .where(eq(workOrderItems.workOrderId, orderId));
  const next = deriveStatus(
    order!.status,
    items.map((i) => i.status as ItemStatus),
  );
  if (next !== order!.status) {
    await tx
      .update(workOrders)
      .set({ status: next, readyAt: next === 'READY' ? new Date() : null })
      .where(eq(workOrders.id, orderId));
    await recordStatus(tx, auth, orderId, order!.status, next);
  }
  return next;
}
