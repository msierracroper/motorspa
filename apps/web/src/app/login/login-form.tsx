'use client';

import { usernameToEmail } from '@motospa/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = String(form.get('username') ?? '');
    const password = String(form.get('password') ?? '');

    setPending(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    setPending(false);

    if (error) {
      setError('Usuario o contraseña incorrectos');
      return;
    }
    router.replace('/');
    router.refresh();
  }

  return (
    <Card className="[--card-spacing:--spacing(6)]">
      <CardHeader>
        <CardTitle>Ingresar</CardTitle>
        <CardDescription>
          Usa el usuario y la contraseña que te dio el administrador.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Usuario</Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="touch" disabled={pending} className="mt-2">
            {pending ? 'Ingresando…' : 'Ingresar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
