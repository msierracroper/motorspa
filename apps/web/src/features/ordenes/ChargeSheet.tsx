import {
  discountAmount,
  formatCOP,
  requiresAuthorization,
  type DiscountType,
} from '@motospa/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { useCharge, useChargePreview, useCurrentShift, usePaymentMethods } from '@/api/operations';
import { ErrorNote, Field, Money, Segmented, Sheet, ToggleChip } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const digits = (v: string) => v.replace(/\D/g, '');
const toInt = (v: string) => (v ? Number(digits(v)) : 0);
const thousands = (n: number) => (n ? n.toLocaleString('es-CO') : '');

/** Cobro de una orden: servicios + parqueo − descuento, con pagos mixtos (SPEC §4.9). */
export function ChargeSheet({
  orderId,
  open,
  onClose,
}: {
  orderId: string;
  open: boolean;
  onClose: () => void;
}) {
  const shift = useCurrentShift(open);
  const preview = useChargePreview(orderId, open);
  const methods = usePaymentMethods();
  const charge = useCharge();

  const [withDiscount, setWithDiscount] = useState(false);
  const [dType, setDType] = useState<DiscountType>('PERCENT');
  const [dValue, setDValue] = useState('');
  const [dReason, setDReason] = useState('');
  const [auth, setAuth] = useState({ username: '', pin: '' });
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [received, setReceived] = useState('');

  const p = preview.data;
  const subtotal = p?.subtotal ?? 0;
  const discount = withDiscount
    ? discountAmount(subtotal, dValue ? { type: dType, value: Number(dValue) } : null)
    : 0;
  const total = subtotal - discount;
  const needsAuth = Boolean(
    p && discount > 0 && requiresAuthorization(subtotal, discount, p.discountLimit),
  );

  const cashId = methods.data?.find((m) => m.type === 'CASH')?.id;
  // Por defecto todo en efectivo hasta que la persona elija otra cosa.
  const lines = useMemo(() => {
    const entries = Object.entries(amounts).filter(([, v]) => toInt(v) > 0);
    if (entries.length === 0 && cashId && total > 0)
      return [{ paymentMethodId: cashId, amount: total }];
    return entries.map(([paymentMethodId, v]) => ({ paymentMethodId, amount: toInt(v) }));
  }, [amounts, cashId, total]);
  const paid = lines.reduce((s, l) => s + l.amount, 0);
  const missing = total - paid;
  const cashLine = lines.find((l) => l.paymentMethodId === cashId)?.amount ?? 0;
  const change = toInt(received) - cashLine;

  const authError =
    charge.error instanceof ApiError && charge.error.code === 'DISCOUNT_AUTH_REQUIRED';
  const canSubmit =
    p &&
    missing === 0 &&
    (!withDiscount || discount === 0 || dReason.trim().length >= 3) &&
    (!needsAuth || (auth.username && /^\d{4,6}$/.test(auth.pin))) &&
    !charge.isPending;

  /** Tocar un medio: si es el primero, paga todo; si no, le asigna lo que falta. */
  function setMethod(id: string) {
    if (Object.keys(amounts).length === 0) {
      setAmounts({ [id]: thousands(total) });
      return;
    }
    const others = Object.entries(amounts)
      .filter(([k]) => k !== id)
      .reduce((s, [, v]) => s + toInt(v), 0);
    setAmounts({ ...amounts, [id]: thousands(Math.max(0, total - others)) });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    await charge.mutateAsync({
      workOrderId: orderId,
      lines: total === 0 ? [] : lines,
      ...(withDiscount && discount > 0
        ? { discount: { type: dType, value: Number(dValue), reason: dReason.trim() } }
        : {}),
      ...(needsAuth ? { authorization: auth } : {}),
    });
  }

  const close = () => {
    charge.reset();
    setAmounts({});
    setReceived('');
    setWithDiscount(false);
    setDValue('');
    setDReason('');
    setAuth({ username: '', pin: '' });
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title={charge.isSuccess ? 'Pago registrado' : 'Cobrar'}>
      {charge.isSuccess ? (
        <div className="flex flex-col gap-4 text-center">
          <p className="text-lg">
            Recibo <b className="tabular-nums">#{charge.data.number}</b> por{' '}
            <Money amount={charge.data.total} className="font-bold" />
          </p>
          {change > 0 && (
            <p className="rounded-xl bg-success-soft px-4 py-3 text-lg font-bold text-success">
              Cambio: {formatCOP(change)}
            </p>
          )}
          <Link
            to={`/ticket/${orderId}`}
            target="_blank"
            className="inline-flex h-12 items-center justify-center rounded-full border font-semibold hover:bg-muted"
          >
            Imprimir recibo
          </Link>
          <Button size="touch" onClick={close}>
            Listo
          </Button>
        </div>
      ) : shift.data === null ? (
        <div className="flex flex-col gap-3">
          <p>Para cobrar necesitas un turno de caja abierto.</p>
          <Link
            to="/caja"
            className="inline-flex h-12 items-center justify-center rounded-full bg-brand-gradient font-semibold text-primary-foreground"
          >
            Ir a Caja
          </Link>
        </div>
      ) : !p ? (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <dl className="flex flex-col gap-1.5 rounded-xl bg-muted p-4 text-sm">
            <Row label="Servicios" amount={p.servicesAmount} />
            {p.parking && (
              <Row
                label={
                  p.parking.reason === 'COURTESY'
                    ? 'Parqueo (cortesía por lavado)'
                    : p.parking.reason === 'GRACE'
                      ? 'Parqueo (tiempo de gracia)'
                      : `Parqueo · ${p.parking.billableMinutes} min`
                }
                amount={p.parking.amount}
              />
            )}
            {discount > 0 && <Row label="Descuento" amount={-discount} />}
            <div className="mt-1 flex items-center justify-between border-t pt-2 text-base font-bold">
              <dt>Total</dt>
              <dd>
                <Money amount={total} className="font-heading text-2xl" />
              </dd>
            </div>
          </dl>

          <ToggleChip pressed={withDiscount} onClick={() => setWithDiscount(!withDiscount)}>
            Aplicar descuento
          </ToggleChip>
          {withDiscount && (
            <div className="flex flex-col gap-3 rounded-xl border p-3">
              <Segmented
                label="Tipo de descuento"
                value={dType}
                onChange={(v) => {
                  setDType(v);
                  setDValue('');
                }}
                options={[
                  { value: 'PERCENT', label: 'Porcentaje' },
                  { value: 'AMOUNT', label: 'Valor' },
                ]}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label={dType === 'PERCENT' ? '% de descuento' : 'Valor ($)'}
                  htmlFor="dvalue"
                >
                  <Input
                    id="dvalue"
                    inputMode="numeric"
                    value={dType === 'AMOUNT' ? thousands(toInt(dValue)) : dValue}
                    onChange={(e) =>
                      setDValue(digits(e.target.value).slice(0, dType === 'PERCENT' ? 3 : 8))
                    }
                  />
                </Field>
                <Field label="Motivo" htmlFor="dreason">
                  <Input
                    id="dreason"
                    value={dReason}
                    onChange={(e) => setDReason(e.target.value)}
                  />
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">
                Tu límite: {p.discountLimit.maxPercent}%
                {p.discountLimit.maxAmount !== null
                  ? ` y máx. ${formatCOP(p.discountLimit.maxAmount)}`
                  : ''}
                .
              </p>
              {(needsAuth || authError) && (
                <div className="flex flex-col gap-2 rounded-xl bg-warning-soft p-3">
                  <p className="text-sm font-semibold text-warning">
                    Este descuento supera tu límite: lo debe autorizar un supervisor.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Usuario" htmlFor="auth-user">
                      <Input
                        id="auth-user"
                        autoCapitalize="none"
                        value={auth.username}
                        onChange={(e) => setAuth({ ...auth, username: e.target.value })}
                      />
                    </Field>
                    <Field label="PIN" htmlFor="auth-pin">
                      <Input
                        id="auth-pin"
                        type="password"
                        inputMode="numeric"
                        autoComplete="off"
                        value={auth.pin}
                        onChange={(e) =>
                          setAuth({ ...auth, pin: digits(e.target.value).slice(0, 6) })
                        }
                      />
                    </Field>
                  </div>
                </div>
              )}
            </div>
          )}

          {total > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-muted-foreground">Medio de pago</span>
              <div className="flex flex-col gap-2">
                {(methods.data ?? []).map((m) => {
                  const value =
                    amounts[m.id] ??
                    (Object.keys(amounts).length === 0 && m.id === cashId ? thousands(total) : '');
                  return (
                    <div key={m.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setMethod(m.id)}
                        className="min-h-12 flex-1 rounded-xl bg-secondary px-4 text-left font-medium hover:bg-accent"
                      >
                        {m.name}
                      </button>
                      <Input
                        aria-label={`Monto en ${m.name}`}
                        inputMode="numeric"
                        className="w-36 text-right tabular-nums"
                        value={value}
                        placeholder="0"
                        onChange={(e) => {
                          const base =
                            Object.keys(amounts).length === 0 && cashId
                              ? { [cashId]: thousands(total) }
                              : amounts;
                          setAmounts({ ...base, [m.id]: thousands(toInt(e.target.value)) });
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              {missing !== 0 && (
                <p className="text-sm font-semibold text-warning">
                  {missing > 0 ? `Falta ${formatCOP(missing)}` : `Sobra ${formatCOP(-missing)}`}
                </p>
              )}
              {cashLine > 0 && (
                <Field label="Efectivo recibido (para calcular el cambio)" htmlFor="received">
                  <Input
                    id="received"
                    inputMode="numeric"
                    value={received}
                    onChange={(e) => setReceived(thousands(toInt(e.target.value)))}
                  />
                </Field>
              )}
              {change > 0 && (
                <p className="text-sm font-bold text-success">Cambio: {formatCOP(change)}</p>
              )}
            </div>
          )}

          <ErrorNote error={charge.error} />
          <Button type="submit" size="touch" disabled={!canSubmit}>
            {charge.isPending ? 'Cobrando…' : `Cobrar ${formatCOP(total)}`}
          </Button>
        </form>
      )}
    </Sheet>
  );
}

function Row({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>
        <Money amount={amount} className="font-semibold" />
      </dd>
    </div>
  );
}
