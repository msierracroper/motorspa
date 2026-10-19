import { WORK_ORDER_TYPE_LABEL } from '@motospa/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCustomers, useMotoHistory, usePlateSearch } from '@/api/operations';
import {
  EmptyState,
  ErrorNote,
  PageHeader,
  Panel,
  SectionLabel,
  StatusPill,
} from '@/components/kit';
import { Plate } from '@/components/plate';
import { Input } from '@/components/ui/input';
import { formatDateTime } from '@/lib/hooks';

export default function ClientesPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [plate, setPlate] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const customers = useCustomers(debounced);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Clientes y motos" subtitle="Busca por nombre, teléfono o placa" />
      <Input
        aria-label="Buscar cliente"
        placeholder="Ej.: Andrés, 310…, KXT45F"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-xl"
      />
      <ErrorNote error={customers.error} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <Panel>
          {customers.isPending ? (
            <div className="h-32 animate-pulse rounded-xl bg-muted" />
          ) : (customers.data?.length ?? 0) === 0 ? (
            <EmptyState title="Sin resultados">
              Los clientes se crean desde Recepción al registrar una moto.
            </EmptyState>
          ) : (
            <ul className="flex flex-col divide-y">
              {customers.data!.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{c.fullName}</p>
                    <p className="text-sm tabular-nums text-muted-foreground">
                      {c.phone ?? 'Sin teléfono'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {c.plates.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPlate(p)}
                        aria-label={`Ver historial de ${p}`}
                      >
                        <Plate plate={p} size="sm" />
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        {plate && <MotoHistory plate={plate} />}
      </div>
    </div>
  );
}

function MotoHistory({ plate }: { plate: string }) {
  const search = usePlateSearch(plate);
  const history = useMotoHistory(search.data?.motorcycle?.id);
  const m = search.data?.motorcycle;
  return (
    <Panel>
      <Plate plate={plate} size="md" className="self-start" />
      {m && (
        <p className="text-sm">
          {[m.brand, m.model].filter(Boolean).join(' ') || 'Moto'}
          {m.cc ? ` · ${m.cc} cc` : ''}
          {m.color ? ` · ${m.color}` : ''}
        </p>
      )}
      <SectionLabel>Historial ({search.data?.visits ?? 0} visitas completadas)</SectionLabel>
      <ul className="flex flex-col divide-y text-sm">
        {(history.data ?? []).map((h) => (
          <li key={h.id}>
            <Link
              to={`/ordenes/${h.id}`}
              className="flex items-center justify-between gap-2 py-2 hover:text-primary"
            >
              <span>
                #{h.number} · {WORK_ORDER_TYPE_LABEL[h.type]}
                <br />
                <span className="text-muted-foreground">{formatDateTime(h.checkedInAt)}</span>
              </span>
              <StatusPill status={h.status} />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
