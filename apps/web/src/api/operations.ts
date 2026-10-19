/**
 * Hooks de datos de la Fase 1. Las pantallas usan estos hooks; nunca `fetch` directo.
 * Tablero y detalle se refrescan cada 10 s (SPEC decisión 9).
 */
import type {
  CashMovementInput,
  ChargeInput,
  CheckInInput,
  CloseShiftInput,
  ItemStatus,
  OpenShiftInput,
  ParkingQuote,
  PriceRange,
  WorkOrderStatus,
  WorkOrderType,
} from '@motospa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiSend } from './client';

export const LIVE_INTERVAL = 10_000;

// ------------------------------------------------------------------ tipos
export interface CatalogService {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  estimatedMinutes: number;
  prices: PriceRange[];
}

export interface Employee {
  id: string;
  fullName: string;
  userId: string | null;
}

export interface PlateSearch {
  plate: string;
  motorcycle: {
    id: string;
    plate: string;
    brand: string | null;
    model: string | null;
    cc: number | null;
    color: string | null;
    notes: string | null;
  } | null;
  customers: { id: string; fullName: string; phone: string | null; relation: string }[];
  activeOrder: { id: string; number: number; status: WorkOrderStatus } | null;
  visits: number;
  lastVisit?: string | null;
}

export interface OrderItem {
  id: string;
  workOrderId: string;
  description: string;
  estimatedMinutes: number;
  unitPrice: number;
  status: ItemStatus;
  startedAt: string | null;
  finishedAt: string | null;
  staff: { id: string; fullName: string }[];
}

export interface BoardOrder {
  id: string;
  number: number;
  type: WorkOrderType;
  status: WorkOrderStatus;
  checkedInAt: string;
  readyAt: string | null;
  paidAt: string | null;
  plate: string;
  brand: string | null;
  model: string | null;
  cc: number | null;
  customerName: string | null;
  customerPhone: string | null;
  spotCode: string | null;
  items: OrderItem[];
}

export interface Payment {
  id: string;
  number: number;
  servicesAmount: number;
  parkingAmount: number;
  subtotal: number;
  discount: number;
  total: number;
  discountReason: string | null;
  status: 'PAID' | 'VOIDED';
  createdAt: string;
}

export interface OrderDetail {
  id: string;
  number: number;
  type: WorkOrderType;
  status: WorkOrderStatus;
  checkedInAt: string;
  readyAt: string | null;
  deliveredAt: string | null;
  paidAt: string | null;
  cancelReason: string | null;
  mileage: number | null;
  fuelLevel: string | null;
  damageNotes: string | null;
  notes: string | null;
  motorcycle: {
    id: string;
    plate: string;
    brand: string | null;
    model: string | null;
    cc: number | null;
    color: string | null;
  };
  customer: { id: string; fullName: string; phone: string | null } | null;
  spotCode: string | null;
  items: OrderItem[];
  belongings: { id: string; item: string; quantity: number; returned: boolean }[];
  parkingSession: {
    id: string;
    entryAt: string;
    exitAt: string | null;
    amount: number | null;
  } | null;
  payment: Payment | null;
  history: { id: string; fromStatus: string | null; toStatus: string; at: string }[];
}

export interface PaymentMethod {
  id: string;
  name: string;
  type: 'CASH' | 'DIGITAL' | 'CARD' | 'OTHER';
}

export interface ShiftSummary {
  expected: Record<string, number>;
  cashMethodId: string;
  payments: number;
  voided: number;
  sales: number;
  income: number;
  expenses: number;
}

export interface Shift {
  id: string;
  registerId: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  openingAmount: number;
  summary: ShiftSummary;
}

export interface ChargePreview {
  workOrderId: string;
  status: WorkOrderStatus;
  servicesAmount: number;
  parking: ParkingQuote | null;
  subtotal: number;
  discountLimit: { maxPercent: number; maxAmount: number | null };
}

