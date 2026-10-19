import { formatCOP, WORK_ORDER_TYPE_LABEL } from '@motospa/shared';
import { useState } from 'react';
import { useDailyReport } from '@/api/operations';
import { EmptyState, ErrorNote, Money, PageHeader, Panel, SectionLabel } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { formatTime, todayInColombia } from '@/lib/hooks';

/** Reporte diario de ventas y de caja (SPEC §13, Fase 1). */
export default function ReportesPage() {
  const [date, setDate] = useState(todayInColombia);
  const report = useDailyReport(date);
  const r = report.data;
  const maxMethod = Math.max(1, ...(r?.byMethod.map((m) => m.total) ?? [0]));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Reporte del día"
        subtitle={r?.scope === 'OWN_SHIFTS' ? 'Solo tus turnos de caja' : 'Toda la sede'}
        actions={
          <Input
            type="date"
            aria-label="Fecha del reporte"
            value={date}
            max={todayInColombia()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-44"
          />
        }
      />
      <ErrorNote error={report.error} />
      {!r ? (
        <div className="h-48 animate-pulse rounded-xl bg-card/70" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Ventas" value={formatCOP(r.sales.total)} sub={`${r.sales.count} cobros`} />
            <Stat label="Servicios" value={formatCOP(r.sales.services)} />
            <Stat label="Parqueo" value={formatCOP(r.sales.parking)} />
            <Stat label="Descuentos" value={formatCOP(r.sales.discounts)} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel>
              <SectionLabel>Por medio de pago</SectionLabel>
              {r.byMethod.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin cobros este día.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {r.byMethod.map((m) => (
                    <li key={m.methodId} className="flex flex-col gap-1">
                      <div className="flex justify-between text-sm">
                        <span>{m.method}</span>
                        <Money amount={m.total} className="font-semibold" />
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div
                          className="h-full rounded-full bg-brand-gradient"
                          style={{ width: `${(m.total / maxMethod) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel>
              <SectionLabel>Por servicio</SectionLabel>
              {r.byService.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin servicios cobrados.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-semibold">Servicio</th>
                      <th className="pb-2 text-right font-semibold">Cant.</th>
                      <th className="pb-2 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {r.byService.map((s) => (
                      <tr key={s.service}>
                        <td className="py-1.5">{s.service}</td>
                        <td className="py-1.5 text-right tabular-nums">{s.count}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatCOP(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel>
              <SectionLabel>Motos atendidas</SectionLabel>
              {r.orders.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin ingresos este día.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-semibold">Tipo</th>
                      <th className="pb-2 text-right font-semibold">Ingresos</th>
                      <th className="pb-2 text-right font-semibold">Entregadas</th>
                      <th className="pb-2 text-right font-semibold">Canceladas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {r.orders.map((o) => (
                      <tr key={o.type}>
                        <td className="py-1.5">{WORK_ORDER_TYPE_LABEL[o.type]}</td>
                        <td className="py-1.5 text-right tabular-nums">{o.checkedIn}</td>
                        <td className="py-1.5 text-right tabular-nums">{o.delivered}</td>
                        <td className="py-1.5 text-right tabular-nums">{o.cancelled}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>

            <Panel>
              <SectionLabel>Turnos de caja</SectionLabel>
              {r.shifts.length === 0 ? (
                <EmptyState title="Sin turnos este día" />
              ) : (
                <ul className="flex flex-col divide-y text-sm">
                  {r.shifts.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                      <span>
                        {s.cashier}
                        <br />
                        <span className="text-muted-foreground">
                          {formatTime(s.openedAt)} –{' '}
                          {s.closedAt ? formatTime(s.closedAt) : 'abierto'}
                        </span>
                      </span>
                      {s.status === 'CLOSED' ? (
                        <span
                          className={
                            s.difference === 0
                              ? 'font-semibold text-success'
                              : 'font-semibold text-warning'
                          }
                        >
                          {s.difference === 0
                            ? 'Cuadró'
                            : `${(s.difference ?? 0) > 0 ? 'Sobró' : 'Faltó'} ${formatCOP(Math.abs(s.difference ?? 0))}`}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">En curso</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-card p-4 shadow-soft">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="font-heading text-xl font-bold tabular-nums">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}
