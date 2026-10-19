import type { WorkOrderStatus } from '@motospa/shared';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useBoard, type BoardOrder } from '@/api/operations';
import { EmptyState, ErrorNote, PageHeader, Segmented } from '@/components/kit';
import { useNow } from '@/lib/hooks';
import { OrderCard } from './OrderCard';

const COLUMNS: { key: string; label: string; statuses: WorkOrderStatus[] }[] = [
  { key: 'queue', label: 'En cola', statuses: ['RECEIVED', 'QUEUED'] },
  { key: 'progress', label: 'Lavando', statuses: ['IN_PROGRESS'] },
  { key: 'ready', label: 'Listas', statuses: ['READY'] },
];

export default function OrdenesPage() {
  const board = useBoard();
  const now = useNow(30_000);
  const [tab, setTab] = useState('queue');
  const orders = board.data ?? [];
  const byColumn = (statuses: WorkOrderStatus[]) =>
    orders.filter((o) => statuses.includes(o.status));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Órdenes"
        subtitle={`${orders.length} ${orders.length === 1 ? 'moto' : 'motos'} en sede · se actualiza cada 10 s`}
        actions={
          <Link
            to="/recepcion"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-gradient px-5 font-semibold text-primary-foreground"
          >
            <PlusIcon className="size-5" /> Nuevo ingreso
          </Link>
        }
      />
      <ErrorNote error={board.error} />

      {/* Celular: pestañas por estado */}
      <div className="lg:hidden">
        <Segmented
          label="Estado"
          value={tab}
          onChange={setTab}
          options={COLUMNS.map((c) => ({
            value: c.key,
            label: `${c.label} ${byColumn(c.statuses).length}`,
          }))}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {COLUMNS.map((c) => (
          <Column
            key={c.key}
            label={c.label}
            orders={byColumn(c.statuses)}
            now={now}
            hiddenOnMobile={tab !== c.key}
            loading={board.isPending}
          />
        ))}
      </div>
    </div>
  );
}

function Column({
  label,
  orders,
  now,
  hiddenOnMobile,
  loading,
}: {
  label: string;
  orders: BoardOrder[];
  now: number;
  hiddenOnMobile: boolean;
  loading: boolean;
}) {
  return (
    <section className={hiddenOnMobile ? 'hidden flex-col gap-3 lg:flex' : 'flex flex-col gap-3'}>
      <h2 className="hidden items-center justify-between font-sans text-sm font-semibold text-muted-foreground lg:flex">
        {label} <span className="tabular-nums">{orders.length}</span>
      </h2>
      {loading ? (
        <div className="h-36 animate-pulse rounded-xl bg-card/70" />
      ) : orders.length === 0 ? (
        <EmptyState title="Sin motos aquí" />
      ) : (
        orders.map((o) => <OrderCard key={o.id} order={o} now={now} />)
      )}
    </section>
  );
}
