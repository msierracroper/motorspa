/** Componentes base del sistema Espuma usados por las pantallas operativas. */
import {
  formatCOP,
  WORK_ORDER_STATUS_LABEL,
  type ItemStatus,
  type WorkOrderStatus,
} from '@motospa/shared';
import { XIcon } from 'lucide-react';
import { useEffect, useId, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------- dinero y estado
export function Money({ amount, className }: { amount: number; className?: string }) {
  return <span className={cn('tabular-nums', className)}>{formatCOP(amount)}</span>;
}

const STATUS_STYLE: Record<WorkOrderStatus, string> = {
  RECEIVED: 'bg-muted text-muted-foreground',
  QUEUED: 'bg-warning-soft text-warning',
  IN_PROGRESS: 'bg-info-soft text-info',
  READY: 'bg-success-soft text-success',
  DELIVERED: 'bg-muted text-muted-foreground',
  CANCELLED: 'bg-destructive/10 text-destructive',
};

/** Estado con color **y** texto (regla de diseño Espuma). */
export function StatusPill({ status, className }: { status: WorkOrderStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
        STATUS_STYLE[status],
        className,
      )}
    >
      {WORK_ORDER_STATUS_LABEL[status]}
    </span>
  );
}

const ITEM_LABEL: Record<ItemStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En curso',
  DONE: 'Terminado',
  CANCELLED: 'Cancelado',
};
const ITEM_STYLE: Record<ItemStatus, string> = {
  PENDING: 'bg-warning-soft text-warning',
  IN_PROGRESS: 'bg-info-soft text-info',
  DONE: 'bg-success-soft text-success',
  CANCELLED: 'bg-muted text-muted-foreground line-through',
};
export function ItemPill({ status }: { status: ItemStatus }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
        ITEM_STYLE[status],
      )}
    >
      {ITEM_LABEL[status]}
    </span>
  );
}

// ---------------------------------------------------------------- estructura
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-3 rounded-xl bg-card p-4 shadow-soft', className)}>
      {children}
    </section>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="font-sans text-sm font-semibold text-muted-foreground">{children}</h2>;
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card/60 px-6 py-10 text-center">
      <p className="font-heading text-lg font-bold">{title}</p>
      {children && <p className="max-w-sm text-sm text-muted-foreground">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'Ocurrió un error';
  return (
    <p
      role="alert"
      className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
    >
      {message}
    </p>
  );
}

// ---------------------------------------------------------------- controles
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1 rounded-full bg-accent p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-11 rounded-full px-2 text-sm font-semibold text-muted-foreground transition-all',
            value === o.value &&
              'bg-card text-foreground shadow-[0_2px_8px_-2px_rgb(12_42_58/0.25)]',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ToggleChip({
  pressed,
  onClick,
  children,
  disabled,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors disabled:opacity-50',
        pressed
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary text-foreground hover:bg-accent',
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'min-h-20 w-full rounded-xl border border-input bg-card px-4 py-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        props.className,
      )}
    />
  );
}

export function Select({
  value,
  onChange,
  children,
  id,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  id?: string;
  'aria-label'?: string;
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-12 w-full rounded-xl border border-input bg-card px-4 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {children}
    </select>
  );
}

/** Hoja inferior en el celular, ventana centrada en el PC. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px] animate-in fade-in"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-[2rem] bg-card shadow-soft animate-in slide-in-from-bottom duration-200 lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[34rem] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl lg:slide-in-from-bottom-4">
        <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-2">
          <h2 id={titleId} className="text-xl font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid size-11 place-items-center rounded-full hover:bg-muted"
          >
            <XIcon className="size-5" />
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}
