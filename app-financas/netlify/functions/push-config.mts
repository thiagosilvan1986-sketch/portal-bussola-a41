import { adminDb } from '../lib/admin'
import { errorResponse, json } from '../lib/http'
import { mailerConfig } from '../lib/mailer'
import { serverVapid } from '../lib/push-service'

/** O app pergunta aqui se os avisos estão ligados no servidor, pega a chave pública e fica sabendo se o e-mail está configurado. */
export default async (req: Request): Promise<Response> => {
  if (req.method !== 'GET') return json({ error: 'Método não permitido.' }, 405)
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return json({ error: 'not_configured' }, 503)
  try {
    adminDb()
    return json({ publicKey: (await serverVapid()).publicKey, email: mailerConfig() !== null })
  } catch (e) {
    return errorResponse(e)
  }
}
