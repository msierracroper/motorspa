import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Car,
  ClipboardList,
  HandCoins,
  House,
  LayoutGrid,
  LogOutIcon,
  type LucideIcon,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  SquareParking,
  Users,
  Wallet,
  Wrench,
  XIcon,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { signOut } from '@/api/auth';
import { Plate } from '@/components/plate';
import { Button } from '@/components/ui/button';
import { visibleNavItems, type NavItem } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { useCurrentUser } from './currentUser';

/** Íconos por ruta. */
const ICONS: Record<string, LucideIcon> = {
  '/': House,
  '/recepcion': Car,
  '/ordenes': ClipboardList,
  '/mis-servicios': Wrench,
  '/caja': Wallet,
  '/parqueadero': SquareParking,
  '/clientes': Users,
  '/catalogo': BookOpen,
  '/agenda': CalendarDays,
  '/inventario': Package,
  '/gastos': Receipt,
  '/personal': HandCoins,
  '/reportes': BarChart3,
  '/configuracion': Settings,
  '/auditoria': ShieldCheck,
};

/** Máximo de opciones en la barra inferior del celular (regla: ≤ 5 contando "Más"). */
const BOTTOM_NAV_MAX = 4;

/** Armazón autenticado: panel lateral (PC), barra inferior (celular) y la página actual. */
export function AppShell() {
  const user = useCurrentUser();
  const items = visibleNavItems(user.permissions);
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleSignOut = () => {
    signOut();
    queryClient.clear(); // descarta datos del usuario anterior
  };

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  const needsMore = items.length > BOTTOM_NAV_MAX;
  const bottomItems = needsMore ? items.slice(0, BOTTOM_NAV_MAX - 1) : items;
  const initials = user.fullName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const navLink = (item: NavItem) => {
    const Icon = ICONS[item.href] ?? LayoutGrid;
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        to={item.href}
        onClick={() => setSheetOpen(false)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-12 items-center gap-3 rounded-2xl px-4 text-[15px] font-medium transition-colors',
          active
            ? 'bg-brand-gradient text-primary-foreground shadow-[0_8px_18px_-10px_rgb(10_127_194/0.8)]'
            : 'text-foreground hover:bg-muted',
        )}
      >
        <Icon className="size-5 shrink-0" aria-hidden />
        {item.label}
      </Link>
    );
  };

  const userBox = (
    <div className="flex flex-col gap-3 rounded-2xl bg-muted p-3">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-brand-gradient font-heading font-bold text-primary-foreground">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{user.fullName}</p>
          <p className="truncate text-sm text-muted-foreground">{user.roles.join(', ')}</p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full gap-2 rounded-full bg-card"
        onClick={handleSignOut}
      >
        <LogOutIcon /> Salir
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-full flex-1">
      {/* PC: panel lateral */}
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 p-4 lg:block">
        <div className="flex h-full flex-col gap-6 rounded-3xl bg-card p-4 shadow-soft">
          <div className="px-2 pt-2">
            <Plate plate="MOTO SPA" raw size="md" className="-rotate-2" />
          </div>
          <nav
            aria-label="Principal"
            className="-mr-2 flex flex-1 flex-col gap-1 overflow-y-auto pr-2 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
          >
            {items.map(navLink)}
          </nav>
          {userBox}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Celular: encabezado */}
        <header className="sticky top-0 z-30 flex items-center justify-between bg-background/85 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 backdrop-blur lg:hidden">
          <Plate plate="MOTO SPA" raw size="sm" className="-rotate-2" />
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="Abrir menú y cuenta"
            className="grid size-11 place-items-center rounded-full bg-brand-gradient font-heading font-bold text-primary-foreground shadow-soft"
          >
            {initials}
          </button>
        </header>

        <main className="flex-1 px-4 pt-2 pb-32 lg:p-8">
          <Outlet />
        </main>

        {/* Celular: barra inferior flotante */}
        <nav
          aria-label="Principal"
          className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden"
        >
          <div
            className="mx-auto grid max-w-md rounded-3xl bg-card p-1.5 shadow-[0_8px_30px_-12px_rgb(12_42_58/0.35)]"
            style={{
              gridTemplateColumns: `repeat(${bottomItems.length + (needsMore ? 1 : 0)}, 1fr)`,
            }}
          >
            {bottomItems.map((item) => {
              const Icon = ICONS[item.href] ?? LayoutGrid;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-medium transition-colors',
                    active ? 'bg-secondary text-primary' : 'text-muted-foreground',
                  )}
                >
                  <Icon className="size-6" aria-hidden />
                  <span className="max-w-full truncate px-1">{item.label}</span>
                </Link>
              );
            })}
            {needsMore && (
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-medium text-muted-foreground"
              >
                <LayoutGrid className="size-6" aria-hidden />
                Más
              </button>
            )}
          </div>
        </nav>

        {/* Celular: hoja con todas las opciones y la cuenta */}
        {sheetOpen && (
          <div
            className="fixed inset-0 z-40 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Menú"
          >
            <button
              type="button"
              aria-label="Cerrar menú"
              className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px] animate-in fade-in"
              onClick={() => setSheetOpen(false)}
            />
            <div className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col gap-4 rounded-t-[2rem] bg-card p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-soft animate-in slide-in-from-bottom duration-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Menú</h2>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label="Cerrar menú"
                  onClick={() => setSheetOpen(false)}
                >
                  <XIcon className="size-6" />
                </Button>
              </div>
              <nav aria-label="Todas las secciones" className="flex flex-col gap-1 overflow-y-auto">
                {items.map(navLink)}
              </nav>
              {userBox}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
