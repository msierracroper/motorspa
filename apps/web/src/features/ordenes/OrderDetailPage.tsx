import { PERMISSIONS as P, WORK_ORDER_STATUS_LABEL, WORK_ORDER_TYPE_LABEL } from '@motospa/shared';
import { ArrowLeftIcon, PrinterIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useEmployees,
  useOrder,
  useOrderAction,
  useServices,
  useVoidPayment,
  type OrderItem,
} from '@/api/operations';
import {
  EmptyState,
  ErrorNote,
  Field,
  ItemPill,
  Money,
  Panel,
  SectionLabel,
  Select,
  Sheet,
  StatusPill,
  TextArea,
  ToggleChip,
} from '@/components/kit';
import { Plate } from '@/components/plate';
import { Button } from '@/components/ui/button';
import { formatDateTime, formatElapsed, useCan, useNow } from '@/lib/hooks';
import { ChargeSheet } from './ChargeSheet';

type ReasonTarget =
  | { kind: 'cancel'; title: string }
  | { kind: 'cancelItem'; itemId: string; title: string }
  | { kind: 'void'; paymentId: string; title: string };

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const order = useOrder(id);
  const action = useOrderAction();
  const voidPayment = useVoidPayment();
  const services = useServices();
  const employees = useEmployees();
  const now = useNow(15_000);

  const canCharge = useCan(P.PAYMENTS_CHARGE);
  const canCheckin = useCan(P.ORDERS_CHECKIN);
  const canExecute = useCan(P.ORDERS_EXECUTE);
  const canReassign = useCan(P.ORDERS_REASSIGN);
  const canCancel = useCan(P.ORDERS_CANCEL);
  const canVoid = useCan(P.PAYMENTS_VOID);

  const [charging, setCharging] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [returned, setReturned] = useState(false);
  const [reason, setReason] = useState<ReasonTarget | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [assigning, setAssigning] = useState<OrderItem | null>(null);
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [newService, setNewService] = useState('');

  if (order.isPending) return <div className="h-64 animate-pulse rounded-xl bg-card/70" />;
  if (order.isError || !order.data) {
    return (
      <EmptyState
        title="No encontramos la orden"
        action={
          <Link to="/ordenes" className="font-semibold text-primary">
            Volver al tablero
          </Link>
        }
      >
        {order.error instanceof Error ? order.error.message : undefined}
      </EmptyState>
    );
  }

  const o = order.data;
  const open = o.status !== 'DELIVERED' && o.status !== 'CANCELLED';
  const paid = Boolean(o.payment);
  const activeItems = o.items.filter((i) => i.status !== 'CANCELLED');
  const servicesTotal = activeItems.reduce((s, i) => s + i.unitPrice, 0);

  const run = (a: Parameters<typeof action.mutate>[0]) => action.mutate(a);

  const submitReason = async () => {
    if (!reason || reasonText.trim().length < 3) return;
    if (reason.kind === 'void')
      await voidPayment.mutateAsync({ paymentId: reason.paymentId, reason: reasonText.trim() });
    else if (reason.kind === 'cancel')
      await action.mutateAsync({ kind: 'cancel', orderId: o.id, reason: reasonText.trim() });
    else
      await action.mutateAsync({
        kind: 'cancelItem',
        itemId: reason.itemId,
        reason: reasonText.trim(),
      });
    setReason(null);
    setReasonText('');
  };

  return (
    <div className="flex flex-col gap-5">
      <Link
        to="/ordenes"
        className="inline-flex min-h-11 items-center gap-2 self-start font-semibold text-primary"
      >
        <ArrowLeftIcon className="size-5" /> Tablero
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Plate plate={o.motorcycle.plate} size="lg" className="w-auto px-5" />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-heading text-xl font-bold tabular-nums">#{o.number}</span>
              <StatusPill status={o.status} />
            </div>
            <span className="text-sm text-muted-foreground">
              {WORK_ORDER_TYPE_LABEL[o.type]} · ingresó {formatDateTime(o.checkedInAt)}
            </span>
          </div>
        </div>

        {/* Una acción principal según el momento */}
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/ticket/${o.id}`}
            target="_blank"
            className="inline-flex h-12 items-center gap-2 rounded-full border bg-card px-4 font-semibold hover:bg-muted"
          >
            <PrinterIcon className="size-5" /> Ticket
          </Link>
          {open && !paid && canCharge && (
            <Button size="touch" onClick={() => setCharging(true)}>
              Cobrar
            </Button>
          )}
          {open && paid && o.status === 'READY' && canCheckin && (
            <Button size="touch" onClick={() => setDelivering(true)}>
              Entregar moto
            </Button>
          )}
        </div>
      </div>

      <ErrorNote error={action.error ?? voidPayment.error} />
      {o.status === 'CANCELLED' && (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-destructive">
          Orden cancelada: {o.cancelReason}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Servicios */}
          {o.type !== 'PARKING' && (
            <Panel>
              <div className="flex items-center justify-between">
                <SectionLabel>Servicios</SectionLabel>
                <Money amount={servicesTotal} className="font-semibold" />
              </div>
              <ul className="flex flex-col divide-y">
                {o.items.map((item) => (
                  <li key={item.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={
                            item.status === 'CANCELLED'
                              ? 'font-medium line-through opacity-60'
                              : 'font-medium'
                          }
                        >
                          {item.description}
                        </span>
                        <ItemPill status={item.status} />
                      </div>
                      <Money amount={item.unitPrice} className="text-sm" />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                      <span>
                        {item.staff.length
                          ? item.staff.map((s) => s.fullName).join(', ')
                          : 'Sin lavador'}
                        {item.startedAt &&
                          item.status === 'IN_PROGRESS' &&
                          ` · ${formatElapsed(item.startedAt, now)} de ${item.estimatedMinutes} min`}
                        {item.startedAt &&
                          item.finishedAt &&
                          ` · tardó ${Math.max(1, Math.round((new Date(item.finishedAt).getTime() - new Date(item.startedAt).getTime()) / 60_000))} min`}
                      </span>
                      {open && (
                        <div className="flex flex-wrap gap-2">
                          {canReassign &&
                            (item.status === 'PENDING' || item.status === 'IN_PROGRESS') && (
                              <Button
                                variant="outline"
                                className="h-10 rounded-full"
                                onClick={() => {
                                  setAssigning(item);
                                  setStaffIds(item.staff.map((s) => s.id));
                                }}
                              >
                                Lavador
                              </Button>
                            )}
                          {!paid &&
                            canCheckin &&
                            item.status !== 'CANCELLED' &&
                            (item.status === 'PENDING' || canCancel) && (
                              <Button
                                variant="ghost"
                                className="h-10 rounded-full text-destructive"
                                onClick={() =>
                                  setReason({
                                    kind: 'cancelItem',
                                    itemId: item.id,
                                    title: `Quitar ${item.description}`,
                                  })
                                }
                              >
                                Quitar
                              </Button>
                            )}
                          {canExecute && item.status === 'PENDING' && (
                            <Button
                              className="h-10 px-4"
                              disabled={action.isPending}
                              onClick={() => run({ kind: 'start', itemId: item.id })}
                            >
                              Iniciar
                            </Button>
                          )}
                          {canExecute && item.status === 'IN_PROGRESS' && (
                            <Button
                              className="h-10 px-4"
                              disabled={action.isPending}
                              onClick={() => run({ kind: 'finish', itemId: item.id })}
                            >
                              Terminar
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {open && !paid && canCheckin && (
                <div className="flex gap-2 border-t pt-3">
                  <div className="flex-1">
                    <Select
                      aria-label="Agregar servicio"
                      value={newService}
                      onChange={setNewService}
                    >
                      <option value="">Agregar servicio…</option>
                      {(services.data ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    className="h-12 rounded-full px-5"
                    disabled={!newService || action.isPending}
                    onClick={() => {
                      run({ kind: 'addItem', orderId: o.id, serviceId: newService });
                      setNewService('');
                    }}
                  >
                    Agregar
                  </Button>
                </div>
              )}
            </Panel>
          )}

          {/* Pertenencias y estado */}
          <Panel>
            <SectionLabel>Pertenencias y estado</SectionLabel>
            {o.belongings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No dejó pertenencias.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {o.belongings.map((b) => (
                  <li key={b.id} className="rounded-full bg-secondary px-3 py-1.5 text-sm">
                    {b.item}
                    {b.quantity > 1 ? ` ×${b.quantity}` : ''}
                    {b.returned && (
                      <span className="ml-1 font-semibold text-success">· devuelto</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {(o.damageNotes || o.notes || o.mileage) && (
              <dl className="grid gap-1 text-sm">
                {o.mileage !== null && (
                  <div>
                    <dt className="inline text-muted-foreground">Kilometraje: </dt>
                    <dd className="inline tabular-nums">{o.mileage.toLocaleString('es-CO')} km</dd>
                  </div>
                )}
                {o.damageNotes && (
                  <div>
                    <dt className="inline text-muted-foreground">Daños: </dt>
                    <dd className="inline">{o.damageNotes}</dd>
                  </div>
                )}
                {o.notes && (
                  <div>
                    <dt className="inline text-muted-foreground">Notas: </dt>
                    <dd className="inline">{o.notes}</dd>
                  </div>
                )}
              </dl>
            )}
          </Panel>

          <Panel>
            <SectionLabel>Historial</SectionLabel>
            <ol className="flex flex-col gap-2 text-sm">
              {o.history.map((h) => (
                <li key={h.id} className="flex justify-between gap-2">
                  <span>
                    {WORK_ORDER_STATUS_LABEL[h.toStatus as keyof typeof WORK_ORDER_STATUS_LABEL] ??
                      h.toStatus}
                  </span>
                  <span className="text-muted-foreground">{formatDateTime(h.at)}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="flex flex-col gap-5">
          <Panel>
            <SectionLabel>Moto y cliente</SectionLabel>
            <p className="font-semibold">
              {[o.motorcycle.brand, o.motorcycle.model].filter(Boolean).join(' ') || 'Moto'}
              {o.motorcycle.cc ? (
                <span className="font-normal text-muted-foreground"> · {o.motorcycle.cc} cc</span>
              ) : null}
            </p>
            {o.customer ? (
              <p className="text-sm">
                {o.customer.fullName}
                <br />
                <span className="text-muted-foreground tabular-nums">{o.customer.phone}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Sin cliente registrado</p>
            )}
          </Panel>

          {o.parkingSession && (
            <Panel>
              <SectionLabel>Parqueo</SectionLabel>
              <p className="text-sm">
                {o.spotCode ? `Cupo ${o.spotCode} · ` : ''}desde{' '}
                {formatDateTime(o.parkingSession.entryAt)}
              </p>
              <p className="text-sm text-muted-foreground">
                {o.parkingSession.exitAt
                  ? 'Salida registrada'
                  : `Lleva ${formatElapsed(o.parkingSession.entryAt, now)}`}
                {o.parkingSession.amount !== null && (
                  <>
                    {' · '}
                    <Money
                      amount={o.parkingSession.amount}
                      className="font-semibold text-foreground"
                    />
                  </>
                )}
              </p>
            </Panel>
          )}

          <Panel>
            <SectionLabel>Pago</SectionLabel>
            {o.payment ? (
              <>
                <dl className="flex flex-col gap-1 text-sm">
                  <div className="flex justify-between">
                    <dt>Recibo</dt>
                    <dd className="tabular-nums">#{o.payment.number}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Servicios</dt>
                    <dd>
                      <Money amount={o.payment.servicesAmount} />
                    </dd>
                  </div>
                  {o.payment.parkingAmount > 0 && (
                    <div className="flex justify-between">
                      <dt>Parqueo</dt>
                      <dd>
                        <Money amount={o.payment.parkingAmount} />
                      </dd>
                    </div>
                  )}
                  {o.payment.discount > 0 && (
                    <div className="flex justify-between">
                      <dt>Descuento</dt>
                      <dd>
                        <Money amount={-o.payment.discount} />
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-1 font-bold">
                    <dt>Total pagado</dt>
                    <dd>
                      <Money amount={o.payment.total} />
                    </dd>
                  </div>
                </dl>
                {open && canVoid && (
                  <Button
                    variant="ghost"
                    className="h-11 self-start rounded-full text-destructive"
                    onClick={() =>
                      setReason({ kind: 'void', paymentId: o.payment!.id, title: 'Anular pago' })
                    }
                  >
                    Anular pago
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {open ? 'Pendiente de cobro' : 'Sin pago'}
              </p>
            )}
          </Panel>

          {open && !paid && canCancel && (
            <Button
              variant="ghost"
              className="h-11 self-start rounded-full text-destructive"
              onClick={() => setReason({ kind: 'cancel', title: 'Cancelar orden' })}
            >
              Cancelar orden
            </Button>
          )}
        </div>
      </div>

      {canCharge && (
        <ChargeSheet orderId={o.id} open={charging} onClose={() => setCharging(false)} />
      )}

      <Sheet open={delivering} onClose={() => setDelivering(false)} title="Entregar moto">
        {o.belongings.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Devuelve al cliente:</p>
            <ul className="flex flex-wrap gap-2">
              {o.belongings.map((b) => (
                <li key={b.id} className="rounded-full bg-secondary px-3 py-1.5 text-sm">
                  {b.item}
                  {b.quantity > 1 ? ` ×${b.quantity}` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No dejó pertenencias.</p>
        )}
        <label className="flex min-h-12 items-center gap-3 rounded-xl bg-muted px-4">
          <input
            type="checkbox"
            className="size-5 accent-[var(--primary)]"
            checked={returned}
            onChange={(e) => setReturned(e.target.checked)}
          />
          <span className="font-medium">Confirmo que entregué la moto y sus pertenencias</span>
        </label>
        <Button
          size="touch"
          disabled={!returned || action.isPending}
          onClick={async () => {
            await action.mutateAsync({ kind: 'deliver', orderId: o.id });
            setDelivering(false);
          }}
        >
          Entregar
        </Button>
      </Sheet>

      <Sheet open={reason !== null} onClose={() => setReason(null)} title={reason?.title ?? ''}>
        <Field label="Motivo" htmlFor="reason" hint="Queda registrado en la auditoría">
          <TextArea
            id="reason"
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            autoFocus
          />
        </Field>
        <ErrorNote error={action.error ?? voidPayment.error} />
        <Button
          size="touch"
          disabled={reasonText.trim().length < 3 || action.isPending || voidPayment.isPending}
          onClick={() => void submitReason()}
        >
          Confirmar
        </Button>
      </Sheet>

      <Sheet
        open={assigning !== null}
        onClose={() => setAssigning(null)}
        title={`Lavador · ${assigning?.description ?? ''}`}
      >
        <div className="flex flex-wrap gap-2">
          {(employees.data ?? []).map((e) => (
            <ToggleChip
              key={e.id}
              pressed={staffIds.includes(e.id)}
              onClick={() =>
                setStaffIds(
                  staffIds.includes(e.id)
                    ? staffIds.filter((x) => x !== e.id)
                    : [...staffIds, e.id],
                )
              }
            >
              {e.fullName}
            </ToggleChip>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Si eliges varios, la comisión se reparte en partes iguales.
        </p>
        <Button
          size="touch"
          disabled={staffIds.length === 0 || action.isPending}
          onClick={async () => {
            await action.mutateAsync({
              kind: 'assign',
              itemId: assigning!.id,
              employeeIds: staffIds,
            });
            setAssigning(null);
          }}
        >
          Guardar
        </Button>
      </Sheet>
    </div>
  );
}
