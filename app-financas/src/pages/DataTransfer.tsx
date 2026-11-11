import { useId, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { readCsvFile, saveCsv } from '../data/files'
import { useBills, usePeople, useReceivables, useRegistry, useToday } from '../data/hooks'
import { importBills, importReceivables } from '../data/store'
import {
  billsTemplateCsv,
  billsToCsv,
  parseBillsCsv,
  parseReceivablesCsv,
  receivablesTemplateCsv,
  receivablesToCsv,
  type ImportReport,
  type RowNote,
} from '../domain/transfer'

// Sem internet o Firestore guarda no aparelho e envia depois; depois deste tempo a tela segue em frente.
const SLOW_MS = 8000
const SHOWN_ISSUES = 8

interface Outcome {
  tone: 'ok' | 'error'
  text: string
  /** Mostra o atalho para a lista, depois de importar. */
  link?: boolean
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function IssueList({ title, items }: { title: string; items: RowNote[] }) {
  const hidden = items.length - SHOWN_ISSUES
  return (
    <div className="stack tight">
      <h3>{title}</h3>
      <ul className="issue-list">
        {items.slice(0, SHOWN_ISSUES).map((item) => (
          <li key={`${item.line}-${item.message}`}>
            <strong>Linha {item.line}:</strong> {item.message}
          </li>
        ))}
      </ul>
      {hidden > 0 && <p className="muted">E mais {count(hidden, 'linha', 'linhas')}.</p>}
    </div>
  )
}

interface CardProps<P extends ImportReport> {
  title: string
  intro: string
  /** "conta"/"contas": tudo feminino, então "nova", "cadastrada". */
  one: string
  many: string
  /** Quantas já existem (null enquanto carrega). */
  existing: number | null
  today: string
  exportName: string
  makeExport: () => string
  makeTemplate: () => string
  analyze: (text: string) => P
  readyCount: (plan: P) => number
  extraLine?: (plan: P) => string | null
  save: (plan: P) => Promise<void>
  goTo: { to: string; label: string }
}

function TransferCard<P extends ImportReport>(props: CardProps<P>) {
  const { title, intro, one, many, existing, today, exportName, goTo } = props
  const [plan, setPlan] = useState<P | null>(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inputId = useId()
  const loading = existing === null

  async function exportNow(name: string, content: string) {
    setOutcome(null)
    try {
      await saveCsv(name, content)
      setOutcome({ tone: 'ok', text: `Arquivo ${name} pronto.` })
    } catch (error) {
      console.warn('Não foi possível gerar o arquivo', error)
      setOutcome({ tone: 'error', text: 'Não consegui gerar o arquivo. Tente de novo.' })
    }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // deixa escolher o mesmo arquivo de novo depois de corrigir
    if (!file) return
    setOutcome(null)
    setPlan(null)
    try {
      const text = await readCsvFile(file)
      setFileName(file.name)
      setPlan(props.analyze(text))
    } catch (error) {
      setOutcome({ tone: 'error', text: error instanceof Error ? error.message : 'Não consegui ler o arquivo.' })
    }
  }

  async function confirm() {
    if (!plan) return
    const ready = props.readyCount(plan)
    setBusy(true)
    setOutcome(null)
    try {
      const saving = props.save(plan)
      void saving.catch(() => undefined) // o erro, se vier depois da espera, já foi tratado abaixo
      const result = await Promise.race([
        saving.then(() => 'synced' as const),
        new Promise<'slow'>((resolve) => {
          timer.current = setTimeout(() => resolve('slow'), SLOW_MS)
        }),
      ])
      const done = `${count(ready, one, many)} importada${ready === 1 ? '' : 's'}.`
      setOutcome({
        tone: 'ok',
        link: true,
        text:
          result === 'slow'
            ? `${done} Sem conexão agora: ficam salvas no aparelho e seguem para a nuvem quando a internet voltar.`
            : done,
      })
      setPlan(null)
    } catch (error) {
      console.warn('Não foi possível importar', error)
      setOutcome({ tone: 'error', text: 'Não consegui importar. Nada foi perdido: tente de novo.' })
    } finally {
      clearTimeout(timer.current)
      setBusy(false)
    }
  }

  const ready = plan ? props.readyCount(plan) : 0
  const extra = plan && !plan.fileError ? props.extraLine?.(plan) : null

  return (
    <section className="card stack" aria-label={title}>
      <h2>{title}</h2>
      <p className="muted">{intro}</p>

      <div className="actions">
        <button
          className="btn small"
          disabled={loading || existing === 0}
          onClick={() => void exportNow(`${exportName}-${today}.csv`, props.makeExport())}
        >
          Exportar CSV
        </button>
        <button
          className="btn small"
          onClick={() => void exportNow(`modelo-${exportName}.csv`, props.makeTemplate())}
        >
          Baixar modelo
        </button>
        <label className={loading ? 'btn small file-btn disabled' : 'btn small file-btn'} htmlFor={inputId}>
          Importar CSV
          <input
            id={inputId}
            className="file-input"
            type="file"
            accept=".csv,.txt,text/csv,text/plain,application/vnd.ms-excel"
            disabled={loading || busy}
            onChange={(e) => void onFile(e)}
          />
        </label>
      </div>
      {existing === 0 && <p className="muted">Ainda não há nada para exportar.</p>}

      {outcome && (
        <p className={outcome.tone === 'ok' ? 'notice' : 'error'} role={outcome.tone === 'ok' ? 'status' : 'alert'}>
          {outcome.text}{' '}
          {outcome.link && <Link to={goTo.to}>{goTo.label}</Link>}
        </p>
      )}

      {plan && (
        <div className="import-preview stack" aria-live="polite">
          <p>
            <strong>{fileName}</strong>
          </p>
          {plan.fileError ? (
            <p className="error" role="alert">
              {plan.fileError}
            </p>
          ) : (
            <>
              <ul className="import-stats">
                <li>
                  <strong>{ready}</strong> {ready === 1 ? 'nova para importar' : 'novas para importar'}
                </li>
                {plan.duplicates > 0 && (
                  <li>
                    <strong>{plan.duplicates}</strong> {plan.duplicates === 1 ? 'já cadastrada (ignorada)' : 'já cadastradas (ignoradas)'}
                  </li>
                )}
                {plan.errors.length > 0 && (
                  <li className="stat-bad">
                    <strong>{plan.errors.length}</strong> com erro (não {plan.errors.length === 1 ? 'será importada' : 'serão importadas'})
                  </li>
                )}
              </ul>
              {extra && <p className="muted">{extra}</p>}
              {plan.errors.length > 0 && <IssueList title="Linhas com erro" items={plan.errors} />}
              {plan.warnings.length > 0 && <IssueList title="Ajustes automáticos" items={plan.warnings} />}
            </>
          )}
          <div className="actions">
            {!plan.fileError && (
              <button className="btn primary" disabled={busy || ready === 0} onClick={() => void confirm()}>
                {busy ? 'Importando…' : `Importar ${count(ready, one, many)}`}
              </button>
            )}
            <button className="btn" disabled={busy} onClick={() => setPlan(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export default function DataTransfer() {
  const uid = useAuth().user!.uid
  const today = useToday()
  const bills = useBills(uid)
  const registry = useRegistry(uid).data
  const people = usePeople(uid)
  const receivables = useReceivables(uid)
  const receivablesReady = people.ready && receivables.ready

  return (
    <main className="page">
      <header className="page-head">
        <h1>Planilhas (CSV)</h1>
        <Link className="btn small" to="/cadastros">
          Voltar
        </Link>
      </header>
      <p className="muted">
        Traga o que você já tem numa planilha ou leve seus dados para o Excel e o Google Planilhas. No Excel, use
        “Salvar como” e escolha CSV. Antes de gravar qualquer coisa, você vê a prévia e confere.
      </p>

      <TransferCard
        title="Contas a pagar"
        intro="Contas recorrentes (o cadastro, não os pagamentos de cada mês). Obrigatórias: Nome e Dia do vencimento. Também lemos Categoria, Fornecedor, Tipo de valor, Valor, Periodicidade, Início, Forma de pagamento, Observações e Ativa."
        one="conta"
        many="contas"
        existing={bills.ready ? bills.data.length : null}
        today={today}
        exportName="contas-a-pagar"
        makeExport={() => billsToCsv(bills.data, registry)}
        makeTemplate={billsTemplateCsv}
        analyze={(text) => parseBillsCsv(text, bills.data, today, registry)}
        readyCount={(plan) => plan.bills.length}
        save={(plan) => importBills(uid, plan.bills)}
        goTo={{ to: '/contas', label: 'Ver contas' }}
      />

      <TransferCard
        title="A receber"
        intro="Uma linha por compra ou serviço. Obrigatórias: Pessoa, Descrição, Valor total e Primeiro vencimento. Também lemos Tipo (Cartão ou Serviço), Parcelas, Parcelas recebidas, Telefone, E-mail e Observações. Telefone e e-mail valem só para pessoas novas. As parcelas são iguais, uma por mês."
        one="compra"
        many="compras"
        existing={receivablesReady ? receivables.data.length : null}
        today={today}
        exportName="a-receber"
        makeExport={() => receivablesToCsv(receivables.data, people.data, today)}
        makeTemplate={receivablesTemplateCsv}
        analyze={(text) => parseReceivablesCsv(text, people.data, receivables.data, today)}
        readyCount={(plan) => plan.items.length}
        extraLine={(plan) =>
          plan.newPeople.length > 0 ? `${count(plan.newPeople.length, 'pessoa nova será cadastrada', 'pessoas novas serão cadastradas')}.` : null
        }
        save={(plan) => importReceivables(uid, plan)}
        goTo={{ to: '/receber', label: 'Ver a receber' }}
      />
    </main>
  )
}
