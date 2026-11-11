import { NameListEditor } from '../components/NameListEditor'
import { useAuth } from '../auth'
import { useBills, useRegistry } from '../data/hooks'
import { moveCategory, saveRegistry } from '../data/store'
import { settleWithin } from '../data/wait'
import { FALLBACK_CATEGORY, addCategory, countBills, isFallbackCategory, removeCategory, renameCategory } from '../domain/registry'

export default function Categories() {
  const uid = useAuth().user!.uid
  const registry = useRegistry(uid)
  const bills = useBills(uid)
  const reg = registry.data

  return (
    <NameListEditor
      title="Categorias"
      intro="Agrupam as contas nos relatórios. Renomear atualiza todas as contas e lançamentos que usam a categoria."
      noun="categoria"
      feminine
      placeholder="Ex.: Viagens"
      movesOnDelete
      defaultMoveTo={FALLBACK_CATEGORY}
      loading={!registry.ready || !bills.ready}
      items={reg.categories.map((c) => ({
        key: c,
        label: c,
        used: countBills(bills.data, 'category', c),
        locked: isFallbackCategory(c),
      }))}
      onAdd={async (name) => {
        const next = addCategory(reg, name)
        if (!next.ok) return next.error
        await settleWithin(saveRegistry(uid, next.value))
        return null
      }}
      onRename={async (from, name) => {
        const next = renameCategory(reg, from, name)
        if (!next.ok) return next.error
        const to = next.value.categories[reg.categories.indexOf(from)]
        await settleWithin(moveCategory(uid, from, to, next.value))
        return null
      }}
      onRemove={async (name, moveTo) => {
        const next = removeCategory(reg, name, moveTo)
        if (!next.ok) return next.error
        await settleWithin(moveCategory(uid, name, moveTo, next.value))
        return null
      }}
    />
  )
}
