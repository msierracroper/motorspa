import { redirect } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { ApiError, getMe, type Me } from '@/lib/api';
import { visibleNavItems } from '@/lib/navigation';

/**
 * La sesión se lee en tiempo de petición, así que va detrás de <Suspense>
 * (requisito de Cache Components en Next.js 16).
 */
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <Suspense fallback={<p className="p-8 text-muted-foreground">Cargando…</p>}>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </Suspense>
  );
}

async function AuthenticatedShell({ children }: { children: ReactNode }) {
  let me: Me;
  try {
    me = await getMe();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login');
    throw err;
  }

  return (
    <AppShell
      user={{ fullName: me.fullName, roles: me.roles }}
      items={visibleNavItems(me.permissions)}
    >
      {children}
    </AppShell>
  );
}
