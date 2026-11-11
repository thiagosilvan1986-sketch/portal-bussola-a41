import type { Config } from '@netlify/functions'
import { adminDb } from '../lib/admin'
import { runAlerts } from '../lib/alerts-run'
import { firestoreStore } from '../lib/firestore-store'
import { serverVapid, webPushSender } from '../lib/push-service'

/** Roda sozinha no começo de cada hora e manda os avisos de vencimento de quem já passou do horário escolhido. */
export default async (): Promise<void> => {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('send-alerts: FIREBASE_SERVICE_ACCOUNT não configurada; nada a fazer.')
    return
  }
  const summary = await runAlerts(firestoreStore(adminDb()), webPushSender(await serverVapid()))
  console.log('send-alerts', JSON.stringify(summary))
}

export const config: Config = { schedule: '0 * * * *' }
