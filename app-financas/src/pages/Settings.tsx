import { useAuth } from '../auth'

export default function Settings() {
  const { user, signOut } = useAuth()
  return (
    <main className="page">
      <header className="page-head">
        <h1>Ajustes</h1>
      </header>

      <section className="card stack">
        <h2>Conta</h2>
        <p className="muted">Conectado como {user?.email}</p>
        <button className="btn" onClick={() => void signOut()}>
          Sair
        </button>
      </section>

      <section className="card stack">
        <h2>Instalar no celular</h2>
        <p className="muted">
          No Chrome, abra o menu e toque em “Instalar app” ou “Adicionar à tela inicial”. No iPhone, use o botão de compartilhar do Safari e
          “Adicionar à Tela de Início”.
        </p>
      </section>

      <section className="card stack">
        <h2>Em breve</h2>
        <p className="muted">
          Leitura do Gmail com sugestões de cadastro e atualização de valor, conciliação automática de pagamentos e lembretes por notificação.
        </p>
      </section>
    </main>
  )
}
