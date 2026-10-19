import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { NavItem } from '@/lib/navigation';

/** Página provisional para los módulos aún no construidos (Fase 0). */
export default function ModulePlaceholder({ item }: { item: NavItem }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-extrabold tracking-tight">{item.label}</h1>
      <Card>
        <CardHeader>
          <CardTitle>En construcción</CardTitle>
          <CardDescription>Este módulo se construye en la Fase {item.phase}.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
