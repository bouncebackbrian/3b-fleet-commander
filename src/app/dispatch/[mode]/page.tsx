import { redirect } from 'next/navigation'
import { slugToAssetMode } from '@/lib/fleet/asset-modes'

export default async function DispatchAssetModePage({ params }: { params: Promise<{ mode: string }> }) {
  const { mode } = await params
  const assetMode = slugToAssetMode(mode)
  redirect(assetMode ? `/dispatch/dashboard?view=${assetMode}` : '/dispatch/dashboard')
}
