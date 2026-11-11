import { Link } from 'react-router-dom'

/** Dois quadrados sobrepostos: "copiar". */
function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  )
}

interface Props {
  /** Abre o formulário de cadastro já preenchido (nada é gravado até a pessoa salvar). */
  to?: string
  /** Para listas em que a cópia é criada na hora. */
  onClick?: () => void
  small?: boolean
  disabled?: boolean
}

/** O botão único de copiar um cadastro para criar outro: ícone e texto, sempre com o mesmo nome. */
export function CopyButton({ to, onClick, small, disabled }: Props) {
  const className = `btn copy-btn${small ? ' small' : ''}`
  const content = (
    <>
      <CopyIcon />
      <span>Copiar e criar novo</span>
    </>
  )
  return to ? (
    <Link className={className} to={to}>
      {content}
    </Link>
  ) : (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>
      {content}
    </button>
  )
}
