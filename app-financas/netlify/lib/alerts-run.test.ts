import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_ALERTS, TEST_PAYLOAD, type AlertSettings, type PushPayload } from '../../src/domain/alerts'
import type { Bill } from '../../src/domain/types'
import {
  TEST_EMAIL_COOLDOWN_MS,
  runAlerts,
  sendTest,
  sendTestEmail,
  type AlertsStore,
  type Channel,
  type Pusher,
  type PushSub,
  type SendResult,
} from './alerts-run'
import type { Mail } from './email-content'
import type { Mailer } from './mailer'

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
  lastSentEmail?: string | null
  /** E-mail confirmado do login; null = sem confirmar. Padrão: `<uid>@exemplo.com`. */
  recipient?: string | null
  lastTestEmail?: number | null
  bills?: Bill[]
  failLoad?: boolean
}

function fakeStore(users: Record<string, UserFixture>) {
  const removed: [string, string][] = []
  const marked: [string, string][] = []
  const markedEmail: [string, string][] = []
  const testMarks: [string, number][] = []
  const state = new Map(
    Object.entries(users).map(([uid, u]) => [uid, { push: u.lastSent ?? null, email: u.lastSentEmail ?? null, test: u.lastTestEmail ?? null }]),
  )
  const settingsOf = (uid: string) => users[uid].settings ?? { ...DEFAULT_ALERTS }
  const store: AlertsStore = {
    allSubscriptions: async () =>
      new Map(Object.entries(users).flatMap(([uid, u]) => ((u.subs ?? [sub(`${uid}-1`)]).length > 0 ? [[uid, u.subs ?? [sub(`${uid}-1`)]] as const] : []))),
    subscriptionsOf: async (uid) => users[uid]?.subs ?? [],
    removeSubscription: async (uid, id) => void removed.push([uid, id]),
    emailUsers: async () => Object.keys(users).filter((uid) => settingsOf(uid).email),
    recipient: async (uid) => (users[uid].recipient === undefined ? `${uid}@exemplo.com` : users[uid].recipient),
    settings: async (uid) => settingsOf(uid),
    lastSent: async (uid, channel: Channel) => state.get(uid)![channel],
    markSent: async (uid, date, channel) => {
      state.get(uid)![channel] = date
      ;(channel === 'push' ? marked : markedEmail).push([uid, date])
    },
    lastTestEmail: async (uid) => state.get(uid)!.test,
    markTestEmail: async (uid, at) => {
      state.get(uid)!.test = at
      testMarks.push([uid, at])
    },
    bills: async (uid) => {
      if (users[uid].failLoad) throw new Error('Firestore fora do ar')
      return users[uid].bills ?? [bill()]
    },
    entries: async () => [],
  }
  return { store, removed, marked, markedEmail, testMarks }
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

function fakeMailer(result: 'ok' | 'error' | 'throw' = 'ok') {
  const sent: { to: string; mail: Mail }[] = []
  const mailer: Mailer = {
    send: async (to, mail) => {
      sent.push({ to, mail })
      if (result === 'throw') throw new Error('rede')
      return result
    },
  }
  return { mailer, sent }
}

describe('runAlerts', () => {
  it('na hora escolhida, avisa da conta que vence amanhã', async () => {
    const { store, marked } = fakeStore({ u1: {} })
    const { pusher, sent } = fakePusher()
    const summary = await runAlerts(store, { pusher }, AT_8)
    expect(sent).toHaveLength(1)
    expect(sent[0].payload).toEqual({ title: 'Uma conta está perto de vencer', body: 'Amanhã: Energia', url: '/', tag: 'vencimentos' })
    expect(summary).toEqual({ users: 1, due: 1, sent: 1, removed: 0, failed: 0, emailed: 0, emailFailed: 0 })
    expect(marked).toEqual([['u1', '2026-11-09']])
  })

  it('antes da hora escolhida, não manda nada', async () => {
    const { store, marked } = fakeStore({ u1: {} })
    const { pusher, sent } = fakePusher()
    expect(await runAlerts(store, { pusher }, AT_7)).toMatchObject({ users: 0, sent: 0 })
    expect(sent).toHaveLength(0)
    expect(marked).toHaveLength(0)
  })

  it('se a hora exata passou sem enviar, envia na hora seguinte', async () => {
    const { store } = fakeStore({ u1: {} })
    const { pusher, sent } = fakePusher()
    await runAlerts(store, { pusher }, AT_15)
    expect(sent).toHaveLength(1)
  })

  it('só uma vez por dia', async () => {
    const { store } = fakeStore({ u1: {} })
    const { pusher, sent } = fakePusher()
    await runAlerts(store, { pusher }, AT_8)
    await runAlerts(store, { pusher }, AT_15)
    expect(sent).toHaveLength(1)
  })

  it('no dia seguinte avisa de novo', async () => {
    const { store } = fakeStore({ u1: { lastSent: '2026-11-08' } })
    const { pusher, sent } = fakePusher()
    await runAlerts(store, { pusher }, AT_8)
    expect(sent).toHaveLength(1)
  })

  it('vários aparelhos da mesma pessoa recebem o mesmo aviso', async () => {
    const { store } = fakeStore({ u1: { subs: [sub('a'), sub('b')] } })
    const { pusher, sent } = fakePusher()
    const summary = await runAlerts(store, { pusher }, AT_8)
    expect(sent.map((s) => s.sub.id)).toEqual(['a', 'b'])
    expect(summary.sent).toBe(2)
  })

  it('várias antecedências viram uma notificação só', async () => {
    const { store } = fakeStore({
      u1: {
        settings: { ...DEFAULT_ALERTS, days: [1, 3] },
        bills: [bill({ id: 'a', name: 'Energia', dueDay: 10 }), bill({ id: 'b', name: 'Internet', dueDay: 12 })],
      },
    })
    const { pusher, sent } = fakePusher()
    await runAlerts(store, { pusher }, AT_8)
    expect(sent).toHaveLength(1)
    expect(sent[0].payload.title).toBe('2 contas estão perto de vencer')
    expect(sent[0].payload.body).toBe('Amanhã: Energia · Em 3 dias: Internet')
  })

  it('sem conta a vencer, não incomoda, mas marca o dia como conferido', async () => {
    const { store, marked } = fakeStore({ u1: { bills: [bill({ dueDay: 25 })] } })
    const { pusher, sent } = fakePusher()
    const summary = await runAlerts(store, { pusher }, AT_8)
    expect(sent).toHaveLength(0)
    expect(summary).toMatchObject({ users: 1, due: 0, sent: 0 })
    expect(marked).toEqual([['u1', '2026-11-09']])
  })

  it('avisos desligados: nada', async () => {
    const { store } = fakeStore({ u1: { settings: { ...DEFAULT_ALERTS, enabled: false } } })
    const { pusher, sent } = fakePusher()
    await runAlerts(store, { pusher }, AT_8)
    expect(sent).toHaveLength(0)
  })

  it('aparelho que não existe mais é removido', async () => {
    const { store, removed, marked } = fakeStore({ u1: { subs: [sub('velho'), sub('novo')] } })
    const { pusher } = fakePusher((s) => (s.id === 'velho' ? 'gone' : 'ok'))
    const summary = await runAlerts(store, { pusher }, AT_8)
    expect(removed).toEqual([['u1', 'velho']])
    expect(summary).toMatchObject({ sent: 1, removed: 1 })
    expect(marked).toHaveLength(1)
  })

  it('se tudo falhar por erro passageiro, não marca o dia e tenta na hora seguinte', async () => {
    const { store, marked } = fakeStore({ u1: {} })
    const failing = fakePusher('error')
    expect(await runAlerts(store, { pusher: failing.pusher }, AT_8)).toMatchObject({ sent: 0, failed: 1 })
    expect(marked).toHaveLength(0)
    const working = fakePusher('ok')
    await runAlerts(store, { pusher: working.pusher }, AT_15)
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
    expect(await runAlerts(store, { pusher }, AT_8)).toMatchObject({ sent: 1, failed: 1 })
  })

  it('o problema de uma pessoa não impede a outra de receber', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { store } = fakeStore({ ruim: { failLoad: true }, boa: {} })
    const { pusher, sent } = fakePusher()
    const summary = await runAlerts(store, { pusher }, AT_8)
    expect(sent).toHaveLength(1)
    expect(summary).toMatchObject({ sent: 1, failed: 1 })
    vi.restoreAllMocks()
  })

  it('data e hora são as de São Paulo, não as do servidor (UTC)', async () => {
    const { store } = fakeStore({ u1: { settings: { ...DEFAULT_ALERTS, hour: 22 } } })
    const { pusher, sent } = fakePusher()
    // 00:59 UTC do dia 10 ainda é 21:59 do dia 09 em São Paulo: antes da hora.
    await runAlerts(store, { pusher }, new Date('2026-11-10T00:59:00Z'))
    expect(sent).toHaveLength(0)
    // 01:00 UTC do dia 10 é 22:00 do dia 09 em São Paulo: "amanhã" é dia 10, e a conta vence dia 10.
    await runAlerts(store, { pusher }, new Date('2026-11-10T01:00:00Z'))
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

const WITH_EMAIL: AlertSettings = { ...DEFAULT_ALERTS, email: true }
const APP = 'https://app.exemplo.com'

describe('runAlerts: aviso por e-mail', () => {
  it('manda a notificação e o e-mail, cada um marcando o seu dia', async () => {
    const { store, marked, markedEmail } = fakeStore({ u1: { settings: WITH_EMAIL } })
    const { pusher, sent } = fakePusher()
    const { mailer, sent: mails } = fakeMailer()
    const summary = await runAlerts(store, { pusher, mailer, appUrl: APP }, AT_8)
    expect(sent).toHaveLength(1)
    expect(mails).toHaveLength(1)
    expect(mails[0].to).toBe('u1@exemplo.com')
    expect(mails[0].mail.subject).toBe('Uma conta está perto de vencer')
    expect(mails[0].mail.html).toContain('Amanhã:')
    expect(mails[0].mail.html).toContain('Energia')
    expect(mails[0].mail.html).toContain(`href="${APP}"`)
    expect(summary).toMatchObject({ users: 1, due: 1, sent: 1, emailed: 1, emailFailed: 0 })
    expect(marked).toEqual([['u1', '2026-11-09']])
    expect(markedEmail).toEqual([['u1', '2026-11-09']])
  })

  it('o e-mail não leva valores', async () => {
    const { store } = fakeStore({ u1: { settings: WITH_EMAIL } })
    const { mailer, sent: mails } = fakeMailer()
    await runAlerts(store, { pusher: fakePusher().pusher, mailer }, AT_8)
    expect(mails[0].mail.html).not.toMatch(/R\$|150|15000/)
  })

  it('quem só quer e-mail, sem aparelho inscrito, recebe e-mail', async () => {
    const { store, markedEmail } = fakeStore({ u1: { subs: [], settings: WITH_EMAIL } })
    const { pusher, sent } = fakePusher()
    const { mailer, sent: mails } = fakeMailer()
    const summary = await runAlerts(store, { pusher, mailer }, AT_8)
    expect(sent).toHaveLength(0)
    expect(mails).toHaveLength(1)
    expect(summary).toMatchObject({ users: 1, sent: 0, emailed: 1 })
    expect(markedEmail).toEqual([['u1', '2026-11-09']])
  })

  it('e-mail desmarcado: só a notificação', async () => {
    const { store } = fakeStore({ u1: {} })
    const { mailer, sent: mails } = fakeMailer()
    await runAlerts(store, { pusher: fakePusher().pusher, mailer }, AT_8)
    expect(mails).toHaveLength(0)
  })

  it('serviço de e-mail não configurado: nada de e-mail, e a notificação segue', async () => {
    const { store, markedEmail } = fakeStore({ u1: { settings: WITH_EMAIL } })
    const { pusher, sent } = fakePusher()
    const summary = await runAlerts(store, { pusher, mailer: null }, AT_8)
    expect(sent).toHaveLength(1)
    expect(summary).toMatchObject({ emailed: 0, emailFailed: 0 })
    expect(markedEmail).toHaveLength(0)
  })

  it('só uma vez por dia também no e-mail', async () => {
    const { store } = fakeStore({ u1: { settings: WITH_EMAIL } })
    const { mailer, sent: mails } = fakeMailer()
    const channels = { pusher: fakePusher().pusher, mailer }
    await runAlerts(store, channels, AT_8)
    await runAlerts(store, channels, AT_15)
    expect(mails).toHaveLength(1)
  })

  it('antes da hora escolhida, nada de e-mail', async () => {
    const { store } = fakeStore({ u1: { settings: WITH_EMAIL } })
    const { mailer, sent: mails } = fakeMailer()
    await runAlerts(store, { pusher: fakePusher().pusher, mailer }, AT_7)
    expect(mails).toHaveLength(0)
  })

  it('avisos desligados: nem e-mail', async () => {
    const { store } = fakeStore({ u1: { subs: [], settings: { ...WITH_EMAIL, enabled: false } } })
    const { mailer, sent: mails } = fakeMailer()
    await runAlerts(store, { pusher: fakePusher().pusher, mailer }, AT_8)
    expect(mails).toHaveLength(0)
  })

  it('e-mail que falha não marca o dia e tenta de novo na hora seguinte, sem repetir a notificação', async () => {
    const { store, marked, markedEmail } = fakeStore({ u1: { settings: WITH_EMAIL } })
    const { pusher, sent } = fakePusher()
    const failing = fakeMailer('error')
    expect(await runAlerts(store, { pusher, mailer: failing.mailer }, AT_8)).toMatchObject({ sent: 1, emailed: 0, emailFailed: 1 })
    expect(markedEmail).toHaveLength(0)
    expect(marked).toHaveLength(1)
    const working = fakeMailer()
    await runAlerts(store, { pusher, mailer: working.mailer }, AT_15)
    expect(working.sent).toHaveLength(1)
    expect(sent).toHaveLength(1)
    expect(markedEmail).toHaveLength(1)
  })

  it('exceção no envio do e-mail conta como falha e não derruba a notificação', async () => {
    const { store } = fakeStore({ u1: { settings: WITH_EMAIL } })
    const { pusher, sent } = fakePusher()
    const summary = await runAlerts(store, { pusher, mailer: fakeMailer('throw').mailer }, AT_8)
    expect(sent).toHaveLength(1)
    expect(summary).toMatchObject({ sent: 1, emailFailed: 1 })
  })

  it('notificação que falha não impede o e-mail', async () => {
    const { store } = fakeStore({ u1: { settings: WITH_EMAIL } })
    const { mailer, sent: mails } = fakeMailer()
    const summary = await runAlerts(store, { pusher: fakePusher('error').pusher, mailer }, AT_8)
    expect(summary).toMatchObject({ sent: 0, failed: 1, emailed: 1 })
    expect(mails).toHaveLength(1)
  })

  it('e-mail ainda não confirmado: não manda e não marca o dia (vale se confirmar ainda hoje)', async () => {
    const { store, markedEmail } = fakeStore({ u1: { subs: [], settings: WITH_EMAIL, recipient: null } })
    const { mailer, sent: mails } = fakeMailer()
    const summary = await runAlerts(store, { pusher: fakePusher().pusher, mailer }, AT_8)
    expect(mails).toHaveLength(0)
    expect(summary).toMatchObject({ emailed: 0, emailFailed: 0 })
    expect(markedEmail).toHaveLength(0)
  })

  it('sem conta a vencer, não manda e-mail mas marca o dia como conferido nos dois canais', async () => {
    const { store, marked, markedEmail } = fakeStore({ u1: { settings: WITH_EMAIL, bills: [bill({ dueDay: 25 })] } })
    const { mailer, sent: mails } = fakeMailer()
    await runAlerts(store, { pusher: fakePusher().pusher, mailer }, AT_8)
    expect(mails).toHaveLength(0)
    expect(marked).toEqual([['u1', '2026-11-09']])
    expect(markedEmail).toEqual([['u1', '2026-11-09']])
  })

  it('o e-mail só vai ao endereço confirmado de cada pessoa', async () => {
    const { store } = fakeStore({ a: { settings: WITH_EMAIL, recipient: 'ana@exemplo.com' }, b: { settings: WITH_EMAIL, recipient: 'beto@exemplo.com' } })
    const { mailer, sent: mails } = fakeMailer()
    await runAlerts(store, { pusher: fakePusher().pusher, mailer }, AT_8)
    expect(mails.map((m) => m.to).sort()).toEqual(['ana@exemplo.com', 'beto@exemplo.com'])
  })

  it('nome de conta com HTML é escapado no e-mail', async () => {
    const { store } = fakeStore({ u1: { subs: [], settings: WITH_EMAIL, bills: [bill({ name: '<img src=x onerror=alert(1)> & Cia' })] } })
    const { mailer, sent: mails } = fakeMailer()
    await runAlerts(store, { pusher: fakePusher().pusher, mailer }, AT_8)
    expect(mails[0].mail.html).not.toContain('<img')
    expect(mails[0].mail.html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; Cia')
  })
})

describe('runAlerts: notificação desligada', () => {
  it('com a notificação desligada, os aparelhos não recebem, mesmo ativados', async () => {
    const { store, marked } = fakeStore({ u1: { settings: { ...DEFAULT_ALERTS, push: false } } })
    const { pusher, sent } = fakePusher()
    const summary = await runAlerts(store, { pusher }, AT_8)
    expect(sent).toHaveLength(0)
    expect(summary).toMatchObject({ users: 0, sent: 0 })
    expect(marked).toHaveLength(0)
  })

  it('só e-mail: o e-mail sai e a notificação não', async () => {
    const { store, markedEmail, marked } = fakeStore({ u1: { settings: { ...DEFAULT_ALERTS, push: false, email: true } } })
    const { pusher, sent } = fakePusher()
    const { mailer, sent: mails } = fakeMailer()
    const summary = await runAlerts(store, { pusher, mailer }, AT_8)
    expect(sent).toHaveLength(0)
    expect(mails).toHaveLength(1)
    expect(summary).toMatchObject({ users: 1, sent: 0, emailed: 1 })
    expect(marked).toHaveLength(0)
    expect(markedEmail).toHaveLength(1)
  })

  it('religar a notificação no mesmo dia ainda avisa, pois o dia dela não foi marcado', async () => {
    const users: Record<string, UserFixture> = { u1: { settings: { ...DEFAULT_ALERTS, push: false } } }
    const { store } = fakeStore(users)
    const { pusher, sent } = fakePusher()
    await runAlerts(store, { pusher }, AT_8)
    expect(sent).toHaveLength(0)
    users.u1.settings = { ...DEFAULT_ALERTS }
    await runAlerts(store, { pusher }, AT_15)
    expect(sent).toHaveLength(1)
  })
})

describe('sendTestEmail', () => {
  const NOW = 1_800_000_000_000

  it('manda ao e-mail confirmado do login e anota o horário', async () => {
    const { store, testMarks } = fakeStore({ u1: {} })
    const { mailer, sent: mails } = fakeMailer()
    expect(await sendTestEmail(store, mailer, 'u1', APP, NOW)).toEqual({ status: 'sent' })
    expect(mails[0].to).toBe('u1@exemplo.com')
    expect(mails[0].mail.subject).toBe('Aviso de teste do Contas em Dia')
    expect(mails[0].mail.html).toContain(`href="${APP}"`)
    expect(testMarks).toEqual([['u1', NOW]])
  })

  it('e-mail não confirmado: não manda', async () => {
    const { store } = fakeStore({ u1: { recipient: null } })
    const { mailer, sent: mails } = fakeMailer()
    expect(await sendTestEmail(store, mailer, 'u1', APP, NOW)).toEqual({ status: 'unverified' })
    expect(mails).toHaveLength(0)
  })

  it('dentro de um minuto do último teste, pede para aguardar', async () => {
    const { store } = fakeStore({ u1: { lastTestEmail: NOW - 20_000 } })
    const { mailer, sent: mails } = fakeMailer()
    expect(await sendTestEmail(store, mailer, 'u1', APP, NOW)).toEqual({ status: 'wait', seconds: 40 })
    expect(mails).toHaveLength(0)
  })

  it('passado o minuto, manda de novo', async () => {
    const { store } = fakeStore({ u1: { lastTestEmail: NOW - TEST_EMAIL_COOLDOWN_MS } })
    const { mailer, sent: mails } = fakeMailer()
    expect(await sendTestEmail(store, mailer, 'u1', APP, NOW)).toEqual({ status: 'sent' })
    expect(mails).toHaveLength(1)
  })

  it('serviço recusou ou caiu: falhou', async () => {
    const a = fakeStore({ u1: {} })
    expect(await sendTestEmail(a.store, fakeMailer('error').mailer, 'u1', APP, NOW)).toEqual({ status: 'failed' })
    const b = fakeStore({ u1: {} })
    expect(await sendTestEmail(b.store, fakeMailer('throw').mailer, 'u1', APP, NOW)).toEqual({ status: 'failed' })
  })
})
