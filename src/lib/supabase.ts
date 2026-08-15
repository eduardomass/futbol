import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * `false` cuando todavía no se cargaron las credenciales en `.env.local`.
 * La UI lo usa para mostrar un aviso en vez de romper con una pantalla en blanco.
 */
export const supabaseConfigurado = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = supabaseConfigurado
  ? createClient(url, anonKey)
  : null
