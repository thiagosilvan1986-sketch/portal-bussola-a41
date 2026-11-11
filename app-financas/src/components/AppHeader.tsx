import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { usePrivacy } from '../data/privacy'
import { IncludeSheet } from './IncludeSheet'
import { MainNav } from './MainNav'

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

/** Olho aberto: os valores estão à mostra. Olho fechado: estão escondidos. */
function EyeIcon({ closed }: { closed: boolean }) {
  return closed ? (
    <Svg>
      <path d="M3 10c2.500 4 15.500 4 18 0" />
      <path d="M6.500 13.200 5 16" />
      <path d="M12 14.500V18" />
      <path d="M17.500 13.200 19 16" />
    </Svg>
  ) : (
    <Svg>
      <path d="M2 12s3.500-7 10-7 10 7 10 7-3.500 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  )
}

function PowerIcon() {
  return (
    <Svg>
      <path d="M12 3v8" />
      <path d="M6.300 6.600a8 8 0 1 0 11.400 0" />
    </Svg>
  )
}

export function AppHeader() {
  const { hidden, toggle } = usePrivacy()
  const { signOut } = useAuth()
  const [including, setIncluding] = useState(false)
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link to="/" className="brand-link" aria-label="Contas em Dia, ir para o início">
          <img className="brand" src="/logo-horizontal.webp" alt="Contas em Dia" width="874" height="216" />
        </Link>
        <div className="header-actions">
          <button
            type="button"
            className="header-icon"
            aria-pressed={hidden}
            aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}
            onClick={toggle}
          >
            <EyeIcon closed={hidden} />
            <span>{hidden ? 'Mostrar' : 'Ocultar'}</span>
          </button>
          <button type="button" className="include-btn" aria-haspopup="dialog" onClick={() => setIncluding(true)}>
            <span aria-hidden="true">＋</span> Incluir
          </button>
          <button type="button" className="header-icon header-exit" aria-label="Sair do app" onClick={() => void signOut()}>
            <PowerIcon />
            <span>Sair</span>
          </button>
        </div>
      </div>
      <MainNav />
      {including && <IncludeSheet onClose={() => setIncluding(false)} />}
    </header>
  )
}
