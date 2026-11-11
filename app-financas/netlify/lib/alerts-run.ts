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

/** O que o envio precisa ler e gravar. A versão de verdade usa o Firestore; nos testes entra uma de mentira. */
export interface AlertsStore {
  allSubscriptions(): Promise<Map<string, PushSub[]>>
  subscriptionsOf(uid: string): Promise<PushSub[]>
  removeSubscription(uid: string, id: string): Promise<void>
  settings(uid: string): Promise<AlertSettings>
  lastSent(uid: string): Promise<IsoDate | null>
  markSent(uid: string, date: IsoDate): Promise<void>
  bills(uid: string): Promise<Bill[]>
  entries(uid: string, competences: string[]): Promise<Entry[]>
}

export interface RunSummary {
  /** Pessoas cujo horário de aviso chegou. */
  users: number
  /** Contas a vencer encontradas nessas pessoas. */
  due: number
  sent: number
  removed: number
  failed: number
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
 * prazos marcados e manda uma única notificação com todas. Marca o dia como enviado (para não repetir) quando entregou
 * ou quando não havia nada a avisar; se tudo falhou, deixa sem marcar e tenta de novo na próxima hora.
 */
export async function runAlerts(store: AlertsStore, pusher: Pusher, now: Date = new Date()): Promise<RunSummary> {
  const today = todayInSaoPaulo(now)
  const hour = hourInSaoPaulo(now)
  const summary: RunSummary = { users: 0, due: 0, sent: 0, removed: 0, failed: 0 }

  for (const [uid, subs] of await store.allSubscriptions()) {
    try {
      const settings = await store.settings(uid)
      if (!isAlertTime(settings, hour, today, await store.lastSent(uid))) continue
      summary.users++

      const [bills, entries] = await Promise.all([store.bills(uid), store.entries(uid, alertCompetences(today, settings.days))])
      const items = upcomingDue(bills, entries, today, settings.days)
      const payload = alertPayload(items)
      if (!payload) {
        await store.markSent(uid, today)
        continue
      }

      summary.due += items.length
      const delivery = await deliver(store, pusher, uid, subs, payload)
      summary.sent += delivery.sent
      summary.removed += delivery.removed
      summary.failed += delivery.failed
      if (delivery.sent > 0 || delivery.failed === 0) await store.markSent(uid, today)
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
