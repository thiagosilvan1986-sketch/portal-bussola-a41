import * as webpush from 'web-push'
import type { PushPayload } from '../../src/domain/alerts'
import { adminDb } from './admin'
import type { Pusher, SendResult } from './alerts-run'
import { siteUrl } from './site'
import { firestoreVapidStore, loadVapid, type Vapid } from './vapid'

export function generateVapid(): Vapid {
  return webpush.generateVAPIDKeys()
}

/** Endereço de contato que os serviços de notificação exigem junto da chave. */
export function vapidSubject(): string {
  return process.env.VAPID_SUBJECT || siteUrl()
}

/** As chaves do servidor (criadas na primeira vez). */
export function serverVapid(): Promise<Vapid> {
  return loadVapid(firestoreVapidStore(adminDb()), generateVapid)
}

export function webPushSender(vapid: Vapid): Pusher {
  const options = { vapidDetails: { subject: vapidSubject(), publicKey: vapid.publicKey, privateKey: vapid.privateKey } }
  return {
    async send(sub, payload: PushPayload): Promise<SendResult> {
      try {
        // Se o aparelho estiver desligado, o serviço guarda o aviso por até 12 horas.
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), {
          ...options,
          TTL: 12 * 60 * 60,
          urgency: 'high',
        })
        return 'ok'
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) return 'gone'
        console.error('alertas: envio falhou', status ?? e)
        return 'error'
      }
    },
  }
}
