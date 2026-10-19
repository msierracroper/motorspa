/** Órdenes de trabajo: estados, transiciones y estado derivado de los ítems (SPEC §7). */

export const WORK_ORDER_STATUSES = [
  'RECEIVED',
  'QUEUED',
  'IN_PROGRESS',
  'READY',
  'DELIVERED',
  'CANCELLED',
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const ACTIVE_WORK_ORDER_STATUSES: readonly WorkOrderStatus[] = [
  'RECEIVED',
  'QUEUED',
  'IN_PROGRESS',
  'READY',
];

export const WORK_ORDER_TYPES = ['WASH', 'PARKING', 'WASH_PARKING'] as const;
export type WorkOrderType = (typeof WORK_ORDER_TYPES)[number];

export const ITEM_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  RECEIVED: 'Recibida',
  QUEUED: 'En cola',
  IN_PROGRESS: 'Lavando',
  READY: 'Lista',
  DELIVERED: 'Entregada',
  CANCELLED: 'Cancelada',
};

export const WORK_ORDER_TYPE_LABEL: Record<WorkOrderType, string> = {
  WASH: 'Lavado',
  PARKING: 'Parqueo',
  WASH_PARKING: 'Lavado + parqueo',
};

const TRANSITIONS: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  RECEIVED: ['QUEUED', 'READY', 'CANCELLED'],
  QUEUED: ['IN_PROGRESS', 'READY', 'CANCELLED'],
  IN_PROGRESS: ['QUEUED', 'READY', 'CANCELLED'],
  READY: ['IN_PROGRESS', 'QUEUED', 'DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function isActive(status: WorkOrderStatus): boolean {
  return ACTIVE_WORK_ORDER_STATUSES.includes(status);
}

/**
 * Estado de la orden según sus ítems:
 * - sin ítems (solo parqueo) → READY (lista para retirar)
 * - todos DONE o CANCELLED → READY
 * - alguno iniciado o terminado → IN_PROGRESS
 * - todos pendientes → QUEUED
 * Entregada y cancelada no cambian.
 */
export function deriveStatus(
  current: WorkOrderStatus,
  items: readonly ItemStatus[],
): WorkOrderStatus {
  if (current === 'DELIVERED' || current === 'CANCELLED') return current;
  if (items.length === 0) return 'READY';
  if (items.every((s) => s === 'DONE' || s === 'CANCELLED')) return 'READY';
  if (items.some((s) => s === 'IN_PROGRESS' || s === 'DONE')) return 'IN_PROGRESS';
  return 'QUEUED';
}

export function canStartItem(item: ItemStatus): boolean {
  return item === 'PENDING';
}

export function canFinishItem(item: ItemStatus): boolean {
  return item === 'IN_PROGRESS';
}

/** Precio por rango de cilindraje (SPEC §4.5). `cc` null usa el precio único (sin rango). */
export interface PriceRange {
  ccMin: number | null;
  ccMax: number | null;
  price: number;
}

export function priceForCc(prices: readonly PriceRange[], cc: number | null): number | null {
  const match = prices.find(
    (p) =>
      cc !== null &&
      (p.ccMin === null || cc >= p.ccMin) &&
      (p.ccMax === null || cc <= p.ccMax) &&
      (p.ccMin !== null || p.ccMax !== null),
  );
  if (match) return match.price;
  const flat = prices.find((p) => p.ccMin === null && p.ccMax === null);
  if (flat) return flat.price;
  // Sin cilindraje conocido: el rango más bajo.
  if (cc === null && prices.length > 0) {
    return [...prices].sort((a, b) => (a.ccMin ?? 0) - (b.ccMin ?? 0))[0]!.price;
  }
  return null;
}
