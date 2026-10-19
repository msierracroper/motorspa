import type { Metadata } from 'next';
import { Plate } from '@/components/plate';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Ingresar' };

export default function LoginPage() {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-10">
      {/* Fondo: burbujas suaves de la identidad Espuma */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -right-16 size-72 rounded-full bg-brand-2/15" />
        <div className="absolute -bottom-28 -left-20 size-80 rounded-full bg-brand/10" />
        <div className="absolute top-1/3 left-[12%] size-10 rounded-full border border-brand/25 bg-brand-2/10" />
      </div>

      <div className="relative flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <h1>
            <Plate plate="MOTO SPA" raw size="lg" className="w-auto -rotate-2 px-6 text-4xl" />
          </h1>
          <p className="text-muted-foreground">Lavadero y parqueadero de motos</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
