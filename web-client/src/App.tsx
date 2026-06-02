import React, { useEffect } from 'react'
import { useAuthStore } from './stores/authStore'
import { AuthPage } from './pages/AuthPage'
import { RoomsPage } from './pages/RoomsPage'
import { api } from './lib/api'

export default function App() {
  const { user, token, isLoading } = useAuthStore()

  // Al arrancar la app, si hay token guardado verificamos que sigue siendo válido
  useEffect(() => {
    if (token && !user) {
      api.auth.me(token)
        .then(u => useAuthStore.setState({ user: u }))
        .catch(() => {
          // Token inválido o expirado — limpiamos sesión
          localStorage.removeItem('xr_token')
          useAuthStore.setState({ token: null })
        })
    }
  }, [])

  // Pantalla de carga inicial
  if (isLoading || (token && !user)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Si no hay usuario → pantalla de login
  // Si hay usuario → pantalla de salas
  return user ? <RoomsPage /> : <AuthPage />
}
