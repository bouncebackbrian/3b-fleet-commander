import { NextResponse } from 'next/server'
import { configuredFuelProviders } from '@/lib/fuel/fuelFinderProviders'

export const dynamic = 'force-dynamic'

/**
 * Lightweight integration-status endpoint used by Driver, Dispatch and Admin.
 * It exposes provider readiness only — never API keys or secret values.
 */
export async function GET() {
  return NextResponse.json({
    providers: configuredFuelProviders().map(provider => ({
      id: provider.id,
      name: provider.name,
      status: provider.status,
      capabilities: provider.capabilities,
      notes: provider.notes,
    })),
  })
}
