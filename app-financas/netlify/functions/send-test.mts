import { adminDb } from '../lib/admin'
import { sendTest } from '../lib/alerts-run'
import { firestoreStore } from '../lib/firestore-store'
import { authedUid, errorResponse, json } from '../lib/http'
import { serverVapid, webPushSender } from '../lib/push-service'

/** Botão "Enviar aviso de teste": manda agora uma notificação a todos os aparelhos de quem chamou. */
export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return json({ error: 'O servidor de avisos ainda não foi configurado.' }, 503)
  try {
    const uid = await authedUid(req)
    const store = firestoreStore(adminDb())
    const result = await sendTest(store, webPushSender(await serverVapid()), uid)
    if (result.total === 0) return json({ error: 'Ative os avisos neste aparelho primeiro.' }, 409)
    return json(result)
  } catch (e) {
    return errorResponse(e)
  }
}
