import { supabase } from '../lib/supabase.js'

/**
 * register — crea un usuario nuevo en Supabase Auth
 * y guarda el nombre en user_metadata
 */
export const register = async ({ email, password, name }) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name: name || '' },
    },
  })

  if (error) throw error
  return data
}

/**
 * login — inicia sesión y devuelve session + user
 */
export const login = async ({ email, password }) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error
  return data
}

/**
 * getMe — devuelve el usuario autenticado desde el token.
 * El token ya fue validado en el middleware requireAuth,
 * así que aquí solo formateamos el user.
 */
export const getMe = (user) => {
  return {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.name || '',
    created_at: user.created_at,
  }
}
