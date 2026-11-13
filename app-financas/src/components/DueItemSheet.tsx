import { Link } from 'react-router-dom'
import { useMoney } from '../data/privacy'
import { formatDateBR } from '../domain/dates'
import type { DueItem } from '../domain/reports'
import { pendency } from './DueHeatmap'

interface Props {
  item: DueItem
  tone: 'pagar' | 'receber'
  onClose: () => void
}

/**
 * Detalhe de um vencimento do mapa que não tem lançamento gravado para registrar pagamento:
 * a parcela a receber (o recebimento é registrado na pessoa) e a conta de um mês ainda sem lançamento (só previsão).
 */
export function DueItemSheet({ item, tone, onClose }: Props) {
  const money = useMoney()
  const p = pendency(item, tone)
  const receber = item.kind === 'parcela'

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={item.name} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <header className="sheet-head">
          <div>
            <h2>{item.name}</h2>
            <p className="muted">Vence em {formatDateBR(item.dueDate)}</p>
          </div>
          <span className={`chip ${p.cls} status-chip`}>
            <span aria-hidden="true">{p.icon} </span>
            {p.label}
          </span>
        </header>

        <dl className="facts">
          <div>
            <dt>{item.projected ? 'Valor previsto' : receber ? 'Valor da parcela' : 'Valor'}</dt>
            <dd>{money(item.cents)}</dd>
          </div>
          {!item.projected && (
            <div>
              <dt>{receber ? 'Falta receber' : 'Falta pagar'}</dt>
              <dd>
                <strong>{money(item.pendingCents)}</strong>
              </dd>
            </div>
          )}
        </dl>
        {item.projected && (
          <p className="muted small-note">Este mês ainda não tem lançamento: o valor é a previsão da conta. Quando o lançamento existir, dá para registrar o pagamento aqui.</p>
        )}
        {receber && <p className="muted small-note">O recebimento da parcela é registrado na tela da pessoa.</p>}

        {receber ? (
          <>
            <Link className="btn primary" to={`/receber/pessoa/${item.personId}`}>
              Ver compra e registrar recebimento
            </Link>
            <Link className="btn" to={`/receber/compra/${item.receivableId}/editar`}>
              Editar compra
            </Link>
          </>
        ) : (
          <Link className="btn" to={`/contas/${item.billId}`}>
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
