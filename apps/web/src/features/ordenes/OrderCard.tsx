import { WORK_ORDER_TYPE_LABEL } from '@motospa/shared';
import { Link } from 'react-router-dom';
import type { BoardOrder } from '@/api/operations';
import { Money, StatusPill } from '@/components/kit';
import { Plate } from '@/components/plate';
import { formatElapsed } from '@/lib/hooks';
import { cn } from '@/lib/utils';

/** Tarjeta de orden para el tablero: placa, servicios, lavadores y tiempos. */
export function OrderCard({ order, now }: { order: BoardOrder; now: number }) {
  const active = order.items.filter((i) => i.status !== 'CANCELLED');
  const running = active.find((i) => i.status === 'IN_PROGRESS');
  const late =
    running?.startedAt &&
    now - new Date(running.startedAt).getTime() > running.estimatedMinutes * 60_000;
  const staff = [...new Set(active.flatMap((i) => i.staff.map((s) => s.fullName)))];
  const total = active.reduce((s, i) => s + i.unitPrice, 0);

  return (
    <Link
      to={`/ordenes/${order.id}`}
      className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-soft transition-transform hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-2">
        <Plate plate={order.plate} size="md" />
        <StatusPill status={order.status} />
      </div>
      <div className="flex flex-col gap-0.5 text-sm">
        <span className="font-semibold">
          {active.length
            ? active.map((i) => i.description).join(' · ')
            : WORK_ORDER_TYPE_LABEL[order.type]}
        </span>
        <span className="text-muted-foreground">
          #{order.number}
          {order.customerName ? ` · ${order.customerName}` : ''}
          {order.spotCode ? ` · Cupo ${order.spotCode}` : ''}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          {staff.length ? staff.join(', ') : active.length ? 'Sin lavador' : ''}
        </span>
        <span
          className={cn(
            'font-semibold tabular-nums',
            late ? 'text-warning' : 'text-muted-foreground',
          )}
        >
          {running?.startedAt
            ? `${formatElapsed(running.startedAt, now)} de ${running.estimatedMinutes} min`
            : order.status === 'READY' && order.readyAt
              ? `Lista hace ${formatElapsed(order.readyAt, now)}`
              : `Llegó hace ${formatElapsed(order.checkedInAt, now)}`}
        </span>
      </div>
      {(total > 0 || order.paidAt) && (
        <div className="flex items-center justify-between border-t pt-2 text-sm">
          <Money amount={total} className="font-semibold" />
          <span
            className={cn(
              'text-xs font-semibold',
              order.paidAt ? 'text-success' : 'text-muted-foreground',
            )}
          >
            {order.paidAt ? 'Pagada' : 'Por cobrar'}
          </span>
        </div>
      )}
    </Link>
  );
}
