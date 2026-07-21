import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { AuthPage } from './pages/AuthPage'
import { RoomsPage } from './pages/RoomsPage'
import { api } from './lib/api'
import { RoomDetail } from './pages/RoomDetail'
import UnityTestPage from './pages/UnityTestPage'
import UnityBridgeTestPage from './pages/UnityBridgeTestPage'
// ─── Ruta protegida — redirige a /login si no hay sesión ──────────────────────

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token } = useAuthStore()
  if (!token || !user) return <Navigate to="/login" replace />
  return <>{children}</>
}

// ─── Ruta pública — redirige a /rooms si ya hay sesión ───────────────────────

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token } = useAuthStore()
  if (token && user) return <Navigate to="/rooms" replace />
  return <>{children}</>
}

export default function App() {
  const { user, token, isLoading } = useAuthStore()

  useEffect(() => {
    if (token && !user) {
      api.auth.me(token)
        .then(u => useAuthStore.setState({ user: u }))
        .catch(() => {
          localStorage.removeItem('xr_token')
          useAuthStore.setState({ token: null })
        })
    }
  }, [])

  if (isLoading || (token && !user)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={
          <PublicRoute>
            <AuthPage />
          </PublicRoute>
        } />
  
        <Route path="/rooms" element={
          <ProtectedRoute>
            <RoomsPage />
          </ProtectedRoute>
        } />
  
        <Route path="/rooms/:id" element={
          <ProtectedRoute>
            <RoomDetail />
          </ProtectedRoute>
        } />

        {/* Rutas públicas de prueba — sin guard, no requieren sesión */}
        <Route path="/unity-test" element={<UnityTestPage />} />
        <Route path="/unity-bridge-test" element={<UnityBridgeTestPage />} />


        <Route path="/" element={
          <Navigate to={user ? '/rooms' : '/login'} replace />
        } />
  
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}