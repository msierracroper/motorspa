import { PERMISSIONS as P, SYSTEM_ROLE_PERMISSIONS, SYSTEM_ROLES } from '@motospa/shared';
import { hasPermissions } from './auth-context.js';

describe('hasPermissions', () => {
  it('permite cuando no se exige ningún permiso', () => {
    expect(hasPermissions([], [])).toBe(true);
  });

  it('exige TODOS los permisos requeridos', () => {
    expect(hasPermissions([P.PAYMENTS_CHARGE], [P.PAYMENTS_CHARGE, P.PAYMENTS_VOID])).toBe(false);
    expect(hasPermissions([P.PAYMENTS_CHARGE, P.PAYMENTS_VOID], [P.PAYMENTS_VOID])).toBe(true);
  });
});

describe('matriz de permisos (SPEC sección 8)', () => {
  const perms = (role: keyof typeof SYSTEM_ROLES) => SYSTEM_ROLE_PERMISSIONS[SYSTEM_ROLES[role]];

  it('solo el Admin liquida comisiones y ve la auditoría', () => {
    expect(perms('ADMIN')).toEqual(expect.arrayContaining([P.COMMISSIONS_SETTLE, P.AUDIT_VIEW]));
    for (const role of ['SUPERVISOR', 'CASHIER', 'WASHER'] as const) {
      expect(perms(role)).not.toContain(P.COMMISSIONS_SETTLE);
      expect(perms(role)).not.toContain(P.AUDIT_VIEW);
    }
  });

  it('el cajero no anula pagos ni autoriza descuentos mayores', () => {
    expect(perms('CASHIER')).not.toContain(P.PAYMENTS_VOID);
    expect(perms('CASHIER')).not.toContain(P.DISCOUNTS_AUTHORIZE);
  });

  it('el lavador solo ve lo suyo y no cobra', () => {
    expect([...perms('WASHER')].sort()).toEqual(
      [P.COMMISSIONS_VIEW_OWN, P.ORDERS_EXECUTE, P.ORDERS_VIEW_OWN].sort(),
    );
  });
});
