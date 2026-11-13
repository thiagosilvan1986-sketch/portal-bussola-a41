import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { setInstallmentPayment } from '../data/store'
import { useMoney } from '../data/privacy'
import { formatDateBR } from '../domain/dates'
import { centsToInput, parseBRLToCents } from '../domain/money'
import { KIND_INFO, installmentRemaining, installmentStatus, isSettled, parcelLabel } from '../domain/receivables'
import type { Installment, IsoDate, Receivable } from '../domain/types'
import { MoneyInput } from './MoneyInput'
import { StatusChip } from './StatusChip'

interface Props {
  uid: string
  today: IsoDate
  receivable: Receivable
  installment: Installment
  personName: string
  onClose: () => void
}

const log = (e: unknown) => console.error('Falha ao gravar', e)

/** Detalhe de uma parcela a receber, aberto na Início: dar baixa (valor e data), desfazer e ir para a pessoa. */
export function ParcelSheet({ uid, today, receivable, installment: i, personName, onClose }: Props) {
  const money = useMoney()
  const settled = isSettled(i)
  const [amount, setAmount] = useState(centsToInput(i.paidAmountCents ?? i.amountCents))
  const [date, setDate] = useState(i.paidAt ?? today)
  const [error, setError] = useState<string | null>(null)
  const label = parcelLabel(receivable, i)

  function receive(ev: FormEvent) {
    ev.preventDefault()
    const cents = parseBRLToCents(amount)
    if (cents === null || cents <= 0) return setError('Informe o valor recebido. Exemplo: 42,00')
    if (!date || date > today) return setError('A data do recebimento não pode ser futura.')
    setInstallmentPayment(uid, receivable, i.number, { paidAt: date, paidAmountCents: cents }).catch(log)
    onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`${personName} · ${receivable.description}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <header className="sheet-head">
          <div>
            <h2>
              {personName} · {receivable.description}
            </h2>
            <p className="muted">
              {KIND_INFO[receivable.kind].title} · {label} · vence em {formatDateBR(i.dueDate)}
            </p>
          </div>
          <StatusChip status={installmentStatus(i, today)} receber />
        </header>

        <dl className="facts">
          <div>
            <dt>Valor da parcela</dt>
            <dd>{money(i.amountCents)}</dd>
          </div>
          <div>
            <dt>Falta receber</dt>
            <dd>
              <strong>{money(installmentRemaining(i))}</strong>
            </dd>
          </div>
          {i.paidAt && (
            <div>
              <dt>Recebido em {formatDateBR(i.paidAt)}</dt>
              <dd>{money(i.paidAmountCents ?? 0)}</dd>
            </div>
          )}
        </dl>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <form onSubmit={receive} className="stack">
          <h3>Recebimento</h3>
          <div className="row">
            <label>
              Valor recebido
              <MoneyInput value={amount} onChange={setAmount} />
            </label>
            <label>
              Data
              <input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          <button className="btn primary" type="submit">
            {settled ? 'Atualizar recebimento' : 'Marcar como recebida'}
          </button>
          {i.paidAt !== null && (
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                setInstallmentPayment(uid, receivable, i.number, null).catch(log)
                onClose()
              }}
            >
              Desfazer recebimento
            </button>
          )}
        </form>

        <Link className="btn" to={`/receber/pessoa/${receivable.personId}`}>
          Ver pessoa e compra
        </Link>
        <button className="btn ghost" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  )
}
