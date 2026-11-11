import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePrivacy } from '../data/privacy'
import { IncludeSheet } from './IncludeSheet'
import { MainNav } from './MainNav'

const EYE = 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z'

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={EYE} />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  )
}

export function AppHeader() {
  const { hidden, toggle } = usePrivacy()
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
            title={hidden ? 'Mostrar valores' : 'Ocultar valores'}
            onClick={toggle}
          >
            <EyeIcon off={hidden} />
          </button>
          <button type="button" className="include-btn" aria-haspopup="dialog" onClick={() => setIncluding(true)}>
            <span aria-hidden="true">＋</span> Incluir
          </button>
        </div>
      </div>
      <MainNav />
      {including && <IncludeSheet onClose={() => setIncluding(false)} />}
    </header>
  )
}
