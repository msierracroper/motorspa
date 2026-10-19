import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { signOut, useSession } from '@/api/auth';
import { ApiError } from '@/api/client';
import { useMe } from '@/api/me';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { visibleNavItems } from '@/lib/navigation';
import { AppShell } from './AppShell';
import { CurrentUserContext } from './currentUser';

const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const InicioPage = lazy(() => import('@/features/inicio/InicioPage'));
const ModulePlaceholder = lazy(() => import('@/features/modulos/ModulePlaceholder'));
const NotFoundPage = lazy(() => import('@/features/modulos/NotFoundPage'));
const OrderDetailPage = lazy(() => import('@/features/ordenes/OrderDetailPage'));
const TicketPage = lazy(() => import('@/features/ticket/TicketPage'));

/** Pantallas construidas (Fase 1). Los demás módulos muestran "En construcción". */
const PAGES: Record<string, LazyExoticComponent<ComponentType>> = {
  '/recepcion': lazy(() => import('@/features/recepcion/RecepcionPage')),
  '/ordenes': lazy(() => import('@/features/ordenes/OrdenesPage')),
  '/mis-servicios': lazy(() => import('@/features/mis-servicios/MisServiciosPage')),
  '/caja': lazy(() => import('@/features/caja/CajaPage')),
  '/parqueadero': lazy(() => import('@/features/parqueadero/ParqueaderoPage')),
  '/clientes': lazy(() => import('@/features/clientes/ClientesPage')),
  '/catalogo': lazy(() => import('@/features/catalogo/CatalogoPage')),
  '/reportes': lazy(() => import('@/features/reportes/ReportesPage')),
};

const page = (node: ReactNode) => <Suspense fallback={null}>{node}</Suspense>;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 1,
      refetchOnWindowFocus: true,
    },
  },
});

function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center font-semibold text-muted-foreground">
      Cargando…
    </div>
  );
}

function Problem({
  title,
  children,
  action,
}: {
  title: string;
  children: string;
  action: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-card p-6 text-center shadow-soft">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{children}</p>
        {action}
      </div>
    </div>
  );
}

/** Decide qué ve la persona según su sesión y sus permisos. */
function Gate() {
  const session = useSession();
  const me = useMe(session?.user.id);

  if (session === undefined) return <Loading />;
  if (!session) {
    return (
      <Suspense fallback={<Loading />}>
        <LoginPage />
      </Suspense>
    );
  }
  if (me.isPending) return <Loading />;

  if (me.isError) {
    const offline = me.error instanceof ApiError && me.error.status === 0;
    return offline ? (
      <Problem
        title="Sin conexión con el servidor"
        action={
          <Button size="touch" onClick={() => void me.refetch()}>
            Reintentar
          </Button>
        }
      >
        Revisa tu conexión a internet e intenta de nuevo.
      </Problem>
    ) : (
      <Problem
        title="No pudimos abrir tu cuenta"
        action={
          <Button size="touch" variant="outline" className="rounded-full" onClick={signOut}>
            Salir
          </Button>
        }
      >
        Tu usuario puede estar inactivo. Pídele al administrador que lo revise.
      </Problem>
    );
  }

  const modules = visibleNavItems(me.data.permissions).filter((i) => i.href !== '/');
  const canSeeOrders = me.data.permissions.some(
    (p) => p === 'orders.view_all' || p === 'orders.view_own',
  );

  return (
    <CurrentUserContext.Provider value={me.data}>
      <Routes>
        {/* Ticket imprimible: sin menú */}
        {canSeeOrders && <Route path="ticket/:id" element={page(<TicketPage />)} />}
        <Route element={<AppShell />}>
          <Route index element={page(<InicioPage />)} />
          {modules.map((item) => {
            const Page = PAGES[item.href];
            return (
              <Route
                key={item.href}
                path={item.href.slice(1)}
                element={page(Page ? <Page /> : <ModulePlaceholder item={item} />)}
              />
            );
          })}
          {canSeeOrders && <Route path="ordenes/:id" element={page(<OrderDetailPage />)} />}
          <Route path="*" element={page(<NotFoundPage />)} />
        </Route>
      </Routes>
    </CurrentUserContext.Provider>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
