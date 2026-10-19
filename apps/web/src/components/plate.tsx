import { cn } from '@/lib/utils';

const sizes = {
  sm: 'rounded-md border-[1.5px] px-2 py-1 text-[13px]',
  md: 'rounded-lg border-2 px-3 py-1.5 text-lg',
  lg: 'w-full rounded-xl border-2 px-4 py-2.5 text-3xl',
} as const;

interface PlateProps {
  plate: string;
  size?: keyof typeof sizes;
  /** Muestra el texto tal cual, sin formato de placa (p. ej. el logotipo). */
  raw?: boolean;
  className?: string;
}

/** Formato visual de placa de moto colombiana: ABC12D → "ABC 12D". */
export function formatPlate(plate: string): string {
  const p = plate.replace(/\s+/g, '').toUpperCase();
  return p.length === 6 ? `${p.slice(0, 3)} ${p.slice(3)}` : p;
}

/** Placa de moto en amarillo suave: el ancla visual de cada moto (SPEC decisión 19). */
export function Plate({ plate, size = 'md', raw = false, className }: PlateProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center border-plate-edge bg-plate leading-none font-extrabold tracking-[0.06em] whitespace-nowrap text-plate-ink tabular-nums',
        sizes[size],
        className,
      )}
    >
      {raw ? plate : formatPlate(plate)}
    </span>
  );
}
