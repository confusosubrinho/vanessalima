export type AdminRole = 'owner' | 'manager' | 'operator' | 'viewer';

export const ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  owner: ['*'],
  manager: [
    'products.*', 'categories.*', 'orders.*', 'customers.*',
    'coupons.*', 'banners.*', 'personalization.*', 'analytics.*',
    'reviews.*', 'notifications.*',
  ],
  operator: [
    'products.read', 'products.update',
    'orders.*', 'customers.read', 'notifications.read',
  ],
  viewer: [
    'products.read', 'orders.read', 'customers.read',
    'analytics.read', 'notifications.read',
  ],
};

export const ROLE_LABELS: Record<AdminRole, string> = {
  owner: 'Proprietário',
  manager: 'Gerente',
  operator: 'Operador',
  viewer: 'Visualizador',
};

export const ROLE_COLORS: Record<AdminRole, string> = {
  owner: 'bg-primary text-primary-foreground',
  manager: 'bg-blue-500 text-white',
  operator: 'bg-amber-500 text-white',
  viewer: 'bg-muted text-muted-foreground',
};

export function hasPermission(role: AdminRole, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (perms.includes('*')) return true;
  const [resource, action] = permission.split('.');
  return perms.includes(permission) || perms.includes(`${resource}.*`);
}
