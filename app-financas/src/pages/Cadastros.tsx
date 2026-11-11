import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { useRegistry } from '../data/hooks'

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

/** Cadastros: o que a pessoa personaliza (categorias, formas de pagamento, atalhos, fornecedores) e a troca de planilhas. */
export default function Cadastros() {
  const { user } = useAuth()
  const { data: reg } = useRegistry(user!.uid)
  return (
    <main className="page">
      <header className="page-head">
        <h1>Cadastros</h1>
      </header>

      <section className="stack" aria-label="Pré-cadastros">
        <h2>Pré-cadastros</h2>
        <p className="muted">Deixe o app do seu jeito: o que você cadastrar aqui aparece ao criar uma conta.</p>
        <HubLink to="/cadastros/categorias" title="Categorias" text={count(reg.categories.length, 'categoria', 'categorias')} />
        <HubLink to="/cadastros/pagamentos" title="Formas de pagamento" text={count(reg.payments.length, 'forma', 'formas')} />
        <HubLink to="/cadastros/atalhos" title="Atalhos de conta" text={count(reg.templates.length, 'atalho', 'atalhos')} />
        <HubLink
          to="/cadastros/fornecedores"
          title="Fornecedores"
          text={reg.suppliers.length === 0 ? 'Cadastro opcional' : count(reg.suppliers.length, 'fornecedor', 'fornecedores')}
        />
      </section>

      <section className="stack" aria-label="Dados e conta">
        <h2>Dados e conta</h2>
        <HubLink to="/cadastros/planilhas" title="Planilhas" text="Importe contas e valores a receber de um CSV, ou exporte tudo para o Excel e o Google Planilhas." />
        <p className="muted">Conectado como {user?.email}</p>
      </section>
    </main>
  )
}
