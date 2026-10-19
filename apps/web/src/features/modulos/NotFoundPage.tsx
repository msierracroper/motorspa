import { Link } from 'react-router-dom';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Ruta inexistente o sin permiso para el rol actual. */
export default function NotFoundPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Página no encontrada</h1>
      <Card>
        <CardHeader>
          <CardTitle>No existe o no tienes acceso</CardTitle>
          <CardDescription>
            Revisa la dirección o vuelve al{' '}
            <Link to="/" className="font-semibold text-primary underline-offset-4 hover:underline">
              inicio
            </Link>
            .
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
