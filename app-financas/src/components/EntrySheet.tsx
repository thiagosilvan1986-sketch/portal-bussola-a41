import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { payEntry, skipEntry, undoPayment, updateEntryDetails } from '../data/store'
import { installmentLabel } from '../domain/bills'
import { formatCompetence, formatDateBR } from '../domain/dates'
import { amountDue, displayStatus, isFullyPaid } from '../domain/entries'
import type { EntryLink } from '../domain/linked'
import { useMoney } from '../data/privacy'
import { centsToInput, parseBRLToCents } from '../domain/money'
import { MoneyInput } from './MoneyInput'
import type { Entry, IsoDate } from '../domain/types'
import { DeleteButton } from './DeleteButton'
import { StatusChip } from './StatusChip'

interface Props {
  uid: string
  entry: Entry
  today: IsoDate
  /** A conta ainda existe? Se não, o lançamento é só um resto e basta apagá-lo. */
  billExists?: boolean
  /** Compras a receber ligadas à conta neste mês (veja `linkOfEntry`). */
  link?: EntryLink | null
  onClose: () => void
}

/**
 * Folha de detalhe do lançamento. As gravações não esperam a confirmação do servidor:
 * o Firestore guarda localmente e sincroniza quando houver internet.
 */
export function EntrySheet({ uid, entry, today, billExists = true, link = null, onClose }: Props) {
  const money = useMoney()
  const [charged, setCharged] = useState(entry.chargedAmountCents === null ? '' : centsToInput(entry.chargedAmountCents))
  const [barcode, setBarcode] = useState(entry.barcode)
  const [note, setNote] = useState(entry.note)
  const [payAmount, setPayAmount] = useState(centsToInput(entry.paidAmountCents ?? amountDue(entry)))
  const [payDate, setPayDate] = useState(entry.paidAt ?? today)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const status = displayStatus(entry, today)
  const paid = entry.paidAt !== null

  function commit(write: Promise<unknown>) {
    write.catch((e) => console.error('Falha ao gravar', e))
    onClose()
  }

  function saveDetails(ev: FormEvent) {
    ev.preventDefault()
    let chargedCents: number | null = null
    if (charged.trim() !== '') {
      chargedCents = parseBRLToCents(charged)
      if (chargedCents === null) return setError('Valor cobrado inválido. Exemplo: 238,40')
    }
    commit(updateEntryDetails(uid, entry.id, { chargedAmountCents: chargedCents, barcode: barcode.trim(), note: note.trim() }))
  }

  function markPaid(ev: FormEvent) {
    ev.preventDefault()
    const cents = parseBRLToCents(payAmount)
    if (cents === null || cents <= 0) return setError('Informe o valor pago. Exemplo: 238,40')
    if (!payDate || payDate > today) return setError('A data do pagamento não pode ser futura.')
    commit(payEntry(uid, entry.id, cents, payDate))
  }

  async function copyBarcode() {
    try {
      await navigator.clipboard.writeText(barcode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('Não foi possível copiar. Selecione o texto e copie manualmente.')
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={entry.billName} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <header className="sheet-head">
          <div>
            <h2>{entry.billName}</h2>
            <p className="muted">
              Vence em {formatDateBR(entry.dueDate)} · {entry.category}
              {installmentLabel(entry) && ` · ${installmentLabel(entry)}`}
            </p>
          </div>
          <StatusChip status={status} />
        </header>

        <dl className="facts">
          <div>
            <dt>Previsto</dt>
            <dd>{money(entry.expectedAmountCents)}</dd>
          </div>
          <div>
            <dt>A pagar</dt>
            <dd>{money(amountDue(entry))}</dd>
          </div>
          {paid && (
            <div>
              <dt>Pago em {formatDateBR(entry.paidAt!)}</dt>
              <dd>{money(entry.paidAmountCents ?? 0)}</dd>
            </div>
          )}
          {link && (
            <>
              <div>
                <dt>A receber ({link.people.map((p) => p.name).join(', ')})</dt>
                <dd>{money(link.receivableCents)}</dd>
              </div>
              <div>
                <dt>Seu gasto real</dt>
                <dd>
                  <strong>{money(link.realCents)}</strong>
                </dd>
              </div>
            </>
          )}
        </dl>
        {link && (
          <p className="muted small-note">
            {link.openCents > 0 ? `${money(link.openCents)} ainda não recebidos. ` : 'Tudo o que era para voltar já foi recebido. '}
            O gasto real é o valor da conta menos o que as pessoas devolvem neste mês.
          </p>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <form onSubmit={saveDetails} className="stack">
          <h3>Dados da cobrança</h3>
          <label>
            Valor cobrado (se já chegou)
            <MoneyInput placeholder="Ex.: 238,40" value={charged} onChange={setCharged} />
          </label>
          <label>
            Linha digitável
            <textarea rows={2} placeholder="Cole aqui a linha digitável do boleto" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
          </label>
          {barcode.trim() && (
            <button type="button" className="btn ghost" onClick={copyBarcode}>
              {copied ? 'Copiado!' : 'Copiar linha digitável'}
            </button>
          )}
          <label>
            Observação
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button className="btn" type="submit">
            Salvar dados
          </button>
        </form>

        <form onSubmit={markPaid} className="stack">
          <h3>Pagamento</h3>
          <div className="row">
            <label>
              Valor pago
              <MoneyInput value={payAmount} onChange={setPayAmount} />
            </label>
            <label>
              Data
              <input type="date" max={today} value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </label>
          </div>
          <button className="btn primary" type="submit">
            {isFullyPaid(entry) ? 'Atualizar pagamento' : 'Marcar como paga'}
          </button>
          {paid && (
            <button type="button" className="btn danger" onClick={() => commit(undoPayment(uid, entry.id))}>
              Desfazer pagamento
            </button>
          )}
        </form>

        <section className="stack danger-zone" aria-label="Excluir lançamento">
          <h3>Excluir lançamento</h3>
          <p className="muted">
            Remove só {formatCompetence(entry.competence)}. A conta e os outros meses continuam
            {paid ? '; o pagamento deste mês também será apagado' : ''}.
          </p>
          <DeleteButton
            large
            label={`Excluir ${formatCompetence(entry.competence)}`}
            onConfirm={() => commit(skipEntry(uid, entry, billExists))}
          />
        </section>

        {billExists && (
          <Link className="btn" to={`/contas/${entry.billId}`}>
            Editar conta
          </Link>
        )}
        <button className="btn ghost" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  )
}
