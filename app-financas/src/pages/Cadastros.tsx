import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { useAlertSettings, usePeople, useRegistry } from '../data/hooks'
import { alertsSummary } from '../domain/alerts'
import { FONT_SIZES, useFontSize } from '../data/fontSize'

/** Tamanho da letra: vale para o app todo, só neste aparelho. */
function FontSizePicker() {
  const [size, choose] = useFontSize()
  return (
    <section className="stack" aria-labelledby="font-size-title">
      <h2 id="font-size-title">Tamanho da letra</h2>
      <div className="segmented" role="group" aria-label="Tamanho da letra">
        {FONT_SIZES.map((o) => (
          <button key={o.key} type="button" className={`font-size-${o.key}`} aria-pressed={o.key === size} onClick={() => choose(o.key)}>
            {o.key === size && <span aria-hidden="true">✓ </span>}
            {o.label}
          </button>
        ))}
      </div>
      <p className="muted">Vale para o app todo e fica guardado neste aparelho.</p>
    </section>
  )
}

function HubLink({ to, title, text }: { to: string; title: string; text: string }) {
  return (
    <Link className="hub-link" to={to}>
      <span className="hub-copy">
        <strong>{title}</strong>
        <span className="muted">{text}</span>
      </span>
      <span className="hub-go" aria-hidden="true">
        ›
      </span>
    </Link>
  )
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Configurações (aba "Ajustes"): o que a pessoa personaliza (categorias, formas de pagamento, atalhos, fornecedores, contatos, alertas, tamanho da letra) e a troca de planilhas. */
export default function Cadastros() {
  const { user } = useAuth()
  const { data: reg } = useRegistry(user!.uid)
  const { data: alerts } = useAlertSettings(user!.uid)
  const { data: people } = usePeople(user!.uid)
  return (
    <main className="page">
      <header className="page-head">
        <h1>Configurações</h1>
      </header>

      <section className="stack" aria-label="Pré-cadastros">
        <h2>Pré-cadastros</h2>
        <p className="muted hub-intro">Deixe o app do seu jeito: o que você cadastrar aqui aparece ao criar uma conta.</p>
        <HubLink to="/cadastros/categorias" title="Categorias" text={count(reg.categories.length, 'categoria', 'categorias')} />
        <HubLink to="/cadastros/pagamentos" title="Formas de pagamento" text={count(reg.payments.length, 'forma', 'formas')} />
        <HubLink to="/cadastros/atalhos" title="Atalhos de conta" text={count(reg.templates.length, 'atalho', 'atalhos')} />
        <HubLink
          to="/cadastros/fornecedores"
          title="Fornecedores"
          text={reg.suppliers.length === 0 ? 'Cadastro opcional' : count(reg.suppliers.length, 'fornecedor', 'fornecedores')}
        />
        <HubLink to="/cadastros/contatos" title="Contatos" text={people.length === 0 ? 'Nenhum contato' : count(people.length, 'contato', 'contatos')} />
        <HubLink to="/cadastros/alertas" title="Alertas de vencimento" text={alertsSummary(alerts)} />
      </section>

      <FontSizePicker />

      <section className="stack" aria-label="Dados e conta">
        <h2>Dados e conta</h2>
        <HubLink to="/cadastros/planilhas" title="Planilhas" text="Importe contas e valores a receber de um CSV, ou exporte tudo para o Excel e o Google Planilhas." />
        <p className="muted">Conectado como {user?.email}</p>
      </section>
    </main>
  )
}
