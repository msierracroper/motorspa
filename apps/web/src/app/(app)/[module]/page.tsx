import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getMe } from '@/lib/api';
import { NAV_ITEMS, visibleNavItems } from '@/lib/navigation';

/** Los módulos son fijos y se conocen en el build. */
export function generateStaticParams() {
  return NAV_ITEMS.filter((i) => i.href !== '/').map((i) => ({ module: i.href.slice(1) }));
}

/**
 * Página provisional para los módulos aún no construidos (Fase 0).
 * No espera `params` aquí: los pasa a un componente dentro de <Suspense>
 * (patrón de navegación instantánea de Next.js 16).
 */
export default function ModulePlaceholderPage({ params }: PageProps<'/[module]'>) {
  return (
    <Suspense fallback={<ModuleSkeleton />}>
      <ModuleContent params={params} />
    </Suspense>
  );
}

async function ModuleContent({ params }: { params: PageProps<'/[module]'>['params'] }) {
  const { module } = await params;
  const item = NAV_ITEMS.find((i) => i.href === `/${module}`);
  if (!item) notFound();

  const me = await getMe();
  if (!visibleNavItems(me.permissions).some((i) => i.href === item.href)) notFound();

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

function ModuleSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Cargando módulo">
      <div className="h-9 w-48 animate-pulse rounded-2xl bg-muted" />
      <Card className="h-24 animate-pulse" />
    </div>
  );
}
