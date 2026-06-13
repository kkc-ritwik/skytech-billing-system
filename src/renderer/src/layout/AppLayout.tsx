import { Route, Routes, NavLink } from 'react-router-dom'
import { Moon, Sun, Receipt } from 'lucide-react'
import { useApp } from '@renderer/store/app'
import { PRODUCT_NAME, TAGLINE } from '@shared/app-config'
import { cn } from '@renderer/lib/utils'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { AccountMenu } from '@renderer/components/AccountMenu'
import { NAV } from './nav'
import { Dashboard } from '@renderer/pages/Dashboard'
import { Placeholder } from '@renderer/pages/Placeholder'
import { ItemsPage } from '@renderer/pages/ItemsPage'
import { PartiesPage } from '@renderer/pages/PartiesPage'
import { SettingsPage } from '@renderer/pages/SettingsPage'
import { InventoryPage } from '@renderer/pages/InventoryPage'
import { PurchasesPage } from '@renderer/pages/PurchasesPage'
import { SalesPage } from '@renderer/pages/SalesPage'
import { PaymentsPage } from '@renderer/pages/PaymentsPage'
import { ReportsPage } from '@renderer/pages/ReportsPage'
import { UsersPage } from '@renderer/pages/UsersPage'
import { LicensePage } from '@renderer/pages/LicensePage'
import { HelpPage } from '@renderer/pages/HelpPage'

export function AppLayout(): JSX.Element {
  const { license, theme, setTheme, has } = useApp()

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="no-print flex w-64 shrink-0 flex-col border-r bg-card">
        <div className="flex h-16 items-center gap-2 border-b px-5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Receipt className="size-5" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-bold">{PRODUCT_NAME}</div>
            <div className="text-[10px] text-muted-foreground">{TAGLINE}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto p-3">
          {NAV.map((section) => {
            const items = section.items.filter((i) => has(i.permission))
            if (items.length === 0) return null
            return (
              <div key={section.title}>
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        )
                      }
                    >
                      <item.icon className="size-4" />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>
        {license && (
          <div className="border-t p-3">
            {license.status === 'trial' && (
              <Badge variant="warning" className="w-full justify-center">
                Trial · {license.daysRemaining}d left
              </Badge>
            )}
            {license.status === 'active' && (
              <Badge variant="success" className="w-full justify-center">
                Licensed{license.daysRemaining ? ` · ${license.daysRemaining}d` : ''}
              </Badge>
            )}
            {license.status === 'grace' && (
              <Badge variant="warning" className="w-full justify-center">
                Renew soon
              </Badge>
            )}
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="no-print flex h-16 shrink-0 items-center justify-end gap-2 border-b bg-card px-6">
          <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
          <AccountMenu />
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <RoutesView />
        </main>
      </div>
    </div>
  )
}

function RoutesView(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/items" element={<ItemsPage />} />
      <Route path="/parties" element={<PartiesPage />} />
      <Route path="/inventory" element={<InventoryPage />} />
      <Route path="/purchases" element={<PurchasesPage />} />
      <Route path="/sales" element={<SalesPage />} />
      <Route path="/payments" element={<PaymentsPage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/users" element={<UsersPage />} />
      <Route path="/license" element={<LicensePage />} />
      <Route path="/help" element={<HelpPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Placeholder title="Not found" />} />
    </Routes>
  )
}
