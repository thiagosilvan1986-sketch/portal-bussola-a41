import { describe, expect, it } from 'vitest'
import { loadVapid, type Vapid, type VapidStore } from './vapid'

const keys = (n: number): Vapid => ({ publicKey: `pub${n}`, privateKey: `priv${n}` })

function memoryStore(initial: Vapid | null = null) {
  let stored = initial
  const store: VapidStore = {
    read: async () => stored,
    create: async (v) => {
      if (stored) return false
      stored = v
      return true
    },
  }
  return { store, get: () => stored }
}

describe('loadVapid', () => {
  it('usa as chaves das variáveis do Netlify, se existirem, sem tocar no banco', async () => {
    const { store, get } = memoryStore()
    const v = await loadVapid(store, () => keys(1), { VAPID_PUBLIC_KEY: 'envpub', VAPID_PRIVATE_KEY: 'envpriv' })
    expect(v).toEqual({ publicKey: 'envpub', privateKey: 'envpriv' })
    expect(get()).toBeNull()
  })

  it('na primeira vez cria e guarda o par', async () => {
    const { store, get } = memoryStore()
    expect(await loadVapid(store, () => keys(1), {})).toEqual(keys(1))
    expect(get()).toEqual(keys(1))
  })

  it('nas vezes seguintes devolve o mesmo par, sem gerar outro', async () => {
    const { store } = memoryStore(keys(1))
    let generated = 0
    const v = await loadVapid(store, () => (generated++, keys(2)), {})
    expect(v).toEqual(keys(1))
    expect(generated).toBe(0)
  })

  it('se outra chamada criou o par ao mesmo tempo, fica com o dela', async () => {
    let reads = 0
    const store: VapidStore = {
      read: async () => (++reads === 1 ? null : keys(9)),
      create: async () => false,
    }
    expect(await loadVapid(store, () => keys(1), {})).toEqual(keys(9))
  })

  it('só uma das duas variáveis não vale: usa o banco', async () => {
    const { store } = memoryStore(keys(1))
    expect(await loadVapid(store, () => keys(2), { VAPID_PUBLIC_KEY: 'so-uma' })).toEqual(keys(1))
  })
})
