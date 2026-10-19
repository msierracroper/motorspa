import { Suspense } from 'react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getMe } from '@/lib/api';

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<div className="h-16 w-2/3 animate-pulse rounded-2xl bg-muted" />}>
        <Greeting />
      </Suspense>
      <Card>
        <CardHeader>
          <CardTitle>Panel del día</CardTitle>
          <CardDescription>
            Aquí verás las ventas, las motos en sede, la ocupación y las alertas (Fase 1).
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

/** La sesión se lee detrás de <Suspense> para que la navegación sea instantánea. */
async function Greeting() {
  const me = await getMe();
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-3xl font-extrabold tracking-tight">Hola, {me.fullName.split(' ')[0]}</h1>
      <p className="text-muted-foreground">{me.roles.join(', ')}</p>
    </div>
  );
}
