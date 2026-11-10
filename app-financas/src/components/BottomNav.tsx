import { NavLink } from 'react-router-dom'

const icons = {
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  bills: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm3 4h8M8 12h8M8 16h5',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4.500v5M9 14.500v5',
}

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

export function BottomNav() {
  const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-link active' : 'nav-link')
  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      <NavLink to="/" end className={link}>
        <Icon path={icons.home} />
        <span>Início</span>
      </NavLink>
      <NavLink to="/contas" className={link}>
        <Icon path={icons.bills} />
        <span>Contas</span>
      </NavLink>
      <NavLink to="/ajustes" className={link}>
        <Icon path={icons.settings} />
        <span>Ajustes</span>
      </NavLink>
    </nav>
  )
}
