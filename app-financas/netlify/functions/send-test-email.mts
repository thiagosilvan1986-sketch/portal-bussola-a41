import { adminDb } from '../lib/admin'
import { sendTestEmail } from '../lib/alerts-run'
import { firestoreStore } from '../lib/firestore-store'
import { authedUid, errorResponse, json } from '../lib/http'
import { serverMailer } from '../lib/mailer'

/** Botão "Enviar e-mail de teste": manda agora ao e-mail do login de quem chamou (nunca a outro endereço). */
export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  const mailer = serverMailer()
  if (!process.env.FIREBASE_SERVICE_ACCOUNT || !mailer) return json({ error: 'O envio por e-mail ainda não foi configurado neste site.' }, 503)
  try {
    const uid = await authedUid(req)
    const result = await sendTestEmail(firestoreStore(adminDb()), mailer, uid)
    switch (result.status) {
      case 'sent':
        return json({ sent: true })
      case 'unverified':
        return json({ error: 'Confirme o seu e-mail primeiro.' }, 409)
      case 'wait':
        return json({ error: `Aguarde ${result.seconds} segundos para pedir outro e-mail de teste.` }, 429)
      default:
        return json({ error: 'O serviço de e-mail não aceitou o envio. Confira a chave e o remetente no Brevo.' }, 502)
    }
  } catch (e) {
    return errorResponse(e)
  }
}
