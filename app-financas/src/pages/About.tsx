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
          <svg className="purpose-icon" viewBox="0 0 64 64" width="44" height="44" aria-hidden="true" focusable="false">
            <ellipse cx="29" cy="37" rx="25" ry="23" fill="#8f1d1d" />
            <circle cx="28" cy="34" r="24" fill="#e0342f" />
            <circle cx="28" cy="34" r="19" fill="#ffffff" />
            <circle cx="28" cy="34" r="14" fill="#e0342f" />
            <circle cx="28" cy="34" r="9" fill="#ffffff" />
            <circle cx="28" cy="34" r="4.500" fill="#e0342f" />
            <path d="M29 33 47 15" stroke="#b3261e" strokeWidth="4.500" strokeLinecap="round" />
            <path d="M44 18 52 10" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" />
            <path d="M46 7l11 3-4 4 4 4-3 11-5-3-1-6-6-1-3-5z" fill="#f59e0b" />
            <circle cx="28" cy="34" r="2" fill="#7f1d1d" />
          </svg>
          <div>
            <h3 id="purpose-title">Por que o Contas em Dia existe</h3>
            <p>
              Multa e juros por atraso saem do seu bolso, e pagar em dia é responsabilidade só sua. Por isso o controle agora fica na palma da
              sua mão: o app mostra o que vence e o que atrasou, para você pagar a tempo e não perder mais dinheiro à toa. Estamos aqui para
              ajudar você a fechar o mês sem susto e ajudar a realizar suas cobranças que tem a receber sem esquecimento.
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
