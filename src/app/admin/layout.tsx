import type { ReactNode } from 'react'
import { requirePortalPageAccess } from '@/lib/fleet-portal-page-guard'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requirePortalPageAccess('admin')
  return children
}
