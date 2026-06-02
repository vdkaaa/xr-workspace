import React from 'react'

// ─── Button ──────────────────────────────────────────────────────────────────

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  isLoading?: boolean
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  isLoading = false,
  className = '',
  disabled,
  ...props
}) => {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-medium text-sm transition-all duration-200 px-5 py-3 disabled:opacity-40 disabled:cursor-not-allowed'

  const variants = {
    primary: 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20 active:scale-[0.98]',
    ghost: 'bg-transparent border border-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-white/20 hover:bg-white/5',
    danger: 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20',
  }

  return (
    <button
      className={`${base} ${variants[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : children}
    </button>
  )
}

// ─── Input ───────────────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', ...props }) => {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium text-[var(--text-secondary)] tracking-wide uppercase">
          {label}
        </label>
      )}
      <input
        className={`
          w-full bg-[var(--bg-elevated)] border rounded-xl px-4 py-3 text-sm text-[var(--text-primary)]
          placeholder:text-[var(--text-muted)] outline-none transition-all duration-200
          ${error
            ? 'border-red-500/50 focus:border-red-500'
            : 'border-white/8 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/10'
          }
          ${className}
        `}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

// ─── Card ────────────────────────────────────────────────────────────────────

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div
    className={`bg-[var(--bg-surface)] border border-[var(--bg-border)] rounded-2xl ${className}`}
  >
    {children}
  </div>
)
