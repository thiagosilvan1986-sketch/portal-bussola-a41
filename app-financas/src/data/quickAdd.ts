import { addCategory, addPayment, type Registry } from '../domain/registry'
import { saveRegistry } from './store'

type Created = { ok: true; value: string; label: string } | { ok: false; error: string }
const log = (e: unknown) => console.error('Falha ao gravar', e)

/**
 * Cadastro rápido de categoria (no próprio formulário). Grava em Ajustes sem esperar o servidor, como o resto do app,
 * e devolve o nome como ficou gravado.
 */
export function createCategory(uid: string, reg: Registry, raw: string): Created {
  const result = addCategory(reg, raw)
  if (!result.ok) return result
  const added = result.value.categories.find((c) => !reg.categories.includes(c))!
  saveRegistry(uid, result.value).catch(log)
  return { ok: true, value: added, label: added }
}

/** Cadastro rápido de forma de pagamento. Devolve o código da forma nova. */
export function createPayment(uid: string, reg: Registry, raw: string): Created {
  const result = addPayment(reg, raw)
  if (!result.ok) return result
  const added = result.value.payments.find((p) => !reg.payments.some((q) => q.id === p.id))!
  saveRegistry(uid, result.value).catch(log)
  return { ok: true, value: added.id, label: added.label }
}
