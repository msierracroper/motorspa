import { formatCOP, type PriceRange } from '@motospa/shared';
import { useServices } from '@/api/operations';
import { ErrorNote, PageHeader, Panel } from '@/components/kit';

const rangeLabel = (p: PriceRange) =>
  p.ccMin === null && p.ccMax === null
    ? 'Precio único'
    : p.ccMin === null
      ? `Hasta ${p.ccMax} cc`
      : p.ccMax === null
        ? `Más de ${p.ccMin - 1} cc`
        : `${p.ccMin}–${p.ccMax} cc`;

/** Catálogo de servicios con precios por cilindraje (consulta; la edición llega con la configuración). */
export default function CatalogoPage() {
  const services = useServices();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Catálogo"
        subtitle="Servicios y precios por cilindraje (datos de prueba)"
      />
      <ErrorNote error={services.error} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(services.data ?? []).map((s) => (
          <Panel key={s.id}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-bold">{s.name}</h2>
              <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold">
                {s.estimatedMinutes} min
              </span>
            </div>
            {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}
            <dl className="flex flex-col divide-y text-sm">
              {s.prices.map((p) => (
                <div key={`${p.ccMin}-${p.ccMax}`} className="flex justify-between py-1.5">
                  <dt className="text-muted-foreground">{rangeLabel(p)}</dt>
                  <dd className="font-semibold tabular-nums">{formatCOP(p.price)}</dd>
                </div>
              ))}
            </dl>
            {s.category && <span className="text-xs text-muted-foreground">{s.category}</span>}
          </Panel>
        ))}
      </div>
    </div>
  );
}
