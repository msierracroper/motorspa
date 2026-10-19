/**
 * Espejo en Drizzle del esquema SQL. La fuente de verdad son las migraciones
 * en supabase/migrations (decisión 14); este archivo solo se usa para consultas.
 */
import {
  boolean,
  inet,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  nit: text('nit'),
  logoUrl: text('logo_url'),
  settings: jsonb('settings').notNull().default({}),
  plan: text('plan').notNull().default('basic'),
  status: text('status', { enum: ['ACTIVE', 'SUSPENDED'] })
    .notNull()
    .default('ACTIVE'),
  ...timestamps,
});

export const branches = pgTable('branches', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  address: text('address'),
  phone: text('phone'),
  openingHours: jsonb('opening_hours').notNull().default({}),
  settings: jsonb('settings').notNull().default({}),
  ...timestamps,
  createdBy: uuid('created_by'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  authUserId: uuid('auth_user_id').notNull().unique(),
  username: text('username').notNull(),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  pinHash: text('pin_hash'),
  status: text('status', { enum: ['ACTIVE', 'INACTIVE'] })
    .notNull()
    .default('ACTIVE'),
  ...timestamps,
  createdBy: uuid('created_by'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const permissions = pgTable('permissions', {
  code: text('code').primaryKey(),
  description: text('description').notNull(),
});

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  isSystem: boolean('is_system').notNull().default(false),
  ...timestamps,
  createdBy: uuid('created_by'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    tenantId: uuid('tenant_id').notNull(),
    roleId: uuid('role_id').notNull(),
    permissionCode: text('permission_code').notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionCode] })],
);

export const userBranchRoles = pgTable('user_branch_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  userId: uuid('user_id').notNull(),
  branchId: uuid('branch_id').notNull(),
  roleId: uuid('role_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  userId: uuid('user_id'),
  branchId: uuid('branch_id'),
  entity: text('entity').notNull(),
  entityId: uuid('entity_id'),
  action: text('action').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  reason: text('reason'),
  ip: inet('ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
