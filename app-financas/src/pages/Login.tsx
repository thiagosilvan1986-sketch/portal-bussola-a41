import { useAuth } from '../auth'

export default function Login() {
  const { signIn, error } = useAuth()
  return (
    <main className="center">
      <h1>Contas em Dia</h1>
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
  )
}
