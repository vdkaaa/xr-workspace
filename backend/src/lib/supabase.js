import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Faltan variables de entorno: SUPABASE_URL y SUPABASE_ANON_KEY son requeridas')
}

// Cliente público — usa el JWT del usuario (respeta RLS)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Cliente admin — usa service_role, bypasea RLS (solo para operaciones del servidor)
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
