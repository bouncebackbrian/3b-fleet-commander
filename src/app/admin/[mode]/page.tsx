import { redirect } from 'next/navigation'
import { slugToAssetMode } from '@/lib/fleet/asset-modes'

export default async function AdminAssetModePage({ params }: { params: Promise<{ mode: string }> }) {
  const { mode } = await params
  const assetMode = slugToAssetMode(mode)
  redirect(assetMode ? `/admin/dashboard?view=${assetMode}` : '/admin/dashboard')
}
