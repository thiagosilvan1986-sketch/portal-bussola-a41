import { FeatureList } from '../components/FeatureList'

/** Sobre: a lista fixa de funcionalidades do app. Fica sempre em dia com o que o app faz. */
export default function About() {
  return (
    <main className="page">
      <header className="page-head">
        <h1>Sobre</h1>
      </header>

      <section className="card stack welcome" aria-label="Funcionalidades do Contas em Dia">
        <div className="welcome-hero">
          <h2>Planeje. Controle. Realize.</h2>
          <p className="muted">O que você paga e o que te devem, sob controle e sem planilha.</p>
        </div>
        <FeatureList />
        <p className="muted small-note">Seus dados são só seus. O app nunca paga nada por você.</p>
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
