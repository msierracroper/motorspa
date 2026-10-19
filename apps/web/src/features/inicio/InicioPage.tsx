import { useCurrentUser } from '@/app/currentUser';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function InicioPage() {
  const me = useCurrentUser();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight">
          Hola, {me.fullName.split(' ')[0]}
        </h1>
        <p className="text-muted-foreground">{me.roles.join(', ')}</p>
      </div>
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
