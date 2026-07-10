import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabaseConfigured = Boolean(url && anonKey)

export const supabase = supabaseConfigured
  ? createClient(url, anonKey)
  : (null as unknown as ReturnType<typeof createClient>)

export const portalBase = import.meta.env.BASE_URL.replace(/\/$/, '')

export function inviteUrl(token: string) {
  return `${window.location.origin}${portalBase}/accept-invite?token=${token}`
}
