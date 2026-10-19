import { useBoard, useOrderAction } from '@/api/operations';
import { useCurrentUser } from '@/app/currentUser';
import { EmptyState, ErrorNote, ItemPill, PageHeader } from '@/components/kit';
import { Plate } from '@/components/plate';
import { Button } from '@/components/ui/button';
import { formatElapsed, useNow } from '@/lib/hooks';
import { cn } from '@/lib/utils';

/** Vista del lavador (SPEC §10.6): sus servicios y los libres para tomar. */
export default function MisServiciosPage() {
  const me = useCurrentUser();
  const board = useBoard();
  const action = useOrderAction();
  const now = useNow(5_000);

  const tasks = (board.data ?? [])
    .flatMap((o) =>
      o.items
        .filter((i) => i.status === 'PENDING' || i.status === 'IN_PROGRESS')
        .map((i) => ({ order: o, item: i, mine: i.staff.length > 0 })),
    )
    // Primero lo que está en curso, luego lo asignado, luego lo libre
    .sort(
      (a, b) =>
        Number(b.item.status === 'IN_PROGRESS') - Number(a.item.status === 'IN_PROGRESS') ||
        Number(b.mine) - Number(a.mine),
    );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Mis servicios"
        subtitle={`${me.fullName.split(' ')[0]}, toca Iniciar al empezar y Terminar al acabar`}
      />
      <ErrorNote error={board.error ?? action.error} />
      {board.isPending ? (
        <div className="h-48 animate-pulse rounded-xl bg-card/70" />
      ) : tasks.length === 0 ? (
        <EmptyState title="No tienes servicios pendientes">
          Cuando recepción registre una moto, la verás aquí.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tasks.map(({ order, item, mine }) => {
            const running = item.status === 'IN_PROGRESS' && item.startedAt;
            const elapsedMs = running ? now - new Date(item.startedAt!).getTime() : 0;
            const late = running && elapsedMs > item.estimatedMinutes * 60_000;
            return (
              <article
                key={item.id}
                className={cn(
                  'flex flex-col gap-4 rounded-xl bg-card p-5 shadow-soft',
                  running && 'ring-2 ring-info/40',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <Plate plate={order.plate} size="md" />
                  <ItemPill status={item.status} />
                </div>
                <div>
                  <p className="font-heading text-xl font-bold">{item.description}</p>
                  <p className="text-sm text-muted-foreground">
                    {[order.brand, order.model].filter(Boolean).join(' ')}
                    {order.cc ? ` · ${order.cc} cc` : ''} · #{order.number}
                  </p>
                  {!mine && (
                    <p className="mt-1 text-sm font-semibold text-info">
                      Libre: al iniciarlo queda a tu nombre
                    </p>
                  )}
                </div>
                {running ? (
                  <p
                    className={cn(
                      'font-heading text-5xl font-bold tabular-nums',
                      late ? 'text-warning' : 'text-foreground',
                    )}
                  >
                    {formatElapsed(item.startedAt!, now)}
                    <span className="ml-2 font-sans text-base font-medium text-muted-foreground">
                      de {item.estimatedMinutes} min
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Tiempo estimado: {item.estimatedMinutes} min
                  </p>
                )}
                <Button
                  size="touch"
                  className="h-14 text-lg"
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      kind: item.status === 'PENDING' ? 'start' : 'finish',
                      itemId: item.id,
                    })
                  }
                >
                  {item.status === 'PENDING' ? 'Iniciar' : 'Terminar'}
                </Button>
              </article>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Tus comisiones se verán aquí en la Fase 2.</p>
    </div>
  );
}