export interface Occupancy {
  spots: { id: string; code: string; occupiedBy: OccupantRow | null }[];
  withoutSpot: OccupantRow[];
  totalSpots: number;
  occupied: number;
  parked: number;
}
interface OccupantRow {
  sessionId: string;
  spotId: string | null;
  entryAt: string;
  workOrderId: string;
  number: number;
  status: WorkOrderStatus;
  plate: string;
}

export interface DailyReport {
  date: string;
  scope: 'OWN_SHIFTS' | 'BRANCH';
  orders: { type: WorkOrderType; checkedIn: number; delivered: number; cancelled: number }[];
  sales: { count: number; total: number; services: number; parking: number; discounts: number };
  byMethod: { methodId: string; method: string; total: number }[];
  byService: { service: string; count: number; total: number }[];
  shifts: {
    id: string;
    status: 'OPEN' | 'CLOSED';
    openedAt: string;
    closedAt: string | null;
    openingAmount: number;
    difference: number | null;
    cashier: string;
  }[];
}

export interface ParkingRateInfo {
  name: string;
  mode: string;
  fractionMinutes: number | null;
  pricePerUnit: number;
  graceMinutes: number;
  dailyCap: number | null;
  nightStart: string | null;
  nightEnd: string | null;
  nightPrice: number | null;
  courtesyMinutes: number;
}

// ------------------------------------------------------------------ consultas
export const useServices = () =>
  useQuery({
    queryKey: ['catalog'],
    queryFn: () => apiFetch<CatalogService[]>('/catalog/services'),
    staleTime: 5 * 60_000,
  });

export const useEmployees = () =>
  useQuery({
    queryKey: ['employees'],
    queryFn: () => apiFetch<Employee[]>('/employees'),
    staleTime: 5 * 60_000,
  });

export const usePlateSearch = (plate: string) =>
  useQuery({
    queryKey: ['plate', plate],
    queryFn: () => apiFetch<PlateSearch>(`/motorcycles/search?plate=${encodeURIComponent(plate)}`),
    enabled: plate.length >= 4,
    staleTime: 15_000,
  });

export const useCustomers = (q: string) =>
  useQuery({
    queryKey: ['customers', q],
    queryFn: () =>
      apiFetch<{ id: string; fullName: string; phone: string | null; plates: string[] }[]>(
        `/customers?q=${encodeURIComponent(q)}`,
      ),
  });

export const useMotoHistory = (motorcycleId: string | undefined) =>
  useQuery({
    queryKey: ['history', motorcycleId],
    queryFn: () =>
      apiFetch<
        {
          id: string;
          number: number;
          type: WorkOrderType;
          status: WorkOrderStatus;
          checkedInAt: string;
        }[]
      >(`/motorcycles/${motorcycleId}/history`),
    enabled: Boolean(motorcycleId),
  });

export const useBoard = () =>
  useQuery({
    queryKey: ['board'],
    queryFn: () => apiFetch<BoardOrder[]>('/work-orders/board'),
    refetchInterval: LIVE_INTERVAL,
  });

export const useOrder = (id: string | undefined) =>
  useQuery({
    queryKey: ['order', id],
    queryFn: () => apiFetch<OrderDetail>(`/work-orders/${id}`),
    enabled: Boolean(id),
    refetchInterval: LIVE_INTERVAL,
  });

export const useOccupancy = () =>
  useQuery({
    queryKey: ['occupancy'],
    queryFn: () => apiFetch<Occupancy>('/parking/occupancy'),
    refetchInterval: 15_000,
  });

export const useParkingRate = () =>
  useQuery({
    queryKey: ['parking-rate'],
    queryFn: () => apiFetch<ParkingRateInfo | null>('/parking/rate'),
    staleTime: 5 * 60_000,
  });

export const useRegisters = () =>
  useQuery({
    queryKey: ['registers'],
    queryFn: () => apiFetch<{ id: string; name: string }[]>('/cash/registers'),
  });

