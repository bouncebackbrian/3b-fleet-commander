import { redirect } from 'next/navigation'
import { requireFleetAuth, hasPortal } from '@/lib/fleet-auth-guard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const auth = await requireFleetAuth()
  if (!auth) redirect('/start')
  if (hasPortal(auth.portals, 'admin')) redirect('/admin/dashboard')
  if (hasPortal(auth.portals, 'dispatch')) redirect('/dispatch/dashboard')
  if (hasPortal(auth.portals, 'driver')) redirect('/driver')
  redirect('/fleet')
}
