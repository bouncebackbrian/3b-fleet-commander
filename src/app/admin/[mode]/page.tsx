import { notFound } from 'next/navigation'
import ModeWorkspace from '@/components/fleet/ModeWorkspace'
import { getModeUi } from '@/lib/fleet/mode-ui'

export default async function AdminAssetModePage({ params }: { params: Promise<{ mode: string }> }) {
  const { mode } = await params
  if (!getModeUi(mode)) notFound()
  return <ModeWorkspace modeSlug={mode} portal="admin" />
}
