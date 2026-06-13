/**
 * Central RBAC matrix. Permissions are checked in the MAIN process (the trusted
 * boundary) on every IPC call, and mirrored in the renderer purely to shape the
 * UI. Never rely on the renderer check for security.
 */

export const ROLES = ['super_admin', 'admin', 'manager', 'operator'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  operator: 'Operator'
}

/**
 * Permissions are "<module>:<action>". Keep them coarse-grained and readable.
 * action ∈ view | create | edit | delete | approve | manage
 */
export const PERMISSIONS = [
  'dashboard:view',
  'items:view', 'items:manage',
  'parties:view', 'parties:manage',
  'inventory:view', 'inventory:adjust',
  'purchase:view', 'purchase:create', 'purchase:edit', 'purchase:delete', 'purchase:approve',
  'sales:view', 'sales:create', 'sales:edit', 'sales:delete', 'sales:approve',
  'payments:view', 'payments:create', 'payments:delete',
  'reports:view', 'reports:financial',
  'settings:view', 'settings:manage',
  'users:view', 'users:manage',
  'license:activate', // enter/activate/deactivate a key (customer Admin may do this)
  'license:manage', // reserved vendor-only license controls (Super Admin)
  'audit:view',
  'backup:manage'
] as const

export type Permission = (typeof PERMISSIONS)[number]

const all = (): Permission[] => [...PERMISSIONS]

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  // Super admin: everything, including license + user management.
  super_admin: all(),
  // Admin (customer owner): full business + user management + license ACTIVATION,
  // but NOT vendor-only license:manage and cannot create Super Admins.
  admin: PERMISSIONS.filter((p) => p !== 'license:manage') as Permission[],
  // Manager: operate + view financial reports + approve, but no destructive
  // settings/user/backup control.
  manager: [
    'dashboard:view',
    'items:view', 'items:manage',
    'parties:view', 'parties:manage',
    'inventory:view', 'inventory:adjust',
    'purchase:view', 'purchase:create', 'purchase:edit', 'purchase:approve',
    'sales:view', 'sales:create', 'sales:edit', 'sales:approve',
    'payments:view', 'payments:create',
    'reports:view', 'reports:financial',
    'settings:view',
    'audit:view'
  ],
  // Operator: day-to-day data entry only.
  operator: [
    'dashboard:view',
    'items:view',
    'parties:view', 'parties:manage',
    'inventory:view',
    'purchase:view', 'purchase:create',
    'sales:view', 'sales:create',
    'payments:view', 'payments:create',
    'reports:view'
  ]
}

export function permissionsForRole(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? []
}

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}
