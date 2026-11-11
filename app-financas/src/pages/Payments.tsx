import { NameListEditor } from '../components/NameListEditor'
import { useAuth } from '../auth'
import { useBills, useRegistry } from '../data/hooks'
import { movePayment, saveRegistry } from '../data/store'
import { settleWithin } from '../data/wait'
import { addPayment, countBills, removePayment, renamePayment } from '../domain/registry'

export default function Payments() {
  const uid = useAuth().user!.uid
  const registry = useRegistry(uid)
  const bills = useBills(uid)
  const reg = registry.data

  return (
    <NameListEditor
      title="Formas de pagamento"
      intro="As opções que aparecem ao cadastrar uma conta. Renomear muda o nome em todas as contas que usam."
      noun="forma de pagamento"
      feminine
      placeholder="Ex.: Transferência"
      movesOnDelete
      loading={!registry.ready || !bills.ready}
      items={reg.payments.map((p) => ({ key: p.id, label: p.label, used: countBills(bills.data, 'paymentMethod', p.id) }))}
      onAdd={async (label) => {
        const next = addPayment(reg, label)
        if (!next.ok) return next.error
        await settleWithin(saveRegistry(uid, next.value))
        return null
      }}
      onRename={async (id, label) => {
        const next = renamePayment(reg, id, label)
        if (!next.ok) return next.error
        await settleWithin(saveRegistry(uid, next.value))
        return null
      }}
      onRemove={async (id, moveTo) => {
        const next = removePayment(reg, id, moveTo)
        if (!next.ok) return next.error
        await settleWithin(movePayment(uid, id, moveTo, next.value))
        return null
      }}
    />
  )
}
