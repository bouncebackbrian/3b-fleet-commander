'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BriefcaseBusiness, Clock3, Truck, Users, ShieldCheck, Receipt, Activity, BarChart3, Settings, LogOut, ChevronLeft, ChevronRight } from 'lucide-react'
import { createAuthClient } from '@/lib/auth-client'
import { getCurrentUser, type PortalGrants } from '@/lib/auth-adapter'
import { assetModeToSlug, type AssetOperatingMode } from '@/lib/fleet/asset-modes'

type FleetIdentity = {
  email?: string | null
  portals: PortalGrants
  currentAsset?: { id: string; unitNumber: string; operatingMode: AssetOperatingMode | null } | null
}

type Tab = {
  key: 'jobs' | 'hours' | 'assets' | 'team' | 'compliance' | 'expenses' | 'kpis' | 'reports'
  label: string
  href: string
  icon: typeof BriefcaseBusiness
  match: (path: string) => boolean
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [identity, setIdentity] = useState<FleetIdentity | null>(null)
  const path = usePathname()
  const router = useRouter()

  useEffect(() => {
    getCurrentUser().then(user => { if (user) setIdentity(user as FleetIdentity) })
  }, [])

  const tabs = useMemo<Tab[]>(() => {
    if (!identity) return []

    const driver = !!identity.portals.driver
    const dispatch = !!identity.portals.dispatch
    const admin = !!identity.portals.admin
    const mode = identity.currentAsset?.operatingMode ?? null
    const modeSlug = mode ? assetModeToSlug(mode) : null

    const jobsHref = admin
      ? '/admin/dashboard'
      : dispatch
        ? '/dispatch/dashboard'
        : modeSlug ? `/driver/${modeSlug}` : '/driver'

    const reportsHref = admin
      ? '/admin/dump-truck/reports'
      : dispatch
        ? '/dispatch/dump-truck/reports'
        : '/driver/reports'

    const kpiLens = admin ? 'admin' : dispatch ? 'dispatch' : 'driver'
    const kpiHref = `/kpis?lens=${kpiLens}${mode ? `&mode=${mode}` : ''}`

    const out: Tab[] = [
      {
        key: 'jobs', label: 'Jobs', href: jobsHref, icon: BriefcaseBusiness,
        match: p => p === '/admin/dashboard' || p === '/dispatch/dashboard' || p === '/driver' || (
          !p.includes('/reports') && !p.startsWith('/kpis') && (
            p.startsWith('/driver/dump-truck') || p.startsWith('/driver/water-truck') || p.startsWith('/driver/hotshot') || p.startsWith('/driver/otr') || p.startsWith('/driver/regional') || p.startsWith('/driver/local') || p.startsWith('/driver/business-vehicle')
          )
        ),
      },
    ]

    if (driver || admin) {
      out.push({ key: 'hours', label: 'Hours', href: driver ? '/driver/hours' : '/admin/dump-truck/reports', icon: Clock3, match: p => p.startsWith('/driver/hours') })
    }
    if (dispatch || admin) {
      out.push({ key: 'assets', label: 'Assets', href: '/assets', icon: Truck, match: p => p.startsWith('/assets') || p.startsWith('/admin/equipment') || p.startsWith('/maintenance') })
      out.push({ key: 'team', label: 'Team', href: '/team', icon: Users, match: p => p.startsWith('/team') })
    }
    if (driver || dispatch || admin) {
      out.push({ key: 'compliance', label: 'Compliance', href: '/compliance', icon: ShieldCheck, match: p => p.startsWith('/compliance') || p.startsWith('/driver/documents') })
    }
    if (driver || admin) {
      out.push({ key: 'expenses', label: 'Expenses', href: '/expenses', icon: Receipt, match: p => p.startsWith('/expenses') || p.startsWith('/fuel') })
    }
    if (driver || dispatch || admin) {
      out.push({ key: 'kpis', label: 'KPIs', href: kpiHref, icon: Activity, match: p => p.startsWith('/kpis') })
      out.push({ key: 'reports', label: 'Reports', href: reportsHref, icon: BarChart3, match: p => p.includes('/reports') || p.startsWith('/audit') || p.startsWith('/mis') })
    }

    return out
  }, [identity])

  const signOut = async () => {
    await createAuthClient().auth.signOut()
    router.replace('/login')
  }

  return (
    <aside className="app-sidebar" style={{ width: collapsed ? 68 : 244, transition: 'width 180ms ease', background: '#07110e', borderRight: '1px solid rgba(255,255,255,.055)', position: 'sticky', top: 0, height: '100dvh', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden', zIndex: 20 }}>
      <div style={{ padding: collapsed ? '.8rem .55rem' : '1rem', display: 'flex', gap: 10, alignItems: 'center' }}>
        <img src="/logo.png" alt="3B Fleet Commander" style={{ width: 38, height: 38, borderRadius: 11, objectFit: 'cover', flexShrink: 0 }} />
        {!collapsed && <div style={{ minWidth: 0 }}><div style={{ color: '#f5c200', fontWeight: 900, fontSize: '.78rem', whiteSpace: 'nowrap' }}>3B FLEET COMMANDER</div><div style={{ color: 'var(--muted)', fontSize: '.56rem', fontWeight: 750, marginTop: 3 }}>Business workspace</div></div>}
      </div>

      <nav style={{ flex: 1, padding: '.55rem .5rem', display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto' }}>
        {tabs.map(({ key, label, href, icon: Icon, match }) => {
          const active = match(path)
          return <Link key={key} href={href} title={collapsed ? label : undefined} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '.72rem .78rem', borderRadius: 12, textDecoration: 'none', color: active ? '#eefcf8' : 'var(--muted)', background: active ? 'rgba(255,255,255,.065)' : 'transparent', fontWeight: active ? 850 : 650, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            <Icon size={17} style={{ flexShrink: 0, color: active ? 'var(--primary)' : undefined }} />{!collapsed && <span>{label}</span>}
          </Link>
        })}

        {!!identity?.portals.admin && <Link href="/settings" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '.72rem .78rem', borderRadius: 12, textDecoration: 'none', color: path.startsWith('/settings') ? '#eefcf8' : 'var(--muted)', background: path.startsWith('/settings') ? 'rgba(255,255,255,.065)' : 'transparent', marginTop: 'auto', fontWeight: 650 }}>
          <Settings size={17} style={{ flexShrink: 0 }} />{!collapsed && <span>Settings</span>}
        </Link>}
      </nav>

      <div style={{ padding: '.6rem .5rem .8rem', borderTop: '1px solid rgba(255,255,255,.055)', display: 'grid', gap: 5 }}>
        {!collapsed && identity?.currentAsset && <div style={{ margin: '0 .3rem .2rem', padding: '.65rem .7rem', borderRadius: 12, background: 'rgba(255,255,255,.035)' }}>
          <div style={{ color: 'var(--muted)', fontSize: '.54rem', fontWeight: 800, textTransform: 'uppercase' }}>Current asset</div>
          <div style={{ marginTop: 4, fontWeight: 900, fontSize: '.72rem' }}>Unit {identity.currentAsset.unitNumber}</div>
          <div style={{ color: 'var(--primary)', fontSize: '.6rem', marginTop: 2, textTransform: 'capitalize' }}>{identity.currentAsset.operatingMode?.replaceAll('_', ' ') ?? 'Awaiting assignment'}</div>
        </div>}
        <button onClick={signOut} style={{ border: 0, background: 'transparent', color: 'var(--muted)', display: 'flex', gap: 9, alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', padding: '.58rem .72rem', cursor: 'pointer' }}><LogOut size={15} />{!collapsed && <span style={{ fontSize: '.7rem', fontWeight: 750 }}>Log Out</span>}</button>
        <button onClick={() => setCollapsed(v => !v)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} style={{ border: 0, background: 'transparent', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-end', padding: '.5rem .7rem', cursor: 'pointer' }}>{collapsed ? <ChevronRight size={15} /> : <><ChevronLeft size={15} /><span style={{ fontSize: '.66rem', marginLeft: 4 }}>Collapse</span></>}</button>
      </div>
    </aside>
  )
}
