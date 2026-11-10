import { Link } from 'react-router-dom'

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link to="/" className="brand-link" aria-label="Contas em Dia, ir para o início">
          <img className="brand" src="/logo-horizontal.webp" alt="Contas em Dia" width="867" height="200" />
        </Link>
      </div>
    </header>
  )
}
