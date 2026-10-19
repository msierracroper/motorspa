import { PERMISSIONS as P, type PermissionCode } from '@motospa/shared';

export interface NavItem {
  href: string;
  label: string;
  /** Se muestra si el usuario tiene AL MENOS uno. Vacío = todos. */
  anyOf: PermissionCode[];
  /** Fase del SPEC en la que se construye (sección 13). */
  phase: number;
}

/** Pantallas principales (SPEC sección 10). */
export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Inicio', anyOf: [], phase: 1 },
  { href: '/recepcion', label: 'Recepción', anyOf: [P.ORDERS_CHECKIN], phase: 1 },
  { href: '/ordenes', label: 'Órdenes', anyOf: [P.ORDERS_VIEW_ALL], phase: 1 },
  { href: '/mis-servicios', label: 'Mis servicios', anyOf: [P.ORDERS_VIEW_OWN], phase: 1 },
  { href: '/caja', label: 'Caja', anyOf: [P.CASH_SHIFT], phase: 1 },
  { href: '/parqueadero', label: 'Parqueadero', anyOf: [P.ORDERS_CHECKIN], phase: 1 },
  { href: '/clientes', label: 'Clientes y motos', anyOf: [P.ORDERS_CHECKIN], phase: 1 },
  { href: '/catalogo', label: 'Catálogo', anyOf: [P.SETTINGS_MANAGE], phase: 1 },
  { href: '/agenda', label: 'Agenda', anyOf: [P.APPOINTMENTS_MANAGE], phase: 3 },
  {
    href: '/inventario',
    label: 'Inventario',
    anyOf: [P.INVENTORY_PURCHASE, P.INVENTORY_ADJUST],
    phase: 2,
  },
  { href: '/gastos', label: 'Gastos', anyOf: [P.EXPENSES_CASH, P.EXPENSES_ADMIN], phase: 2 },
  { href: '/personal', label: 'Personal y comisiones', anyOf: [P.COMMISSIONS_SETTLE], phase: 2 },
  {
    href: '/reportes',
    label: 'Reportes',
    anyOf: [P.REPORTS_OPERATIONS, P.REPORTS_OPERATIONS_OWN_SHIFT, P.REPORTS_FINANCE],
    phase: 1,
  },
  {
    href: '/configuracion',
    label: 'Configuración',
    anyOf: [P.SETTINGS_MANAGE, P.USERS_MANAGE],
    phase: 0,
  },
  { href: '/auditoria', label: 'Auditoría', anyOf: [P.AUDIT_VIEW], phase: 0 },
];

export function visibleNavItems(permissions: readonly PermissionCode[]): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => item.anyOf.length === 0 || item.anyOf.some((p) => permissions.includes(p)),
  );
}
