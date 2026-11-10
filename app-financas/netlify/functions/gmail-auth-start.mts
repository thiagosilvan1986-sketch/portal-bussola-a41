import { adminDb } from '../lib/admin'
import { buildAuthUrl } from '../lib/google'
import { appOrigin, authedUid, env, errorResponse, json } from '../lib/http'
import { signState } from '../lib/state'

/** Passo 1 da conexão com o Gmail: devolve o endereço do Google para onde o app deve levar o usuário. */
export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)
  try {
    const uid = await authedUid(req)
    adminDb() // falha cedo se a conta de serviço do Firebase não estiver configurada
    const url = buildAuthUrl({
      clientId: env('GOOGLE_CLIENT_ID'),
      redirectUri: `${appOrigin(req)}/.netlify/functions/gmail-callback`,
      state: signState(uid, env('OAUTH_STATE_SECRET')),
    })
    return json({ url })
  } catch (e) {
    return errorResponse(e)
  }
}
