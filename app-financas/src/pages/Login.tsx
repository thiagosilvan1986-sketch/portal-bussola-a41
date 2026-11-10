import { useAuth } from '../auth'

export default function Login() {
  const { signIn, error } = useAuth()
  return (
    <div className="login-screen">
      <main className="center">
        <h1 className="login-brand">
          <img className="logo" src="/logo.webp" alt="Contas em Dia" width="1040" height="882" />
        </h1>
        <p className="muted">Veja o que falta pagar neste mês e nunca mais esqueça um vencimento.</p>
        <button className="btn primary" onClick={() => void signIn()}>
          Entrar com Google
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </main>
    </div>
  )
}
