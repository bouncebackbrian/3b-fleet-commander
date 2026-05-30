/**
 * supabase-admin.ts — Supabase service-role client
 *
 * SERVER-SIDE ONLY. Bypasses RLS for webhook sync and admin operations.
 * Never import in client components or expose to the browser.
 */

import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
