import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth'
import { FeatureList } from '../components/FeatureList'

type Mode = 'signin' | 'signup'

export default function Login() {
  const { signIn, signInWithEmail, signUpWithEmail, resetPassword, clearMessages, error, info } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const signup = mode === 'signup'

  function switchMode() {
    setMode(signup ? 'signin' : 'signup')
    setLocalError(null)
    clearMessages()
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLocalError(null)
    if (!email.trim()) return setLocalError('Digite seu e-mail.')
    if (password.length < 6) return setLocalError('A senha precisa ter pelo menos 6 caracteres.')
    setBusy(true)
    try {
      await (signup ? signUpWithEmail : signInWithEmail)(email, password)
    } finally {
      setBusy(false)
    }
  }

  async function onForgot() {
    setLocalError(null)
    if (!email.trim()) return setLocalError('Digite seu e-mail acima para receber o link de nova senha.')
    setBusy(true)
    try {
      await resetPassword(email)
    } finally {
      setBusy(false)
    }
  }

  const message = localError ?? error

  return (
    <div className="login-screen">
      <main className="center">
        <h1 className="login-brand">
          <img className="logo" src="/logo-login.webp" alt="Contas em Dia" width="1040" height="1084" />
        </h1>
        <p className="muted">Veja o que falta pagar neste mês e nunca mais esqueça um vencimento.</p>

        <button className="btn primary login-wide" onClick={() => void signIn()}>
          Entrar com Google
        </button>

        <p className="login-or" aria-hidden="true">
          <span>ou use seu e-mail</span>
        </p>

        <form className="stack login-form" onSubmit={(e) => void onSubmit(e)} noValidate>
          <label>
            E-mail
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              placeholder="voce@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Senha
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete={signup ? 'new-password' : 'current-password'}
              placeholder="Mínimo de 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
            Mostrar senha
          </label>

          <button className="btn login-wide" type="submit" disabled={busy}>
            {signup ? 'Criar conta' : 'Entrar'}
          </button>
        </form>

        <div className="login-links">
          {!signup && (
            <button type="button" className="link-btn" onClick={() => void onForgot()} disabled={busy}>
              Esqueci minha senha
            </button>
          )}
          <button type="button" className="link-btn" onClick={switchMode}>
            {signup ? 'Já tenho conta. Entrar' : 'Não tenho conta. Criar conta'}
          </button>
        </div>

        {message && (
          <p className="error" role="alert">
            {message}
          </p>
        )}
        {info && !message && (
          <p className="notice" role="status">
            {info}
          </p>
        )}

        <section className="login-features" aria-label="Funcionalidades do Contas em Dia">
          <h2>Tudo o que você precisa, num só lugar</h2>
          <FeatureList />
          <p className="muted small-note">Seus dados são só seus e o app nunca paga nada por você.</p>
        </section>
      </main>
    </div>
  )
}
