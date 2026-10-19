import { COP_DENOMINATIONS, formatCOP, PERMISSIONS as P, sumDenominations } from '@motospa/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import {
  useCashActions,
  useCurrentShift,
  usePaymentMethods,
  useRegisters,
  type Shift,
} from '@/api/operations';
import {
  ErrorNote,
  Field,
  Money,
  PageHeader,
  Panel,
  SectionLabel,
  Segmented,
  Select,
  Sheet,
} from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatTime, useCan } from '@/lib/hooks';

const toInt = (v: string) => Number(v.replace(/\D/g, '') || 0);
const thousands = (n: number) => (n ? n.toLocaleString('es-CO') : '');

type CloseResult = {
  differenceByMethod: Record<string, number>;
  totalDifference: number;
  alert: boolean;
};

/** Caja (SPEC §4.9): apertura, movimientos y cierre con arqueo. */
export default function CajaPage() {
  const shift = useCurrentShift();
  const methods = usePaymentMethods();
  // El resultado vive aquí: al cerrar, el turno deja de existir y su panel se desmonta.
  const [closed, setClosed] = useState<CloseResult | null>(null);
  const name = (id: string) => methods.data?.find((m) => m.id === id)?.name ?? 'Otro';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Caja"
        subtitle={
          shift.data
            ? `Turno abierto desde las ${formatTime(shift.data.openedAt)}`
            : 'Sin turno abierto'
        }
      />
      <ErrorNote error={shift.error} />
      {shift.isPending ? (
        <div className="h-48 animate-pulse rounded-xl bg-card/70" />
      ) : shift.data ? (
        <OpenShift shift={shift.data} name={name} onClosed={setClosed} />
      ) : (
        <OpenForm />
      )}
      <Sheet open={closed !== null} onClose={() => setClosed(null)} title="Turno cerrado">
        {closed && (
          <div className="flex flex-col gap-3">
            <p
              className={
                closed.totalDifference === 0
                  ? 'rounded-xl bg-success-soft px-4 py-3 text-lg font-bold text-success'
                  : 'rounded-xl bg-warning-soft px-4 py-3 text-lg font-bold text-warning'
              }
            >
              {closed.totalDifference === 0
                ? 'Cuadra exacto'
                : closed.totalDifference > 0
                  ? `Sobrante de ${formatCOP(closed.totalDifference)}`
                  : `Faltante de ${formatCOP(-closed.totalDifference)}`}
            </p>
            <dl className="flex flex-col divide-y text-sm">
              {Object.entries(closed.differenceByMethod).map(([id, diff]) => (
                <div key={id} className="flex justify-between py-2">
                  <dt>{name(id)}</dt>
                  <dd
                    className={
                      diff === 0 ? 'tabular-nums' : 'font-semibold text-warning tabular-nums'
                    }
                  >
                    {formatCOP(diff)}
                  </dd>
                </div>
              ))}
            </dl>
            {closed.alert && (
              <p className="text-sm font-semibold text-warning">
                La diferencia supera el umbral: se avisará al administrador.
              </p>
            )}
            <Button size="touch" onClick={() => setClosed(null)}>
              Listo
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function OpenForm() {
  const registers = useRegisters();
  const { open } = useCashActions();
  const [registerId, setRegisterId] = useState('');
  const [amount, setAmount] = useState('');
  const selected = registerId || registers.data?.[0]?.id || '';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (selected) open.mutate({ registerId: selected, openingAmount: toInt(amount) });
  };

  return (
    <Panel className="max-w-md">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <SectionLabel>Abrir turno</SectionLabel>
        {(registers.data?.length ?? 0) > 1 && (
          <Field label="Caja" htmlFor="register">
            <Select id="register" value={selected} onChange={setRegisterId}>
              {registers.data!.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field
          label="Base inicial en efectivo"
          htmlFor="opening"
          hint="El dinero con el que arrancas el turno"
        >
          <Input
            id="opening"
            inputMode="numeric"
            value={thousands(toInt(amount))}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </Field>
        <ErrorNote error={open.error} />
        <Button type="submit" size="touch" disabled={!selected || open.isPending}>
          Abrir turno
        </Button>
      </form>
    </Panel>
  );
}

function OpenShift({
  shift,
  name,
  onClosed,
}: {
  shift: Shift;
  name: (id: string) => string;
  onClosed: (r: CloseResult) => void;
}) {
  const canExpense = useCan(P.EXPENSES_CASH);
  const [movementOpen, setMovementOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const s = shift.summary;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Ventas" value={<Money amount={s.sales} />} sub={`${s.payments} cobros`} />
          <Stat label="Base" value={<Money amount={shift.openingAmount} />} />
          <Stat label="Ingresos" value={<Money amount={s.income} />} />
          <Stat label="Egresos" value={<Money amount={s.expenses} />} />
        </div>
        <Panel>
          <SectionLabel>Esperado en caja por medio de pago</SectionLabel>
          <dl className="flex flex-col divide-y">
            {Object.entries(s.expected).map(([id, amount]) => (
              <div key={id} className="flex items-center justify-between py-2">
                <dt>{name(id)}</dt>
                <dd>
                  <Money amount={amount} className="font-semibold" />
                </dd>
              </div>
            ))}
          </dl>
          {s.voided > 0 && (
            <p className="text-xs text-muted-foreground">
              {s.voided} pago(s) anulado(s) no cuentan.
            </p>
          )}
        </Panel>
      </div>
      <div className="flex flex-col gap-3">
        {canExpense && (
          <Button
            variant="outline"
            size="touch"
            className="rounded-full bg-card"
            onClick={() => setMovementOpen(true)}
          >
            Registrar ingreso o gasto
          </Button>
        )}
        <Button size="touch" onClick={() => setClosing(true)}>
          Cerrar turno
        </Button>
      </div>
      <MovementSheet
        shiftId={shift.id}
        open={movementOpen}
        onClose={() => setMovementOpen(false)}
      />
      <CloseSheet
        shift={shift}
        open={closing}
        onClose={() => setClosing(false)}
        name={name}
        onClosed={onClosed}
      />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-card p-4 shadow-soft">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="font-heading text-xl font-bold">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

function MovementSheet({
  shiftId,
  open,
  onClose,
}: {
  shiftId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { movement } = useCashActions();
  const [type, setType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [form, setForm] = useState({ category: '', amount: '', description: '' });
  const valid =
    form.category.trim().length >= 2 &&
    toInt(form.amount) > 0 &&
    form.description.trim().length >= 3;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    await movement.mutateAsync({
      shiftId,
      type,
      category: form.category.trim(),
      amount: toInt(form.amount),
      description: form.description.trim(),
    });
    setForm({ category: '', amount: '', description: '' });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Movimiento de caja">
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <Segmented
          label="Tipo"
          value={type}
          onChange={setType}
          options={[
            { value: 'EXPENSE', label: 'Gasto / salida' },
            { value: 'INCOME', label: 'Ingreso' },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoría" htmlFor="mcat">
            <Input
              id="mcat"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="Ej.: Insumos"
            />
          </Field>
          <Field label="Valor" htmlFor="mamount">
            <Input
              id="mamount"
              inputMode="numeric"
              value={thousands(toInt(form.amount))}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Descripción" htmlFor="mdesc">
          <Input
            id="mdesc"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <ErrorNote error={movement.error} />
        <Button type="submit" size="touch" disabled={!valid || movement.isPending}>
          Registrar
        </Button>
      </form>
    </Sheet>
  );
}

function CloseSheet({
  shift,
  open,
  onClose,
  name,
  onClosed,
}: {
  shift: Shift;
  open: boolean;
  onClose: () => void;
  name: (id: string) => string;
  onClosed: (r: CloseResult) => void;
}) {
  const methods = usePaymentMethods();
  const { close } = useCashActions();
  const cashId = shift.summary.cashMethodId;
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [byDenomination, setByDenomination] = useState(false);
  const [denoms, setDenoms] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');

  const methodIds = [
    ...new Set([...Object.keys(shift.summary.expected), ...(methods.data ?? []).map((m) => m.id)]),
  ];
  const value = (id: string) =>
    id === cashId && byDenomination ? sumDenominations(denoms) : toInt(counted[id] ?? '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await close.mutateAsync({
      shiftId: shift.id,
      counted: Object.fromEntries(methodIds.map((id) => [id, value(id)])),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
    onClosed(result);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Cerrar turno (arqueo)">
      {
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Cuenta el dinero y escribe lo que hay por cada medio de pago.
          </p>
          {methodIds.map((id) => (
            <div key={id} className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span className="flex-1 font-medium">{name(id)}</span>
                <span className="text-xs text-muted-foreground">
                  Esperado <Money amount={shift.summary.expected[id] ?? 0} />
                </span>
                <Input
                  aria-label={`Contado en ${name(id)}`}
                  inputMode="numeric"
                  className="w-36 text-right tabular-nums"
                  disabled={id === cashId && byDenomination}
                  value={
                    id === cashId && byDenomination
                      ? thousands(sumDenominations(denoms))
                      : thousands(toInt(counted[id] ?? ''))
                  }
                  onChange={(e) => setCounted({ ...counted, [id]: e.target.value })}
                  placeholder="0"
                />
              </div>
              {id === cashId && (
                <button
                  type="button"
                  className="self-start text-sm font-semibold text-primary"
                  onClick={() => setByDenomination(!byDenomination)}
                >
                  {byDenomination ? 'Escribir el total' : 'Contar por billetes y monedas'}
                </button>
              )}
              {id === cashId && byDenomination && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {COP_DENOMINATIONS.map((d) => (
                    <label key={d} className="flex items-center gap-2 text-sm">
                      <span className="w-16 text-right tabular-nums">{formatCOP(d)}</span>
                      <Input
                        inputMode="numeric"
                        className="h-10"
                        value={denoms[d] ? String(denoms[d]) : ''}
                        onChange={(e) => setDenoms({ ...denoms, [d]: toInt(e.target.value) })}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
          <Field label="Observaciones" htmlFor="cnotes">
            <Input id="cnotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <ErrorNote error={close.error} />
          <Button type="submit" size="touch" disabled={close.isPending}>
            Cerrar turno
          </Button>
        </form>
      }
    </Sheet>
  );
}
