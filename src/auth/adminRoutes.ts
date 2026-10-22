import type { AppRole } from '../types';

export type AdminArea = 'admin' | 'operator';
export type ProtectedPath = '/admin/login' | '/admin' | '/operator/login' | '/operator';
export type AuthRouteState = 'loading' | 'configuration_error' | 'login' | 'unauthorized' | 'authorized';

export interface ProtectedRoute {
  area: AdminArea;
  path: ProtectedPath;
  login: boolean;
  allowedRoles: readonly AppRole[];
}

export const ADMIN_ROLES: readonly AppRole[] = ['admin', 'super_admin'];
export const OPERATOR_ROLES: readonly AppRole[] = ['operator', 'scanner'];

const PROTECTED_ROUTES: Readonly<Record<ProtectedPath, ProtectedRoute>> = {
  '/admin/login': { area: 'admin', path: '/admin/login', login: true, allowedRoles: ADMIN_ROLES },
  '/admin': { area: 'admin', path: '/admin', login: false, allowedRoles: ADMIN_ROLES },
  '/operator/login': { area: 'operator', path: '/operator/login', login: true, allowedRoles: OPERATOR_ROLES },
  '/operator': { area: 'operator', path: '/operator', login: false, allowedRoles: OPERATOR_ROLES },
};

export function resolveProtectedRoute(pathname: string): ProtectedRoute | null {
  if (!Object.hasOwn(PROTECTED_ROUTES, pathname)) return null;
  return PROTECTED_ROUTES[pathname as ProtectedPath];
}

export function getAuthRouteState(input: {
  hasSession: boolean;
  role: AppRole | null;
  loading: boolean;
  configurationError: string | null;
  allowedRoles: readonly AppRole[];
}): AuthRouteState {
  if (input.loading) return 'loading';
  if (input.configurationError) return 'configuration_error';
  if (!input.hasSession) return 'login';
  if (!input.role || !input.allowedRoles.includes(input.role)) return 'unauthorized';
  return 'authorized';
}
