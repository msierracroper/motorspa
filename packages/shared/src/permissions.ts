/**
 * Catálogo fijo de permisos (SPEC sección 8).
 * Debe coincidir con los registros sembrados en la tabla `permissions`.
 */
export const PERMISSIONS = {
  SETTINGS_MANAGE: 'settings.manage',
  USERS_MANAGE: 'users.manage',
  ORDERS_CHECKIN: 'orders.checkin',
  ORDERS_VIEW_ALL: 'orders.view_all',
  ORDERS_VIEW_OWN: 'orders.view_own',
  ORDERS_EXECUTE: 'orders.execute',
  ORDERS_REASSIGN: 'orders.reassign',
  ORDERS_CANCEL: 'orders.cancel',
  CASH_SHIFT: 'cash.shift',
  PAYMENTS_CHARGE: 'payments.charge',
  DISCOUNTS_APPLY: 'discounts.apply',
  DISCOUNTS_AUTHORIZE: 'discounts.authorize',
  PAYMENTS_VOID: 'payments.void',
  EXPENSES_CASH: 'expenses.cash',
  EXPENSES_ADMIN: 'expenses.admin',
  INVENTORY_PURCHASE: 'inventory.purchase',
  INVENTORY_ADJUST: 'inventory.adjust',
  APPOINTMENTS_MANAGE: 'appointments.manage',
  COMMISSIONS_SETTLE: 'commissions.settle',
  COMMISSIONS_VIEW_OWN: 'commissions.view_own',
  REPORTS_OPERATIONS: 'reports.operations',
  REPORTS_OPERATIONS_OWN_SHIFT: 'reports.operations_own_shift',
  REPORTS_FINANCE: 'reports.finance',
  AUDIT_VIEW: 'audit.view',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const SYSTEM_ROLES = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  CASHIER: 'Cajero/Recepción',
  WASHER: 'Lavador',
} as const;

export type SystemRoleName = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

const P = PERMISSIONS;

/** Permisos por rol predefinido (SPEC sección 8). */
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRoleName, readonly PermissionCode[]> = {
  [SYSTEM_ROLES.ADMIN]: Object.values(P).filter(
    (p) =>
      p !== P.ORDERS_VIEW_OWN &&
      p !== P.COMMISSIONS_VIEW_OWN &&
      p !== P.REPORTS_OPERATIONS_OWN_SHIFT,
  ),
  [SYSTEM_ROLES.SUPERVISOR]: [
    P.ORDERS_CHECKIN,
    P.ORDERS_VIEW_ALL,
    P.ORDERS_EXECUTE,
    P.ORDERS_REASSIGN,
    P.ORDERS_CANCEL,
    P.CASH_SHIFT,
    P.PAYMENTS_CHARGE,
    P.DISCOUNTS_APPLY,
    P.DISCOUNTS_AUTHORIZE,
    P.PAYMENTS_VOID,
    P.EXPENSES_CASH,
    P.INVENTORY_PURCHASE,
    P.INVENTORY_ADJUST,
    P.APPOINTMENTS_MANAGE,
    P.REPORTS_OPERATIONS,
  ],
  [SYSTEM_ROLES.CASHIER]: [
    P.ORDERS_CHECKIN,
    P.ORDERS_VIEW_ALL,
    P.ORDERS_EXECUTE,
    P.ORDERS_REASSIGN,
    P.CASH_SHIFT,
    P.PAYMENTS_CHARGE,
    P.DISCOUNTS_APPLY,
    P.EXPENSES_CASH,
    P.APPOINTMENTS_MANAGE,
    P.REPORTS_OPERATIONS_OWN_SHIFT,
  ],
  [SYSTEM_ROLES.WASHER]: [P.ORDERS_VIEW_OWN, P.ORDERS_EXECUTE, P.COMMISSIONS_VIEW_OWN],
};

/** Dominio interno para los correos sintéticos de Supabase Auth (decisión 13). */
export const INTERNAL_EMAIL_DOMAIN = 'motospa.local';

export const usernameToEmail = (username: string) =>
  `${username.trim().toLowerCase()}@${INTERNAL_EMAIL_DOMAIN}`;
