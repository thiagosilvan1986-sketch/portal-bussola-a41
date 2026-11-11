import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_ALERTS, TEST_PAYLOAD, type AlertSettings, type PushPayload } from '../../src/domain/alerts'
import type { Bill } from '../../src/domain/types'
import { runAlerts, sendTest, type AlertsStore, type Pusher, type PushSub, type SendResult } from './alerts-run'

const bill = (over: Partial<Bill> = {}): Bill => ({
  id: 'b1',
  name: 'Energia',
  category: 'Contas de consumo',
  supplier: '',
  valueType: 'fixed',
  expectedAmountCents: 15000,
  dueDay: 10,
  recurrence: 'monthly',
  startMonth: '2026-01',
  paymentMethod: 'boleto',
  notes: '',
  active: true,
  ...over,
})

const sub = (id: string): PushSub => ({ id, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, keys: { p256dh: 'p', auth: 'a' } })

/** Hoje é 2026-11-09 (segunda). 11:00 UTC = 08:00 em São Paulo. */
const AT_8 = new Date('2026-11-09T11:00:00Z')
const AT_7 = new Date('2026-11-09T10:00:00Z')
const AT_15 = new Date('2026-11-09T18:00:00Z')

interface UserFixture {
  subs?: PushSub[]
  settings?: AlertSettings
  lastSent?: string | null
  bills?: Bill[]
  failLoad?: boolean
}

function fakeStore(users: Record<string, UserFixture>) {
  const removed: [string, string][] = []
  const marked: [string, string][] = []
  const state = new Map(Object.entries(users).map(([uid, u]) => [uid, { lastSent: u.lastSent ?? null }]))
  const store: AlertsStore = {
    allSubscriptions: async () => new Map(Object.entries(users).map(([uid, u]) => [uid, u.subs ?? [sub(`${uid}-1`)]])),
    subscriptionsOf: async (uid) => users[uid]?.subs ?? [],
    removeSubscription: async (uid, id) => void removed.push([uid, id]),
    settings: async (uid) => users[uid].settings ?? { ...DEFAULT_ALERTS },
    lastSent: async (uid) => state.get(uid)!.lastSent,
    markSent: async (uid, date) => {
      state.get(uid)!.lastSent = date
      marked.push([uid, date])
    },
    bills: async (uid) => {
      if (users[uid].failLoad) throw new Error('Firestore fora do ar')
      return users[uid].bills ?? [bill()]
    },
    entries: async () => [],
  }
  return { store, removed, marked }
}

function fakePusher(result: SendResult | ((s: PushSub) => SendResult) = 'ok') {
  const sent: { sub: PushSub; payload: PushPayload }[] = []
  const pusher: Pusher = {
    send: async (s, payload) => {
      sent.push({ sub: s, payload })
      return typeof result === 'function' ? result(s) : result
    },
  }
  return { pusher, sent }
}

