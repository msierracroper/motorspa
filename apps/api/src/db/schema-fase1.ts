/**
 * Espejo en Drizzle de la migración 20261019220631_fase1_operations.sql.
 * La fuente de verdad es el SQL; este archivo solo se usa para consultas.
 */
import {
  bigint,
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true });
const timestamps = {
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
};

// --- Clientes y motos ---
export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  documentType: text('document_type'),
  documentNumber: text('document_number'),
  email: text('email'),
  notes: text('notes'),
  marketingOptIn: boolean('marketing_opt_in').notNull().default(false),
  ...timestamps,
  createdBy: uuid('created_by'),
  deletedAt: ts('deleted_at'),
});

export const motorcycles = pgTable('motorcycles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  plate: text('plate').notNull(),
  brand: text('brand'),
  model: text('model'),
  cc: integer('cc'),
  color: text('color'),
  year: integer('year'),
  notes: text('notes'),
  ...timestamps,
  createdBy: uuid('created_by'),
  deletedAt: ts('deleted_at'),
});

export const customerMotorcycles = pgTable(
  'customer_motorcycles',
  {
    tenantId: uuid('tenant_id').notNull(),
    customerId: uuid('customer_id').notNull(),
    motorcycleId: uuid('motorcycle_id').notNull(),
    relation: text('relation', { enum: ['OWNER', 'DRIVER', 'OTHER'] })
      .notNull()
      .default('OWNER'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.customerId, t.motorcycleId] })],
);

// --- Catálogo ---
export const serviceCategories = pgTable('service_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
  deletedAt: ts('deleted_at'),
});

export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  categoryId: uuid('category_id'),
  name: text('name').notNull(),
  description: text('description'),
  estimatedMinutes: integer('estimated_minutes').notNull().default(30),
  commissionType: text('commission_type', { enum: ['PERCENT', 'FIXED'] })
    .notNull()
    .default('PERCENT'),
  commissionValue: integer('commission_value').notNull().default(0),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
  createdBy: uuid('created_by'),
  deletedAt: ts('deleted_at'),
});

export const servicePrices = pgTable('service_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  serviceId: uuid('service_id').notNull(),
  branchId: uuid('branch_id'),
  ccMin: integer('cc_min'),
  ccMax: integer('cc_max'),
  price: integer('price').notNull(),
  ...timestamps,
});

// --- Personal ---
export const employees = pgTable('employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  userId: uuid('user_id'),
  fullName: text('full_name').notNull(),
  document: text('document'),
  phone: text('phone'),
  active: boolean('active').notNull().default(true),
  defaultCommissionRule: jsonb('default_commission_rule').notNull().default({}),
  ...timestamps,
  createdBy: uuid('created_by'),
  deletedAt: ts('deleted_at'),
});

// --- Parqueadero ---
export const parkingSpots = pgTable('parking_spots', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  branchId: uuid('branch_id').notNull(),
  code: text('code').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const parkingRates = pgTable('parking_rates', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  branchId: uuid('branch_id').notNull(),
  name: text('name').notNull(),
  mode: text('mode', { enum: ['MINUTE', 'FRACTION', 'HOUR', 'DAY'] }).notNull(),
  fractionMinutes: integer('fraction_minutes'),
  pricePerUnit: integer('price_per_unit').notNull(),
  graceMinutes: integer('grace_minutes').notNull().default(0),
  dailyCap: integer('daily_cap'),
  nightStart: time('night_start'),
  nightEnd: time('night_end'),
  nightPrice: integer('night_price'),
  courtesyMinutes: integer('courtesy_minutes').notNull().default(0),
  active: boolean('active').notNull().default(true),
  ...timestamps,
});

// --- Órdenes ---
export const workOrders = pgTable('work_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  branchId: uuid('branch_id').notNull(),
  number: bigint('number', { mode: 'number' }).notNull(),
  motorcycleId: uuid('motorcycle_id').notNull(),
  customerId: uuid('customer_id'),
  type: text('type', { enum: ['WASH', 'PARKING', 'WASH_PARKING'] }).notNull(),
  status: text('status', {
    enum: ['RECEIVED', 'QUEUED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED'],
  })
    .notNull()
    .default('RECEIVED'),
  appointmentId: uuid('appointment_id'),
  parkingSpotId: uuid('parking_spot_id'),
  checkedInAt: ts('checked_in_at').notNull().defaultNow(),
  checkedInBy: uuid('checked_in_by').notNull(),
  readyAt: ts('ready_at'),
  deliveredAt: ts('delivered_at'),
  deliveredBy: uuid('delivered_by'),
  cancelledAt: ts('cancelled_at'),
  cancelledBy: uuid('cancelled_by'),
  cancelReason: text('cancel_reason'),
  mileage: integer('mileage'),
  fuelLevel: text('fuel_level', { enum: ['EMPTY', 'QUARTER', 'HALF', 'THREE_QUARTERS', 'FULL'] }),
  damageNotes: text('damage_notes'),
  notes: text('notes'),
  paidAt: ts('paid_at'),
  ...timestamps,
  createdBy: uuid('created_by'),
});

