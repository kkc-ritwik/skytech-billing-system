import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Package,
  Users,
  Warehouse,
  ShoppingCart,
  ScanLine,
  FileText,
  Wallet,
  BarChart3,
  Settings,
  ShieldCheck,
  ScrollText,
  KeyRound,
  LifeBuoy
} from 'lucide-react'
import type { Permission } from '@shared/permissions'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  permission: Permission
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const NAV: NavSection[] = [
  {
    title: 'Overview',
    items: [{ label: 'Dashboard', to: '/', icon: LayoutDashboard, permission: 'dashboard:view' }]
  },
  {
    title: 'Masters',
    items: [
      { label: 'Items', to: '/items', icon: Package, permission: 'items:view' },
      { label: 'Clients & Vendors', to: '/parties', icon: Users, permission: 'parties:view' }
    ]
  },
  {
    title: 'Operations',
    items: [
      { label: 'Point of Sale', to: '/pos', icon: ScanLine, permission: 'sales:create' },
      { label: 'Inventory', to: '/inventory', icon: Warehouse, permission: 'inventory:view' },
      { label: 'Purchases', to: '/purchases', icon: ShoppingCart, permission: 'purchase:view' },
      { label: 'Sales', to: '/sales', icon: FileText, permission: 'sales:view' },
      { label: 'Payments', to: '/payments', icon: Wallet, permission: 'payments:view' }
    ]
  },
  {
    title: 'Insights',
    items: [{ label: 'Reports', to: '/reports', icon: BarChart3, permission: 'reports:view' }]
  },
  {
    title: 'Administration',
    items: [
      { label: 'Users', to: '/users', icon: ShieldCheck, permission: 'users:view' },
      { label: 'Activity Log', to: '/audit', icon: ScrollText, permission: 'audit:view' },
      { label: 'License', to: '/license', icon: KeyRound, permission: 'license:activate' },
      { label: 'Settings', to: '/settings', icon: Settings, permission: 'settings:view' },
      { label: 'Help & Support', to: '/help', icon: LifeBuoy, permission: 'dashboard:view' }
    ]
  }
]
