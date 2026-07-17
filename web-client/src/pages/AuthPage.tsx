import React, { useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { Button, Input } from '../components/ui'

export const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  const { login, register, isLoading, error, clearError } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    if (mode === 'login') {
      await login(email, password)
    } else {
      await register(email, password, name)
    }
  }

  const toggleMode = () => {
    clearError()
    setMode(m => m === 'login' ? 'register' : 'login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #0d1f44 0%, var(--bg-base) 70%)' }}
    >
      {/* Logo / titulo */}
      <div className="w-full max-w-sm">
        <div className="text-center mb-10 fade-up">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)] tracking-tight">
            XR Rooms Meet
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 fade-up fade-up-delay-1">
          {mode === 'register' && (
            <Input
              label="Name"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          )}

          <Input
            label="Email"
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />

          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          {/* Error */}
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <Button type="submit" isLoading={isLoading} className="w-full mt-2">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        {/* Toggle login/register */}
        <p className="text-center text-sm text-[var(--text-secondary)] mt-6 fade-up fade-up-delay-2">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          {' '}
          <button
            onClick={toggleMode}
            className="text-blue-400 hover:text-blue-300 transition-colors font-medium"
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
