import { NameListEditor } from '../components/NameListEditor'
import { useAuth } from '../auth'
import { useBills, useRegistry } from '../data/hooks'
import { renameSupplierInBills, saveRegistry } from '../data/store'
import { settleWithin } from '../data/wait'
import { addSupplier, countBills, removeSupplier, renameSupplier } from '../domain/registry'

export default function Suppliers() {
  const uid = useAuth().user!.uid
  const registry = useRegistry(uid)
  const bills = useBills(uid)
  const reg = registry.data

  return (
    <NameListEditor
      title="Fornecedores"
      intro="Cadastro opcional. Na conta, o campo Fornecedor sugere esta lista, e você pode digitar outro nome quando quiser."
      noun="fornecedor"
      feminine={false}
      placeholder="Ex.: Enel"
      movesOnDelete={false}
      loading={!registry.ready || !bills.ready}
      items={reg.suppliers.map((s) => ({ key: s, label: s, used: countBills(bills.data, 'supplier', s) }))}
      onAdd={async (name) => {
        const next = addSupplier(reg, name)
        if (!next.ok) return next.error
        await settleWithin(saveRegistry(uid, next.value))
        return null
      }}
      onRename={async (from, name) => {
        const next = renameSupplier(reg, from, name)
        if (!next.ok) return next.error
        const to = next.value.suppliers[reg.suppliers.indexOf(from)]
        await settleWithin(renameSupplierInBills(uid, from, to, next.value))
        return null
      }}
      onRemove={async (name) => {
        const next = removeSupplier(reg, name)
        if (!next.ok) return next.error
        await settleWithin(saveRegistry(uid, next.value))
        return null
      }}
    />
  )
}
