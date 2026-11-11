import {
  TEST_PAYLOAD,
  alertCompetences,
  alertPayload,
  isAlertTime,
  upcomingDue,
  type AlertSettings,
  type PushPayload,
} from '../../src/domain/alerts'
import { hourInSaoPaulo, todayInSaoPaulo } from '../../src/domain/dates'
import type { Bill, Entry, IsoDate } from '../../src/domain/types'
import { alertEmail, testEmail } from './email-content'
import type { Mailer } from './mailer'
import { siteUrl } from './site'

/** Um aparelho inscrito para receber avisos. */
export interface PushSub {
  id: string
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** ok = entregue ao serviço de notificação; gone = o aparelho não existe mais (404/410); error = falha que pode passar sozinha. */
export type SendResult = 'ok' | 'gone' | 'error'

export interface Pusher {
  send(sub: PushSub, payload: PushPayload): Promise<SendResult>
}

/** Cada canal tem o próprio "já avisei hoje", para que a falha de um não cancele nem repita o outro. */
export type Channel = 'push' | 'email'

/** O que o envio precisa ler e gravar. A versão de verdade usa o Firestore; nos testes entra uma de mentira. */
export interface AlertsStore {
  allSubscriptions(): Promise<Map<string, PushSub[]>>
  subscriptionsOf(uid: string): Promise<PushSub[]>
  removeSubscription(uid: string, id: string): Promise<void>
  /** Quem marcou "Avisar por e-mail". */
  emailUsers(): Promise<string[]>
  /** E-mail do login, só se já estiver confirmado. */
  recipient(uid: string): Promise<string | null>
  settings(uid: string): Promise<AlertSettings>
  lastSent(uid: string, channel: Channel): Promise<IsoDate | null>
  markSent(uid: string, date: IsoDate, channel: Channel): Promise<void>
  /** Quando saiu o último e-mail de teste (milissegundos), para não deixar o botão ser usado em sequência. */
  lastTestEmail(uid: string): Promise<number | null>
  markTestEmail(uid: string, at: number): Promise<void>
  bills(uid: string): Promise<Bill[]>
  entries(uid: string, competences: string[]): Promise<Entry[]>
}

/** Os meios de envio disponíveis. Sem `mailer`, o e-mail está desligado neste site. */
export interface Channels {
  pusher: Pusher
  mailer?: Mailer | null
  /** Endereço do app nos links do e-mail. */
  appUrl?: string
}

export interface RunSummary {
  /** Pessoas cujo horário de aviso chegou. */
  users: number
  /** Contas a vencer encontradas nessas pessoas. */
  due: number
  sent: number
  removed: number
  failed: number
  /** E-mails entregues ao serviço de envio. */
  emailed: number
  emailFailed: number
}

interface Delivery {
  sent: number
  removed: number
  failed: number
}

async function deliver(store: AlertsStore, pusher: Pusher, uid: string, subs: PushSub[], payload: PushPayload): Promise<Delivery> {
  const results = await Promise.all(subs.map(async (sub) => ({ sub, result: await pusher.send(sub, payload).catch((): SendResult => 'error') })))
  const out: Delivery = { sent: 0, removed: 0, failed: 0 }
  for (const { sub, result } of results) {
    if (result === 'ok') out.sent++
    else if (result === 'gone') {
      out.removed++
      await store.removeSubscription(uid, sub.id).catch((e) => console.error('alertas: não removeu inscrição', e))
    } else out.failed++
  }
  return out
}

/**
 * Passo de cada hora: para quem já passou da hora escolhida e ainda não recebeu hoje, olha as contas que vencem nos
 * prazos marcados e manda uma única notificação (e um único e-mail, se a pessoa quiser) com todas. Cada canal marca o
 * dia como enviado quando entregou ou quando não havia nada a avisar; se tudo falhou, deixa sem marcar e tenta de novo
 * na próxima hora.
 */
export async function runAlerts(store: AlertsStore, channels: Channels, now: Date = new Date()): Promise<RunSummary> {
  const { pusher, mailer = null, appUrl = siteUrl() } = channels
  const today = todayInSaoPaulo(now)
  const hour = hourInSaoPaulo(now)
  const summary: RunSummary = { users: 0, due: 0, sent: 0, removed: 0, failed: 0, emailed: 0, emailFailed: 0 }

  const subscriptions = await store.allSubscriptions()
  const uids = new Set([...subscriptions.keys(), ...(mailer ? await store.emailUsers() : [])])

  for (const uid of uids) {
    try {
      const settings = await store.settings(uid)
      const subs = subscriptions.get(uid) ?? []
      const pushDue = settings.push && subs.length > 0 && isAlertTime(settings, hour, today, await store.lastSent(uid, 'push'))
      const emailDue = mailer !== null && settings.email && isAlertTime(settings, hour, today, await store.lastSent(uid, 'email'))
      if (!pushDue && !emailDue) continue
      summary.users++

      const [bills, entries] = await Promise.all([store.bills(uid), store.entries(uid, alertCompetences(today, settings.days))])
      const items = upcomingDue(bills, entries, today, settings.days)
      const payload = alertPayload(items)
      if (!payload) {
        if (pushDue) await store.markSent(uid, today, 'push')
        if (emailDue) await store.markSent(uid, today, 'email')
        continue
      }
      summary.due += items.length

      if (pushDue) {
        try {
          const delivery = await deliver(store, pusher, uid, subs, payload)
          summary.sent += delivery.sent
          summary.removed += delivery.removed
          summary.failed += delivery.failed
          if (delivery.sent > 0 || delivery.failed === 0) await store.markSent(uid, today, 'push')
        } catch (e) {
          summary.failed++
          console.error(`alertas: falha na notificação de ${uid}`, e)
        }
      }

      if (emailDue && mailer) {
        try {
          // Sem e-mail confirmado não há para quem mandar; fica sem marcar e vale de novo se a pessoa confirmar ainda hoje.
          const to = await store.recipient(uid)
          if (to) {
            const result = await mailer.send(to, alertEmail(items, appUrl)).catch((): 'error' => 'error')
            if (result === 'ok') {
              summary.emailed++
              await store.markSent(uid, today, 'email')
            } else summary.emailFailed++
          }
        } catch (e) {
          summary.emailFailed++
          console.error(`alertas: falha no e-mail de ${uid}`, e)
        }
      }
    } catch (e) {
      summary.failed++
      console.error(`alertas: falha ao tratar o usuário ${uid}`, e)
    }
  }
  return summary
}

/** Botão "Enviar aviso de teste": manda agora para todos os aparelhos da pessoa. */
export async function sendTest(store: AlertsStore, pusher: Pusher, uid: string): Promise<{ sent: number; total: number }> {
  const subs = await store.subscriptionsOf(uid)
  const delivery = await deliver(store, pusher, uid, subs, TEST_PAYLOAD)
  return { sent: delivery.sent, total: subs.length }
}

/** Intervalo mínimo entre dois e-mails de teste da mesma pessoa. */
export const TEST_EMAIL_COOLDOWN_MS = 60_000

export type TestEmailResult =
  | { status: 'sent' }
  | { status: 'unverified' }
  | { status: 'wait'; seconds: number }
  | { status: 'failed' }

/** Botão "Enviar e-mail de teste": manda ao e-mail do login, se confirmado, e no máximo uma vez por minuto. */
export async function sendTestEmail(
  store: AlertsStore,
  mailer: Mailer,
  uid: string,
  appUrl: string = siteUrl(),
  now: number = Date.now(),
): Promise<TestEmailResult> {
  const to = await store.recipient(uid)
  if (!to) return { status: 'unverified' }
  const last = await store.lastTestEmail(uid)
  if (last !== null && now - last < TEST_EMAIL_COOLDOWN_MS) return { status: 'wait', seconds: Math.ceil((TEST_EMAIL_COOLDOWN_MS - (now - last)) / 1000) }
  await store.markTestEmail(uid, now)
  return (await mailer.send(to, testEmail(appUrl)).catch((): 'error' => 'error')) === 'ok' ? { status: 'sent' } : { status: 'failed' }
}