export const usePaymentMethods = () =>
  useQuery({
    queryKey: ['methods'],
    queryFn: () => apiFetch<PaymentMethod[]>('/payment-methods'),
    staleTime: 5 * 60_000,
  });

export const useCurrentShift = (enabled = true) =>
  useQuery({
    queryKey: ['shift'],
    queryFn: () => apiFetch<Shift | null>('/cash-shifts/current'),
    enabled,
  });

export const useChargePreview = (orderId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ['preview', orderId],
    queryFn: () => apiFetch<ChargePreview>(`/payments/preview?workOrderId=${orderId}`),
    enabled: Boolean(orderId) && enabled,
    refetchInterval: 30_000,
  });

export const useDailyReport = (date: string) =>
  useQuery({
    queryKey: ['report', date],
    queryFn: () => apiFetch<DailyReport>(`/reports/daily?date=${date}`),
  });

// ------------------------------------------------------------------ mutaciones
function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) =>
    Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

export function useCheckIn() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CheckInInput) =>
      apiSend<{ id: string; number: number; status: WorkOrderStatus; plate: string }>(
        '/work-orders/check-in',
        input,
      ),
    onSuccess: () => invalidate('board', 'plate', 'occupancy'),
  });
}

export function useOrderAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (
      a:
        | { kind: 'start' | 'finish'; itemId: string }
        | { kind: 'assign'; itemId: string; employeeIds: string[] }
        | { kind: 'cancelItem'; itemId: string; reason: string }
        | { kind: 'addItem'; orderId: string; serviceId: string }
        | { kind: 'cancel'; orderId: string; reason: string }
        | { kind: 'deliver'; orderId: string },
    ) => {
      switch (a.kind) {
        case 'start':
        case 'finish':
          return apiSend(`/work-order-items/${a.itemId}/${a.kind}`, undefined, 'PATCH');
        case 'assign':
          return apiSend(
            `/work-order-items/${a.itemId}/staff`,
            { employeeIds: a.employeeIds },
            'PUT',
          );
        case 'cancelItem':
          return apiSend(`/work-order-items/${a.itemId}/cancel`, { reason: a.reason });
        case 'addItem':
          return apiSend(`/work-orders/${a.orderId}/items`, { serviceId: a.serviceId });
        case 'cancel':
          return apiSend(`/work-orders/${a.orderId}/cancel`, { reason: a.reason });
        case 'deliver':
          return apiSend(`/work-orders/${a.orderId}/deliver`, { belongingsReturned: true });
      }
    },
    onSuccess: () => invalidate('board', 'order', 'preview', 'occupancy', 'plate'),
  });
}

export function useCashActions() {
  const invalidate = useInvalidate();
  const after = () => invalidate('shift', 'report');
  return {
    open: useMutation({
      mutationFn: (i: OpenShiftInput) => apiSend('/cash-shifts/open', i),
      onSuccess: after,
    }),
    movement: useMutation({
      mutationFn: ({ shiftId, ...i }: CashMovementInput & { shiftId: string }) =>
        apiSend(`/cash-shifts/${shiftId}/movements`, i),
      onSuccess: after,
    }),
    close: useMutation({
      mutationFn: ({ shiftId, ...i }: CloseShiftInput & { shiftId: string }) =>
        apiSend<{
          differenceByMethod: Record<string, number>;
          totalExpected: number;
          totalCounted: number;
          totalDifference: number;
          alert: boolean;
        }>(`/cash-shifts/${shiftId}/close`, i),
      onSuccess: after,
    }),
  };
}

export function useCharge() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (i: ChargeInput) => apiSend<Payment>('/payments', i),
    onSuccess: () => invalidate('order', 'board', 'shift', 'preview', 'occupancy', 'report'),
  });
}

export function useVoidPayment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      apiSend(`/payments/${paymentId}/void`, { reason }),
    onSuccess: () => invalidate('order', 'board', 'shift', 'preview', 'occupancy', 'report'),
  });
}