export const workOrderItems = pgTable('work_order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  workOrderId: uuid('work_order_id').notNull(),
  serviceId: uuid('service_id').notNull(),
  description: text('description').notNull(),
  estimatedMinutes: integer('estimated_minutes').notNull(),
  unitPrice: integer('unit_price').notNull(),
  status: text('status', { enum: ['PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED'] })
    .notNull()
    .default('PENDING'),
  startedAt: ts('started_at'),
  startedBy: uuid('started_by'),
  finishedAt: ts('finished_at'),
  finishedBy: uuid('finished_by'),
  cancelledAt: ts('cancelled_at'),
  cancelledBy: uuid('cancelled_by'),
  cancelReason: text('cancel_reason'),
  ...timestamps,
  createdBy: uuid('created_by'),
});

export const workOrderItemStaff = pgTable(
  'work_order_item_staff',
  {
    tenantId: uuid('tenant_id').notNull(),
    itemId: uuid('item_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    sharePercent: integer('share_percent').notNull().default(100),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.employeeId] })],
);

export const workOrderBelongings = pgTable('work_order_belongings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  workOrderId: uuid('work_order_id').notNull(),
  item: text('item').notNull(),
  quantity: integer('quantity').notNull().default(1),
  returned: boolean('returned').notNull().default(false),
  returnedAt: ts('returned_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const workOrderStatusHistory = pgTable('work_order_status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  workOrderId: uuid('work_order_id').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  userId: uuid('user_id'),
  at: ts('at').notNull().defaultNow(),
});

export const parkingSessions = pgTable('parking_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  branchId: uuid('branch_id').notNull(),
  workOrderId: uuid('work_order_id').notNull(),
  spotId: uuid('spot_id'),
  rateId: uuid('rate_id').notNull(),
  entryAt: ts('entry_at').notNull().defaultNow(),
  exitAt: ts('exit_at'),
  minutes: integer('minutes'),
  courtesyMinutes: integer('courtesy_minutes'),
  amount: integer('amount'),
  monthlyPlanId: uuid('monthly_plan_id'),
  ...timestamps,
});

// --- Caja ---
export const cashRegisters = pgTable('cash_registers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  branchId: uuid('branch_id').notNull(),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const cashShifts = pgTable('cash_shifts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  branchId: uuid('branch_id').notNull(),
  registerId: uuid('register_id').notNull(),
  status: text('status', { enum: ['OPEN', 'CLOSED'] })
    .notNull()
    .default('OPEN'),
  openedBy: uuid('opened_by').notNull(),
  openedAt: ts('opened_at').notNull().defaultNow(),
  openingAmount: integer('opening_amount').notNull(),
  closedBy: uuid('closed_by'),
  closedAt: ts('closed_at'),
  expected: jsonb('expected').$type<Record<string, number>>(),
  counted: jsonb('counted').$type<Record<string, number>>(),
  difference: integer('difference'),
  notes: text('notes'),
  ...timestamps,
});

export const paymentMethods = pgTable('payment_methods', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  type: text('type', { enum: ['CASH', 'DIGITAL', 'CARD', 'OTHER'] }).notNull(),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  branchId: uuid('branch_id').notNull(),
  shiftId: uuid('shift_id').notNull(),
  workOrderId: uuid('work_order_id'),
  number: bigint('number', { mode: 'number' }).notNull(),
  servicesAmount: integer('services_amount').notNull(),
  parkingAmount: integer('parking_amount').notNull().default(0),
  subtotal: integer('subtotal').notNull(),
  discount: integer('discount').notNull().default(0),
  total: integer('total').notNull(),
  discountReason: text('discount_reason'),
  discountAuthorizedBy: uuid('discount_authorized_by'),
  status: text('status', { enum: ['PAID', 'VOIDED'] })
    .notNull()
    .default('PAID'),
  voidedAt: ts('voided_at'),
  voidedBy: uuid('voided_by'),
  voidReason: text('void_reason'),
  createdAt: ts('created_at').notNull().defaultNow(),
  createdBy: uuid('created_by').notNull(),
});

export const paymentLines = pgTable('payment_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  paymentId: uuid('payment_id').notNull(),
  paymentMethodId: uuid('payment_method_id').notNull(),
  amount: integer('amount').notNull(),
  reference: text('reference'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const cashMovements = pgTable('cash_movements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  shiftId: uuid('shift_id').notNull(),
  type: text('type', { enum: ['INCOME', 'EXPENSE'] }).notNull(),
  category: text('category').notNull(),
  amount: integer('amount').notNull(),
  description: text('description').notNull(),
  referenceType: text('reference_type'),
  referenceId: uuid('reference_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
  createdBy: uuid('created_by').notNull(),
});

export const discountRules = pgTable('discount_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  roleId: uuid('role_id').notNull(),
  maxPercent: numeric('max_percent', { precision: 5, scale: 2, mode: 'number' }).notNull(),
  maxAmount: integer('max_amount'),
  ...timestamps,
});
