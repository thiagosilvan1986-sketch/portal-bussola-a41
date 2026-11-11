import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { resetWelcome } from '../data/welcome'

export default function Settings() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
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
        <h2>Planilhas</h2>
        <p className="muted">Importe contas a pagar e a receber de uma planilha (CSV) ou exporte tudo para o Excel e o Google Planilhas.</p>
        <Link className="btn" to="/ajustes/planilhas">
          Importar e exportar
        </Link>
      </section>

      <section className="card stack">
        <h2>Apresentação</h2>
        <p className="muted">Veja de novo o resumo das funcionalidades do app, na tela inicial.</p>
        <button
          className="btn"
          onClick={() => {
            resetWelcome()
            navigate('/')
          }}
        >
          Ver apresentação
        </button>
      </section>

      <section className="card stack">
        <h2>Instalar no celular</h2>
        <p className="muted">
          No Chrome, abra o menu e toque em “Instalar app” ou “Adicionar à tela inicial”. No iPhone, use o botão de compartilhar do Safari e
          “Adicionar à Tela de Início”.
        </p>
      </section>
    </main>
  )
}
