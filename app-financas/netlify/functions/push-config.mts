import { adminDb } from '../lib/admin'
import { errorResponse, json } from '../lib/http'
import { serverVapid } from '../lib/push-service'

/** O app pergunta aqui se os avisos com o app fechado estão ligados no servidor e pega a chave pública. */
export default async (req: Request): Promise<Response> => {
  if (req.method !== 'GET') return json({ error: 'Método não permitido.' }, 405)
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return json({ error: 'not_configured' }, 503)
  try {
    adminDb()
    return json({ publicKey: (await serverVapid()).publicKey })
  } catch (e) {
    return errorResponse(e)
  }
}
