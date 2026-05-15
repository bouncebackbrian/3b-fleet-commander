import { createClient } from '@/lib/supabase-browser'

export type UserProfile = {
  id: string
  email: string
  full_name: string | null
  role: string
  three_b_id: string | null
  three_b_biz_id: string | null
  three_b_linked: boolean
  tractor_number: string | null
  trailer_number: string | null
}

export async function getProfile(): Promise<UserProfile | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return data ?? null
}

export async function updateProfile(patch: Partial<UserProfile>) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('profiles').upsert({ id: user.id, ...patch })
}
