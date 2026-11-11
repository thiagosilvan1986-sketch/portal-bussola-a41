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
        <aside className="purpose" aria-labelledby="purpose-title">
          <span className="purpose-icon" aria-hidden="true">
            🛡️
          </span>
          <div>
            <h3 id="purpose-title">Por que o Contas em Dia existe</h3>
            <p>
              Multa e juros por atraso saem do seu bolso, e pagar em dia é responsabilidade só sua. Por isso o controle agora fica na palma da
              sua mão: o app mostra o que vence e o que atrasou, para você pagar a tempo e não perder mais dinheiro à toa. Estamos aqui para
              ajudar você a fechar o mês sem susto.
            </p>
          </div>
        </aside>
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
