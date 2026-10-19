import { formatCOP } from '@motospa/shared';
import { Link } from 'react-router-dom';
import { useOccupancy, useParkingRate } from '@/api/operations';
import { ErrorNote, PageHeader, Panel, SectionLabel } from '@/components/kit';
import { Plate } from '@/components/plate';
import { formatElapsed, useNow } from '@/lib/hooks';
import { cn } from '@/lib/utils';

/** Más de este tiempo se resalta como estadía larga (SPEC §4.4). */
const LONG_STAY_MS = 8 * 60 * 60 * 1000;

export default function ParqueaderoPage() {
  const occupancy = useOccupancy();
  const rate = useParkingRate();
  const now = useNow(30_000);
  const o = occupancy.data;
  const r = rate.data;
  const free = o ? o.totalSpots - o.occupied : 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Parqueadero"
        subtitle={
          o ? `${o.parked} motos parqueadas · ${free} de ${o.totalSpots} cupos libres` : 'Cargando…'
        }
      />
      <ErrorNote error={occupancy.error} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <Panel>
          <SectionLabel>Cupos</SectionLabel>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {(o?.spots ?? []).map((s) => {
              const occ = s.occupiedBy;
              const long = occ && now - new Date(occ.entryAt).getTime() > LONG_STAY_MS;
              const content = (
                <>
                  <span className="text-xs font-semibold text-muted-foreground">{s.code}</span>
                  {occ ? (
                    <>
                      <Plate plate={occ.plate} size="sm" />
                      <span
                        className={cn(
                          'text-[11px] tabular-nums',
                          long ? 'font-bold text-warning' : 'text-muted-foreground',
                        )}
                      >
                        {formatElapsed(occ.entryAt, now)}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm font-semibold text-success">Libre</span>
                  )}
                </>
              );
              const cls = cn(
                'flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl p-2 text-center',
                occ ? 'bg-secondary' : 'border border-dashed border-success/40 bg-success-soft/40',
              );
              return occ ? (
                <Link
                  key={s.id}
                  to={`/ordenes/${occ.workOrderId}`}
                  className={cn(cls, 'hover:bg-accent')}
                >
                  {content}
                </Link>
              ) : (
                <div key={s.id} className={cls}>
                  {content}
                </div>
              );
            })}
          </div>
          {(o?.withoutSpot.length ?? 0) > 0 && (
            <>
              <SectionLabel>Parqueadas sin cupo asignado</SectionLabel>
              <ul className="flex flex-wrap gap-2">
                {o!.withoutSpot.map((w) => (
                  <li key={w.sessionId}>
                    <Link
                      to={`/ordenes/${w.workOrderId}`}
                      className="flex items-center gap-2 rounded-full bg-secondary py-1 pr-3 pl-1 hover:bg-accent"
                    >
                      <Plate plate={w.plate} size="sm" />
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatElapsed(w.entryAt, now)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        <Panel>
          <SectionLabel>Tarifa vigente</SectionLabel>
          {r ? (
            <dl className="flex flex-col gap-2 text-sm">
              <Row label="Tarifa" value={r.name} />
              <Row
                label="Valor"
                value={`${formatCOP(r.pricePerUnit)} por ${
                  r.mode === 'FRACTION'
                    ? `${r.fractionMinutes} min`
                    : r.mode === 'HOUR'
                      ? 'hora'
                      : r.mode === 'DAY'
                        ? 'día'
                        : 'minuto'
                }`}
              />
              <Row label="Gracia" value={`${r.graceMinutes} min gratis`} />
              {r.nightStart && r.nightPrice !== null && (
                <Row
                  label="Nocturna"
                  value={`${r.nightStart}–${r.nightEnd} · ${formatCOP(r.nightPrice)}`}
                />
              )}
              {r.dailyCap !== null && (
                <Row label="Tope" value={`${formatCOP(r.dailyCap)} cada 24 h`} />
              )}
              <Row
                label="Cortesía por lavado"
                value={`Durante el servicio + ${r.courtesyMinutes} min`}
              />
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No hay una tarifa activa.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
