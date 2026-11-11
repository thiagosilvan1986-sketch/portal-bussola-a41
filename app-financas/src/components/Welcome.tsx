import { FeatureList } from './FeatureList'

/** Apresentação curta das funcionalidades, mostrada na tela inicial até a pessoa dispensar. */
export function Welcome({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section className="card stack welcome" aria-label="Apresentação do Contas em Dia">
      <div className="welcome-hero">
        <h2>Planeje. Controle. Realize.</h2>
        <p className="muted">O que você paga e o que te devem, sob controle e sem planilha.</p>
      </div>
      <FeatureList />
      <p className="muted small-note">
        Seus dados são só seus. O app nunca paga nada por você, e dá para instalá-lo no celular em segundos (veja em Ajustes).
      </p>
      <button className="btn primary" onClick={onDismiss}>
        Começar
      </button>
    </section>
  )
}