describe('runAlerts', () => {
  it('na hora escolhida, avisa da conta que vence amanhã', async () => {
    const { store, marked } = fakeStore({ u1: {} })
    const { pusher, sent } = fakePusher()
    const summary = await runAlerts(store, pusher, AT_8)
    expect(sent).toHaveLength(1)
    expect(sent[0].payload).toEqual({ title: 'Uma conta está perto de vencer', body: 'Amanhã: Energia', url: '/', tag: 'vencimentos' })
    expect(summary).toEqual({ users: 1, due: 1, sent: 1, removed: 0, failed: 0 })
    expect(marked).toEqual([['u1', '2026-11-09']])
  })

  it('antes da hora escolhida, não manda nada', async () => {
    const { store, marked } = fakeStore({ u1: {} })
    const { pusher, sent } = fakePusher()
    expect(await runAlerts(store, pusher, AT_7)).toMatchObject({ users: 0, sent: 0 })
    expect(sent).toHaveLength(0)
    expect(marked).toHaveLength(0)
  })

  it('se a hora exata passou sem enviar, envia na hora seguinte', async () => {
    const { store } = fakeStore({ u1: {} })
    const { pusher, sent } = fakePusher()
    await runAlerts(store, pusher, AT_15)
    expect(sent).toHaveLength(1)
  })

  it('só uma vez por dia', async () => {
    const { store } = fakeStore({ u1: {} })
    const { pusher, sent } = fakePusher()
    await runAlerts(store, pusher, AT_8)
    await runAlerts(store, pusher, AT_15)
    expect(sent).toHaveLength(1)
  })

  it('no dia seguinte avisa de novo', async () => {
    const { store } = fakeStore({ u1: { lastSent: '2026-11-08' } })
    const { pusher, sent } = fakePusher()
    await runAlerts(store, pusher, AT_8)
    expect(sent).toHaveLength(1)
  })

  it('vários aparelhos da mesma pessoa recebem o mesmo aviso', async () => {
    const { store } = fakeStore({ u1: { subs: [sub('a'), sub('b')] } })
    const { pusher, sent } = fakePusher()
    const summary = await runAlerts(store, pusher, AT_8)
    expect(sent.map((s) => s.sub.id)).toEqual(['a', 'b'])
    expect(summary.sent).toBe(2)
  })

  it('várias antecedências viram uma notificação só', async () => {
    const { store } = fakeStore({
      u1: {
        settings: { enabled: true, days: [1, 3], hour: 8 },
        bills: [bill({ id: 'a', name: 'Energia', dueDay: 10 }), bill({ id: 'b', name: 'Internet', dueDay: 12 })],
      },
    })
    const { pusher, sent } = fakePusher()
    await runAlerts(store, pusher, AT_8)
    expect(sent).toHaveLength(1)
    expect(sent[0].payload.title).toBe('2 contas estão perto de vencer')
    expect(sent[0].payload.body).toBe('Amanhã: Energia · Em 3 dias: Internet')
  })

  it('sem conta a vencer, não incomoda, mas marca o dia como conferido', async () => {
    const { store, marked } = fakeStore({ u1: { bills: [bill({ dueDay: 25 })] } })
    const { pusher, sent } = fakePusher()
    const summary = await runAlerts(store, pusher, AT_8)
    expect(sent).toHaveLength(0)
    expect(summary).toMatchObject({ users: 1, due: 0, sent: 0 })
    expect(marked).toEqual([['u1', '2026-11-09']])
  })

  it('avisos desligados: nada', async () => {
    const { store } = fakeStore({ u1: { settings: { enabled: false, days: [1], hour: 8 } } })
    const { pusher, sent } = fakePusher()
    await runAlerts(store, pusher, AT_8)
    expect(sent).toHaveLength(0)
  })

  it('aparelho que não existe mais é removido', async () => {
    const { store, removed, marked } = fakeStore({ u1: { subs: [sub('velho'), sub('novo')] } })
    const { pusher } = fakePusher((s) => (s.id === 'velho' ? 'gone' : 'ok'))
    const summary = await runAlerts(store, pusher, AT_8)
    expect(removed).toEqual([['u1', 'velho']])
    expect(summary).toMatchObject({ sent: 1, removed: 1 })
    expect(marked).toHaveLength(1)
  })

  it('se tudo falhar por erro passageiro, não marca o dia e tenta na hora seguinte', async () => {
    const { store, marked } = fakeStore({ u1: {} })
    const failing = fakePusher('error')
    expect(await runAlerts(store, failing.pusher, AT_8)).toMatchObject({ sent: 0, failed: 1 })
    expect(marked).toHaveLength(0)
    const working = fakePusher('ok')
    await runAlerts(store, working.pusher, AT_15)
    expect(working.sent).toHaveLength(1)
    expect(marked).toHaveLength(1)
  })

  it('erro do envio (exceção) conta como falha e não derruba os outros aparelhos', async () => {
    const { store } = fakeStore({ u1: { subs: [sub('a'), sub('b')] } })
    const pusher: Pusher = {
      send: async (s) => {
        if (s.id === 'a') throw new Error('rede')
        return 'ok'
      },
    }
    expect(await runAlerts(store, pusher, AT_8)).toMatchObject({ sent: 1, failed: 1 })
  })

  it('o problema de uma pessoa não impede a outra de receber', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { store } = fakeStore({ ruim: { failLoad: true }, boa: {} })
    const { pusher, sent } = fakePusher()
    const summary = await runAlerts(store, pusher, AT_8)
    expect(sent).toHaveLength(1)
    expect(summary).toMatchObject({ sent: 1, failed: 1 })
    vi.restoreAllMocks()
  })

  it('data e hora são as de São Paulo, não as do servidor (UTC)', async () => {
    const { store } = fakeStore({ u1: { settings: { enabled: true, days: [1], hour: 22 } } })
    const { pusher, sent } = fakePusher()
    // 00:59 UTC do dia 10 ainda é 21:59 do dia 09 em São Paulo: antes da hora.
    await runAlerts(store, pusher, new Date('2026-11-10T00:59:00Z'))
    expect(sent).toHaveLength(0)
    // 01:00 UTC do dia 10 é 22:00 do dia 09 em São Paulo: "amanhã" é dia 10, e a conta vence dia 10.
    await runAlerts(store, pusher, new Date('2026-11-10T01:00:00Z'))
    expect(sent).toHaveLength(1)
    expect(sent[0].payload.body).toBe('Amanhã: Energia')
  })
})

describe('sendTest', () => {
  it('manda o aviso de teste a todos os aparelhos e conta quantos receberam', async () => {
    const { store } = fakeStore({ u1: { subs: [sub('a'), sub('b')] } })
    const { pusher, sent } = fakePusher((s) => (s.id === 'b' ? 'error' : 'ok'))
    expect(await sendTest(store, pusher, 'u1')).toEqual({ sent: 1, total: 2 })
    expect(sent[0].payload).toEqual(TEST_PAYLOAD)
  })

  it('sem aparelho inscrito, total zero', async () => {
    const { store } = fakeStore({ u1: { subs: [] } })
    const { pusher, sent } = fakePusher()
    expect(await sendTest(store, pusher, 'u1')).toEqual({ sent: 0, total: 0 })
    expect(sent).toHaveLength(0)
  })

  it('aparelho morto é removido também no teste', async () => {
    const { store, removed } = fakeStore({ u1: { subs: [sub('a')] } })
    const { pusher } = fakePusher('gone')
    expect(await sendTest(store, pusher, 'u1')).toEqual({ sent: 0, total: 1 })
    expect(removed).toEqual([['u1', 'a']])
  })
})
