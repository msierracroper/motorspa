import { normalizePlate, priceForCc, type CheckInInput, type WorkOrderType } from '@motospa/shared';
import { CheckCircle2Icon, ChevronDownIcon, PrinterIcon } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  useCheckIn,
  useEmployees,
  useOccupancy,
  usePlateSearch,
  useServices,
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
  StatusPill,
  TextArea,
  ToggleChip,
} from '@/components/kit';
import { Plate } from '@/components/plate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPlate } from '@/lib/plate';

const BELONGINGS = ['Casco', 'Chaqueta', 'Llaves', 'Guantes', 'Maleta'] as const;
const FUEL = [
  { value: '', label: 'Sin registrar' },
  { value: 'EMPTY', label: 'Reserva' },
  { value: 'QUARTER', label: '1/4' },
  { value: 'HALF', label: '1/2' },
  { value: 'THREE_QUARTERS', label: '3/4' },
  { value: 'FULL', label: 'Lleno' },
] as const;

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function RecepcionPage() {
  const [plateText, setPlateText] = useState('');
  const plate = useDebounced(normalizePlate(plateText));
  const search = usePlateSearch(plate);
  const services = useServices();
  const employees = useEmployees();
  const occupancy = useOccupancy();
  const checkIn = useCheckIn();

  const [type, setType] = useState<WorkOrderType>('WASH');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [spotId, setSpotId] = useState('');
  const [belongings, setBelongings] = useState<Record<string, number>>({});
  const [moto, setMoto] = useState({ brand: '', model: '', cc: '', color: '' });
  const [customer, setCustomer] = useState({ fullName: '', phone: '' });
  const [more, setMore] = useState(false);
  const [extra, setExtra] = useState({ mileage: '', fuelLevel: '', damageNotes: '', notes: '' });
  const [done, setDone] = useState<Awaited<ReturnType<typeof checkIn.mutateAsync>> | null>(null);

  const found = search.data?.plate === plate ? search.data : undefined;
  const known = found?.motorcycle ?? null;
  const owner = found?.customers[0] ?? null;
  const cc = known?.cc ?? (moto.cc ? Number(moto.cc) : null);
  const needsCustomer = !owner;
  const freeSpots = occupancy.data?.spots.filter((s) => !s.occupiedBy) ?? [];

  const selected = useMemo(
    () => (services.data ?? []).filter((s) => serviceIds.includes(s.id)),
    [services.data, serviceIds],
  );
  const total = selected.reduce((sum, s) => sum + (priceForCc(s.prices, cc) ?? 0), 0);

  const reset = () => {
    setPlateText('');
    setType('WASH');
    setServiceIds([]);
    setEmployeeIds([]);
    setSpotId('');
    setBelongings({});
    setMoto({ brand: '', model: '', cc: '', color: '' });
    setCustomer({ fullName: '', phone: '' });
    setExtra({ mileage: '', fuelLevel: '', damageNotes: '', notes: '' });
    setMore(false);
    checkIn.reset();
  };

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const canSubmit =
    plate.length >= 4 &&
    !found?.activeOrder &&
    (type === 'PARKING' || serviceIds.length > 0) &&
    (!needsCustomer || customer.phone.replace(/\D/g, '').length >= 7) &&
    !checkIn.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const input: CheckInInput = {
      plate,
      type,
      serviceIds: type === 'PARKING' ? [] : serviceIds,
      employeeIds: type === 'PARKING' ? [] : employeeIds,
      belongings: Object.entries(belongings).map(([item, quantity]) => ({ item, quantity })),
      ...(spotId && type !== 'WASH' ? { parkingSpotId: spotId } : {}),
      ...(owner ? { customerId: owner.id } : {}),
      ...(needsCustomer
        ? {
            customer: {
              phone: customer.phone,
              ...(customer.fullName ? { fullName: customer.fullName } : {}),
            },
          }
        : {}),
      motorcycle: {
        ...(moto.brand ? { brand: moto.brand } : {}),
        ...(moto.model ? { model: moto.model } : {}),
        ...(moto.cc ? { cc: Number(moto.cc) } : {}),
        ...(moto.color ? { color: moto.color } : {}),
      },
      ...(extra.mileage ? { mileage: Number(extra.mileage) } : {}),
      ...(extra.fuelLevel ? { fuelLevel: extra.fuelLevel as CheckInInput['fuelLevel'] } : {}),
      ...(extra.damageNotes ? { damageNotes: extra.damageNotes } : {}),
      ...(extra.notes ? { notes: extra.notes } : {}),
    };
    const res = await checkIn.mutateAsync(input);
    setDone(res);
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-5 pb-24 lg:pb-0">
      <PageHeader title="Recepción" subtitle="Registra el ingreso de una moto" />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Placa */}
          <Panel>
            <label htmlFor="plate" className="text-sm font-semibold text-muted-foreground">
              Placa
            </label>
            <input
              id="plate"
              value={plateText}
              onChange={(e) => setPlateText(e.target.value)}
              placeholder="ABC 12D"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
              maxLength={10}
              className="h-16 w-full rounded-xl border-2 border-plate-edge bg-plate text-center font-sans text-3xl font-extrabold tracking-[0.12em] text-plate-ink uppercase outline-none placeholder:text-plate-ink/30 focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            {plate.length >= 4 && search.isFetching && !found && (
              <p className="text-sm text-muted-foreground">Buscando…</p>
            )}
            {found?.activeOrder && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warning-soft px-4 py-3 text-warning">
                <span className="font-semibold">
                  Esta moto ya está en sede (orden #{found.activeOrder.number})
                </span>
                <Link to={`/ordenes/${found.activeOrder.id}`} className="font-bold underline">
                  Ver orden
                </Link>
              </div>
            )}
            {known && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-semibold">
                  {[known.brand, known.model].filter(Boolean).join(' ') || 'Moto registrada'}
                </span>
                {known.cc && (
                  <span className="tabular-nums text-muted-foreground">{known.cc} cc</span>
                )}
                {known.color && <span className="text-muted-foreground">{known.color}</span>}
                {owner && (
                  <span className="text-muted-foreground">
                    {owner.fullName} · {owner.phone}
                  </span>
                )}
                <span className="text-muted-foreground">
                  {found!.visits === 0 ? 'Primera visita' : `${found!.visits} visitas`}
                </span>
              </div>
            )}
            {found && !known && (
              <p className="text-sm font-medium text-info">
                Moto nueva: completa los datos básicos.
              </p>
            )}
          </Panel>

          {/* Moto nueva o datos faltantes */}
          {found && (!known || !known.cc) && (
            <Panel>
              <SectionLabel>Datos de la moto</SectionLabel>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {!known && (
                  <>
                    <Field label="Marca" htmlFor="brand">
                      <Input
                        id="brand"
                        value={moto.brand}
                        onChange={(e) => setMoto({ ...moto, brand: e.target.value })}
                      />
                    </Field>
                    <Field label="Línea" htmlFor="model">
                      <Input
                        id="model"
                        value={moto.model}
                        onChange={(e) => setMoto({ ...moto, model: e.target.value })}
                      />
                    </Field>
                  </>
                )}
                <Field label="Cilindraje (cc)" htmlFor="cc" hint="Define el precio">
                  <Input
                    id="cc"
                    inputMode="numeric"
                    value={moto.cc}
                    onChange={(e) =>
                      setMoto({ ...moto, cc: e.target.value.replace(/\D/g, '').slice(0, 4) })
                    }
                  />
                </Field>
                {!known && (
                  <Field label="Color" htmlFor="color">
                    <Input
                      id="color"
                      value={moto.color}
                      onChange={(e) => setMoto({ ...moto, color: e.target.value })}
                    />
                  </Field>
                )}
              </div>
            </Panel>
          )}

          {found && needsCustomer && (
            <Panel>
              <SectionLabel>Cliente</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Teléfono (WhatsApp)" htmlFor="phone">
                  <Input
                    id="phone"
                    inputMode="tel"
                    required
                    value={customer.phone}
                    onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                  />
                </Field>
                <Field label="Nombre (opcional)" htmlFor="fullName">
                  <Input
                    id="fullName"
                    value={customer.fullName}
                    onChange={(e) => setCustomer({ ...customer, fullName: e.target.value })}
                  />
                </Field>
              </div>
            </Panel>
          )}

          {/* Tipo y servicios */}
          <Panel>
            <SectionLabel>Tipo de ingreso</SectionLabel>
            <Segmented
              label="Tipo de ingreso"
              value={type}
              onChange={setType}
              options={[
                { value: 'WASH', label: 'Lavado' },
                { value: 'PARKING', label: 'Parqueo' },
                { value: 'WASH_PARKING', label: 'Ambos' },
              ]}
            />
            {type !== 'PARKING' && (
              <>
                <SectionLabel>Servicios</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {(services.data ?? []).map((s) => {
                    const price = priceForCc(s.prices, cc);
                    return (
                      <ToggleChip
                        key={s.id}
                        pressed={serviceIds.includes(s.id)}
                        onClick={() => setServiceIds(toggle(serviceIds, s.id))}
                      >
                        {s.name}
                        {price !== null && (
                          <span className="text-xs opacity-80">
                            <Money amount={price} />
                          </span>
                        )}
                      </ToggleChip>
                    );
                  })}
                </div>
                {cc === null && serviceIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Sin cilindraje se usa el precio del rango más bajo.
                  </p>
                )}
                {(employees.data?.length ?? 0) > 0 && (
                  <>
                    <SectionLabel>Lavador (opcional)</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {employees.data!.map((e) => (
                        <ToggleChip
                          key={e.id}
                          pressed={employeeIds.includes(e.id)}
                          onClick={() => setEmployeeIds(toggle(employeeIds, e.id))}
                        >
                          {e.fullName}
                        </ToggleChip>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
            {type !== 'WASH' && (
              <Field label="Cupo de parqueo (opcional)" htmlFor="spot">
                <Select id="spot" value={spotId} onChange={setSpotId}>
                  <option value="">Sin cupo asignado</option>
                  {freeSpots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </Panel>

          {/* Pertenencias y estado */}
          <Panel>
            <SectionLabel>Pertenencias que deja</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {BELONGINGS.map((b) => {
                const qty = belongings[b] ?? 0;
                return (
                  <ToggleChip
                    key={b}
                    pressed={qty > 0}
                    onClick={() => {
                      const next = { ...belongings };
                      // Casco: 0 → 1 → 2 → 0; el resto: sí / no
                      const max = b === 'Casco' ? 2 : 1;
                      if (qty >= max) delete next[b];
                      else next[b] = qty + 1;
                      setBelongings(next);
                    }}
                  >
                    {b}
                    {qty > 1 && <span className="tabular-nums">×{qty}</span>}
                  </ToggleChip>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setMore(!more)}
              aria-expanded={more}
              className="flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-primary"
            >
              Estado de la moto y notas
              <ChevronDownIcon
                className={
                  more ? 'size-4 rotate-180 transition-transform' : 'size-4 transition-transform'
                }
              />
            </button>
            {more && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Kilometraje" htmlFor="km">
                  <Input
                    id="km"
                    inputMode="numeric"
                    value={extra.mileage}
                    onChange={(e) =>
                      setExtra({ ...extra, mileage: e.target.value.replace(/\D/g, '') })
                    }
                  />
                </Field>
                <Field label="Combustible" htmlFor="fuel">
                  <Select
                    id="fuel"
                    value={extra.fuelLevel}
                    onChange={(v) => setExtra({ ...extra, fuelLevel: v })}
                  >
                    {FUEL.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Rayones o golpes" htmlFor="damage">
                  <TextArea
                    id="damage"
                    value={extra.damageNotes}
                    onChange={(e) => setExtra({ ...extra, damageNotes: e.target.value })}
                    placeholder="Ej.: rayón en el tanque, lado izquierdo"
                  />
                </Field>
                <Field label="Notas" htmlFor="notes">
                  <TextArea
                    id="notes"
                    value={extra.notes}
                    onChange={(e) => setExtra({ ...extra, notes: e.target.value })}
                  />
                </Field>
              </div>
            )}
          </Panel>
        </div>

        {/* Resumen (fijo abajo en el celular, columna en el PC) */}
        <aside className="fixed inset-x-0 bottom-[calc(76px+max(12px,env(safe-area-inset-bottom)))] z-20 px-3 lg:static lg:inset-auto lg:z-auto lg:px-0">
          <div className="mx-auto flex max-w-md flex-col gap-3 rounded-3xl bg-card p-3 shadow-[0_8px_30px_-12px_rgb(12_42_58/0.35)] lg:max-w-none lg:p-5 lg:shadow-soft">
            <div className="hidden flex-col gap-2 lg:flex">
              {plate.length >= 4 && <Plate plate={plate} size="md" className="self-start" />}
              {selected.map((s) => (
                <div key={s.id} className="flex justify-between gap-2 text-sm">
                  <span>{s.name}</span>
                  <Money amount={priceForCc(s.prices, cc) ?? 0} />
                </div>
              ))}
              {type !== 'WASH' && (
                <div className="flex justify-between gap-2 text-sm text-muted-foreground">
                  <span>Parqueo</span>
                  <span>Según tiempo</span>
                </div>
              )}
            </div>
            <ErrorNote error={checkIn.error} />
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="text-xs text-muted-foreground">Total estimado</span>
                <Money amount={total} className="font-heading text-2xl font-bold" />
              </div>
              <Button type="submit" size="touch" disabled={!canSubmit} className="flex-1">
                {checkIn.isPending ? 'Registrando…' : 'Registrar ingreso'}
              </Button>
            </div>
          </div>
        </aside>
      </div>

      <Sheet
        open={done !== null}
        onClose={() => {
          setDone(null);
          reset();
        }}
        title="Ingreso registrado"
      >
        {done && (
          <div className="flex flex-col items-center gap-4 pb-2 text-center">
            <CheckCircle2Icon className="size-14 text-success" aria-hidden />
            <Plate plate={done.plate} size="lg" className="w-auto px-6" />
            <p className="text-lg">
              Orden <b className="tabular-nums">#{done.number}</b> ·{' '}
              <StatusPill status={done.status} />
            </p>
            <div className="grid w-full gap-2 sm:grid-cols-2">
              <Link
                to={`/ticket/${done.id}`}
                target="_blank"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full border bg-card font-semibold hover:bg-muted"
              >
                <PrinterIcon className="size-5" /> Imprimir ticket
              </Link>
              <Link
                to={`/ordenes/${done.id}`}
                className="inline-flex h-12 items-center justify-center rounded-full border bg-card font-semibold hover:bg-muted"
              >
                Ver orden
              </Link>
            </div>
            <Button
              size="touch"
              className="w-full"
              onClick={() => {
                setDone(null);
                reset();
              }}
            >
              Nuevo ingreso
            </Button>
            <p className="text-xs text-muted-foreground">Placa {formatPlate(done.plate)}</p>
          </div>
        )}
      </Sheet>
    </form>
  );
}
