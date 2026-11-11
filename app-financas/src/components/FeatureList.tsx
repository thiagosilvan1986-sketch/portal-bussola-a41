export const FEATURES: { icon: string; title: string; text: string }[] = [
  {
    icon: 'M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm4 9 2 2 4-4',
    title: 'Nenhuma conta esquecida',
    text: 'Cadastre uma vez. O app lança todo mês e destaca o que vence hoje e o que atrasou.',
  },
  {
    icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm-4-9 3 3 5-6',
    title: 'Pago em um toque',
    text: 'Marque como paga com o ✓. Outro valor ou outra data? Também resolve.',
  },
  {
    icon: 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14',
    title: 'Quem te deve, na ponta do lápis',
    text: 'Reembolsos do cartão e serviços prestados, parcela a parcela, com a previsão do que volta a cada mês.',
  },
  {
    icon: 'M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.2A8 8 0 1 1 21 12z',
    title: 'Cobrança sem climão',
    text: 'Mensagem pronta para WhatsApp ou e-mail, no tom certo para cada pessoa, com o histórico de cada cobrança.',
  },
  {
    icon: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM4 10h16M4 15h16M10 4v16',
    title: 'Sua planilha, sem retrabalho',
    text: 'Importe contas e compras de um CSV do Excel ou Google Planilhas, com prévia antes de gravar. E exporte tudo quando quiser.',
  },
  {
    icon: 'M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7zm4 10a2 2 0 0 0 4 0',
    title: 'Tudo à vista, logo na entrada',
    text: 'Atrasos e vencimentos de hoje te recebem aqui, antes de virarem problema.',
  },
]

/** As funcionalidades do app, em lista com ícones. Usada na tela inicial e na tela de entrada. */
export function FeatureList() {
  return (
    <ul className="welcome-list">
      {FEATURES.map((f) => (
        <li key={f.title}>
          <span className="welcome-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={f.icon} />
            </svg>
          </span>
          <span className="welcome-copy">
            <strong>{f.title}</strong>
            <span className="muted">{f.text}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
